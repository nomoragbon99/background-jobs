// Test c: a worker dies mid-job; the sweep recovers the job and a new worker completes it.
// Uses simulated slow-work mode (a 60 s job for the doomed worker) and a short stuck timeout.
import { assertQueueIsOurs, enqueueMany, finish, heading, pickRestaurantId, printRow, prisma, resetDemoJobs, say, startWorker, verdict, waitFor } from "./lib";

const TIMEOUTS = { stuckJobTimeoutMs: 8_000, sweepIntervalMs: 2_000, pollIntervalMs: 300 };

async function main() {
  heading("Test c: stuck job (worker killed mid-job), stuck timeout 8 s, sweep every 2 s");
  await assertQueueIsOurs();
  await resetDemoJobs();
  const [id] = await enqueueMany("demo-stuck", 1, await pickRestaurantId());

  const first = startWorker("worker-1", { worker: { ...TIMEOUTS, simulatedWorkMs: 60_000 } });
  await waitFor(async () => (await prisma.job.findUniqueOrThrow({ where: { id } })).status === "processing", 20_000, 200, "job to start processing");
  await printRow("1. BEFORE KILL: the slow job is processing", id);

  say("killing worker-1 (SIGKILL, no graceful shutdown)");
  await first.kill();
  await printRow("2. AFTER KILL: nothing is working on it, but it is still marked processing", id);

  say("starting worker-2; the sweeper should return the job to pending once it has been processing > 8 s");
  const second = startWorker("worker-2", { worker: { ...TIMEOUTS, simulatedWorkMs: 1_000 } });
  await waitFor(async () => (await prisma.job.findUniqueOrThrow({ where: { id } })).status === "succeeded", 60_000, 250, "job to be recovered and succeed");
  await printRow("3. RECOVERED: swept back to pending, claimed by worker-2, completed", id);

  const job = await prisma.job.findUniqueOrThrow({ where: { id } });
  const reports = await prisma.report.count({ where: { jobId: id } });
  const swept = second.lines.some((l) => l.includes("swept stuck job"));
  heading("Result");
  const ok = verdict(swept, "worker-2's log shows the sweep") &&
    verdict(job.status === "succeeded" && job.attempts === 1, "succeeded, with the sweep counted as one attempt") &&
    verdict(reports === 1, "exactly one report");
  await finish([first, second], !ok);
}
void main().catch((err) => { console.error(err); void finish([], true); });
