// Test a: 50 jobs enqueued at once; the concurrent count must never exceed the cap.
// Uses simulated slow-work mode (1.5 s per job) so the live API is not hit 50 times.
import {
  assertQueueIsOurs, enqueueMany, finish, heading, pickRestaurantId, prisma, resetDemoJobs,
  say, sleep, startWorker, verdict, waitFor,
} from "./lib";

const JOBS = 50;
const WORK_MS = 1500;

async function main() {
  const { config } = await import("@/config");
  const cap = config.worker.concurrency;
  heading(`Test a: ${JOBS} jobs at once, concurrency cap ${cap} (simulated work ${WORK_MS} ms)`);
  await assertQueueIsOurs();
  await resetDemoJobs();

  await enqueueMany("demo-concurrency", JOBS, await pickRestaurantId());
  say(`enqueued ${JOBS} jobs, all pending`);

  const worker = startWorker("worker", { worker: { simulatedWorkMs: WORK_MS, pollIntervalMs: 200 } });
  let maxProcessing = 0;
  let stop = false;
  const sampler = (async () => {
    while (!stop) {
      const n = await prisma.job.count({ where: { status: "processing", idempotencyKey: { startsWith: "demo-concurrency" } } });
      maxProcessing = Math.max(maxProcessing, n);
      await sleep(50);
    }
  })();

  await waitFor(
    async () => (await prisma.job.count({ where: { idempotencyKey: { startsWith: "demo-concurrency" }, status: "succeeded" } })) === JOBS,
    120_000, 500, "all jobs to succeed",
  );
  stop = true;
  await sampler;

  const maxLogged = Math.max(...worker.lines.map((l) => Number(/active=(\d+)\//.exec(l)?.[1] ?? 0)));
  heading("Result");
  say(`highest active count in the worker log:        ${maxLogged}`);
  say(`highest rows in "processing" (DB, every 50ms): ${maxProcessing}`);
  say(`configured cap:                                ${cap}`);
  const ok = verdict(maxLogged <= cap && maxProcessing <= cap, `concurrency never exceeded ${cap}`) &&
    verdict(maxLogged === cap, `the cap was actually reached (not just trivially under it)`);
  await finish([worker], !ok);
}
void main().catch((err) => { console.error(err); void finish([], true); });
