import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { config } from "@/config";
import { prisma } from "@/lib/db";
import {
  RESTAURANT_REPORT,
  claimJob,
  completeJob,
  failJob,
  reportExists,
  sweepStuckJobs,
  type ClaimedJob,
} from "@/lib/jobs";
import { buildRestaurantReport } from "@/lib/restaurant-report";

const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
let active = 0;
let stopping = false;

const log = (message: string) => console.log(`${new Date().toISOString()} [${workerId}] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWork(job: ClaimedJob) {
  if (job.type !== RESTAURANT_REPORT) throw new Error(`Unknown job type: ${job.type}`);
  const restaurantId = job.payload.restaurantId;
  if (!restaurantId) throw new Error("Payload is missing restaurantId");

  // Idempotent: a report for this job may already exist from an earlier run.
  if (await reportExists(job.id)) return { restaurantId, summary: null };

  if (Math.random() < config.worker.failureInjectionRate) {
    throw new Error("Injected failure (failureInjectionRate)");
  }
  const summary = await buildRestaurantReport(restaurantId);
  return { restaurantId, summary };
}

async function handle(job: ClaimedJob) {
  try {
    const { restaurantId, summary } = await runWork(job);
    const ok = await completeJob(job.id, workerId, summary ? { restaurantId, summary } : null);
    log(`job ${job.id} ${ok ? "succeeded" : "result discarded (no longer ours)"}`);
  } catch (err) {
    const outcome = await failJob(job, workerId, err);
    const message = err instanceof Error ? err.message : String(err);
    const next = outcome.dead ? "dead" : "retry scheduled";
    log(`job ${job.id} failed (attempt ${outcome.attempts}/${job.maxAttempts}, ${next}): ${message}`);
  }
}

async function fill() {
  while (!stopping && active < config.worker.concurrency) {
    const job = await claimJob(workerId);
    if (!job) return;
    active += 1;
    log(`job ${job.id} started, active=${active}/${config.worker.concurrency}`);
    void handle(job)
      .catch((err) => log(`job ${job.id} bookkeeping error: ${err}`))
      .finally(() => {
        active -= 1;
        log(`job ${job.id} finished, active=${active}/${config.worker.concurrency}`);
        void fill().catch((err) => log(`fill error: ${err}`));
      });
  }
}

async function poll() {
  while (!stopping) {
    try {
      await fill();
    } catch (err) {
      log(`poll error: ${err}`);
    }
    await sleep(config.worker.pollIntervalMs);
  }
}

async function sweepLoop() {
  while (!stopping) {
    try {
      for (const row of await sweepStuckJobs()) {
        log(`swept stuck job ${row.id} -> ${row.status} (attempts=${row.attempts})`);
      }
    } catch (err) {
      log(`sweep error: ${err}`);
    }
    await sleep(config.worker.sweepIntervalMs);
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  log(`shutting down, waiting for ${active} active job(s)`);
  while (active > 0) await sleep(200);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

log(`worker started (concurrency=${config.worker.concurrency}, failureInjectionRate=${config.worker.failureInjectionRate})`);
void poll();
void sweepLoop();
