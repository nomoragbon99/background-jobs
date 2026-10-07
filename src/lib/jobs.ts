import { Prisma } from "@/generated/prisma/client";
import { config } from "@/config";
import { prisma } from "@/lib/db";
import { backoffDelayMs } from "@/lib/backoff";

export const RESTAURANT_REPORT = "restaurant_report";

export interface ClaimedJob {
  id: string;
  userId: string;
  type: string;
  payload: { restaurantId?: string };
  attempts: number;
  maxAttempts: number;
}

/** Writes a pending row. The unique idempotencyKey makes this safe under concurrent requests. */
export async function enqueueRestaurantReport(input: {
  userId: string;
  restaurantId: string;
  idempotencyKey: string;
}) {
  try {
    const job = await prisma.job.create({
      data: {
        userId: input.userId,
        type: RESTAURANT_REPORT,
        payload: { restaurantId: input.restaurantId },
        maxAttempts: config.jobs.maxAttempts,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { job, created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const job = await prisma.job.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      return { job, created: false };
    }
    throw err;
  }
}

/** Atomically claims one due job (pending or failed). Returns null when none is due. */
export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE jobs
    SET status = 'processing', "startedAt" = now(), "lockedBy" = ${workerId}, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status IN ('pending', 'failed') AND "runAt" <= now()
      ORDER BY "runAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "userId", type, payload, attempts, "maxAttempts"`;
  return rows[0] ?? null;
}

export async function reportExists(jobId: string): Promise<boolean> {
  return (await prisma.report.count({ where: { jobId } })) > 0;
}

/**
 * Writes the report and marks the job succeeded in one transaction. Guarded by
 * lockedBy so a worker whose job was swept and re-claimed cannot overwrite it;
 * createMany skipDuplicates is ON CONFLICT DO NOTHING on the unique jobId.
 * Pass report=null to only mark succeeded (the report already exists).
 */
export async function completeJob(
  jobId: string,
  workerId: string,
  report: { restaurantId: string; summary: Prisma.InputJsonValue } | null,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.job.updateMany({
      where: { id: jobId, status: "processing", lockedBy: workerId },
      data: { status: "succeeded", finishedAt: new Date(), lockedBy: null },
    });
    if (updated.count === 0) return false;
    if (report) {
      await tx.report.createMany({ data: [{ jobId, ...report }], skipDuplicates: true });
    }
    return true;
  });
}

/** Records a failed attempt: retry with backoff, or dead when attempts are exhausted. */
export async function failJob(job: ClaimedJob, workerId: string, error: unknown) {
  const attempts = job.attempts + 1;
  const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const exhausted = attempts >= job.maxAttempts;
  const result = await prisma.job.updateMany({
    where: { id: job.id, status: "processing", lockedBy: workerId },
    data: exhausted
      ? { status: "dead", attempts, lastError, finishedAt: new Date(), lockedBy: null }
      : {
          status: "failed",
          attempts,
          lastError,
          runAt: new Date(Date.now() + backoffDelayMs(attempts)),
          lockedBy: null,
        },
  });
  return { attempts, dead: exhausted, applied: result.count === 1 };
}

/** Returns jobs stuck in processing past the timeout to pending, or dead if exhausted. */
export async function sweepStuckJobs() {
  const cutoff = new Date(Date.now() - config.worker.stuckJobTimeoutMs);
  return prisma.$queryRaw<{ id: string; status: string; attempts: number }[]>`
    UPDATE jobs
    SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= "maxAttempts" THEN 'dead'::"JobStatus" ELSE 'pending'::"JobStatus" END,
        "lastError" = 'Swept: stuck in processing past the timeout',
        "finishedAt" = CASE WHEN attempts + 1 >= "maxAttempts" THEN now() ELSE NULL END,
        "lockedBy" = NULL,
        "updatedAt" = now()
    WHERE status = 'processing' AND "startedAt" < ${cutoff}
    RETURNING id, status, attempts`;
}

/** Moves a dead job back to pending with a fresh attempt budget. False if it was not dead. */
export async function retryDeadJob(id: string): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id, status: "dead" },
    data: { status: "pending", attempts: 0, runAt: new Date(), finishedAt: null, lockedBy: null },
  });
  return result.count === 1;
}
