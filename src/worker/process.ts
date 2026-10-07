import { config } from "@/config";
import {
  RESTAURANT_REPORT,
  completeJob,
  failJob,
  reportExists,
  type ClaimedJob,
} from "@/lib/jobs";
import { buildRestaurantReport } from "@/lib/restaurant-report";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Does the work for a claimed job. Returns summary=null when the report already exists. */
async function runWork(job: ClaimedJob) {
  if (job.type !== RESTAURANT_REPORT) throw new Error(`Unknown job type: ${job.type}`);
  const restaurantId = job.payload.restaurantId;
  if (!restaurantId) throw new Error("Payload is missing restaurantId");

  // Idempotent: a report for this job may already exist from an earlier run.
  if (await reportExists(job.id)) return { restaurantId, summary: null };

  if (Math.random() < config.worker.failureInjectionRate) {
    throw new Error("Injected failure (failureInjectionRate)");
  }
  if (config.worker.simulatedWorkMs > 0) {
    await sleep(config.worker.simulatedWorkMs);
    const summary = {
      restaurantName: "simulated",
      orderCount: 0,
      revenueMinor: 0,
      countsByStatus: {},
      pages: 0,
      simulated: true,
    };
    return { restaurantId, summary };
  }
  return { restaurantId, summary: await buildRestaurantReport(restaurantId) };
}

export type Outcome =
  | { kind: "succeeded"; applied: boolean }
  | { kind: "failed"; attempts: number; dead: boolean; message: string };

/** Runs one claimed job to completion or failure and records the result. */
export async function processJob(job: ClaimedJob, workerId: string): Promise<Outcome> {
  try {
    const { restaurantId, summary } = await runWork(job);
    const applied = await completeJob(job.id, workerId, summary ? { restaurantId, summary } : null);
    return { kind: "succeeded", applied };
  } catch (err) {
    const outcome = await failJob(job, workerId, err);
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "failed", attempts: outcome.attempts, dead: outcome.dead, message };
  }
}
