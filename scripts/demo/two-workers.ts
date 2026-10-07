// Test e: two workers, one queue of 50 jobs; each job is claimed by exactly one worker.
// Uses simulated slow-work mode (500 ms per job). Claims are read from the workers' logs,
// because lockedBy is cleared when a job finishes.
import { assertQueueIsOurs, enqueueMany, finish, heading, pickRestaurantId, prisma, resetDemoJobs, say, startWorker, verdict, waitFor } from "./lib";

const JOBS = 50;

async function main() {
  heading(`Test e: two workers, ${JOBS} jobs (simulated work 500 ms)`);
  await assertQueueIsOurs();
  await resetDemoJobs();
  const ids = await enqueueMany("demo-two-workers", JOBS, await pickRestaurantId());
  say(`enqueued ${JOBS} jobs`);

  const settings = { worker: { simulatedWorkMs: 500, pollIntervalMs: 200 } };
  const w1 = startWorker("worker-1", settings, false);
  const w2 = startWorker("worker-2", settings, false);
  await waitFor(
    async () => (await prisma.job.count({ where: { idempotencyKey: { startsWith: "demo-two-workers" }, status: "succeeded" } })) === JOBS,
    120_000, 500, "all jobs to succeed",
  );

  const claims = new Map<string, string[]>();
  for (const w of [w1, w2]) {
    for (const line of w.lines) {
      const m = /job ([0-9a-f-]{36}) started/.exec(line);
      if (m) claims.set(m[1], [...(claims.get(m[1]) ?? []), w.label]);
    }
  }
  const perWorker = (label: string) => [...claims.values()].filter((c) => c.includes(label)).length;
  const multiClaimed = [...claims.entries()].filter(([, c]) => c.length !== 1);
  const unclaimed = ids.filter((id) => !claims.has(id));
  const reports = await prisma.report.count({ where: { job: { idempotencyKey: { startsWith: "demo-two-workers" } } } });
  const succeeded = await prisma.job.count({ where: { idempotencyKey: { startsWith: "demo-two-workers" }, status: "succeeded" } });

  heading("Result");
  say(`claims by worker-1: ${perWorker("worker-1")}   by worker-2: ${perWorker("worker-2")}   total: ${claims.size}`);
  say(`jobs claimed more than once: ${multiClaimed.length}   jobs never claimed: ${unclaimed.length}`);
  say(`succeeded jobs: ${succeeded}   reports: ${reports}`);
  const ok = verdict(multiClaimed.length === 0 && unclaimed.length === 0 && claims.size === JOBS, "every job was claimed by exactly one worker") &&
    verdict(perWorker("worker-1") > 0 && perWorker("worker-2") > 0, "both workers did real work") &&
    verdict(reports === succeeded, "number of reports equals number of succeeded jobs");
  await finish([w1, w2], !ok);
}
void main().catch((err) => { console.error(err); void finish([], true); });
