import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { config } from "@/config";
import { prisma } from "@/lib/db";
import { claimJob, sweepStuckJobs, type ClaimedJob } from "@/lib/jobs";
import { processJob } from "@/worker/process";

const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
let active = 0;
let stopping = false;

const log = (message: string) => console.log(`${new Date().toISOString()} [${workerId}] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handle(job: ClaimedJob) {
  const outcome = await processJob(job, workerId);
  if (outcome.kind === "succeeded") {
    log(`job ${job.id} ${outcome.applied ? "succeeded" : "result discarded (no longer ours)"}`);
  } else {
    const next = outcome.dead ? "dead" : "retry scheduled";
    log(`job ${job.id} failed (attempt ${outcome.attempts}/${job.maxAttempts}, ${next}): ${outcome.message}`);
  }
}

async function fill() {
  while (!stopping && active < config.worker.concurrency) {
    // Reserve the slot before the await. fill() is entered from the poll loop and
    // from every job's finish handler; checking first and incrementing after the
    // claim let several callers pass the check at once and overshoot the cap.
    active += 1;
    let job: ClaimedJob | null;
    try {
      job = await claimJob(workerId);
    } catch (err) {
      active -= 1;
      throw err;
    }
    if (!job) {
      active -= 1;
      return;
    }
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

log(
  `worker started (concurrency=${config.worker.concurrency}, failureInjectionRate=${config.worker.failureInjectionRate}, simulatedWorkMs=${config.worker.simulatedWorkMs})`,
);
void poll();
void sweepLoop();
