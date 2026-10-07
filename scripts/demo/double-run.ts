// Test f: execute the work twice for the same job id; exactly one report must exist.
// Runs in this process (no worker), in simulated work mode so the live API is not involved.
import { assertQueueIsOurs, enqueueMany, finish, heading, pickRestaurantId, printRow, prisma, resetDemoJobs, say, verdict } from "./lib";

async function main() {
  process.env.JOBS_CONFIG_OVERRIDE = JSON.stringify({ worker: { simulatedWorkMs: 200 } });
  const { claimJob } = await import("@/lib/jobs");
  const { processJob } = await import("@/worker/process");

  heading("Test f: the work runs twice for one job id");
  await assertQueueIsOurs();
  await resetDemoJobs();
  const [id] = await enqueueMany("demo-double-run", 1, await pickRestaurantId());

  const first = await claimJob("demo-worker-A");
  say(`run 1: claimed ${first?.id} as demo-worker-A -> ${JSON.stringify(await processJob(first!, "demo-worker-A"))}`);
  await printRow("after run 1", id);

  // A duplicate delivery: the job is put back to pending (as a sweep or a bad retry would) and run again.
  await prisma.job.update({ where: { id }, data: { status: "pending", finishedAt: null } });
  say("job put back to pending to force a second run");
  const second = await claimJob("demo-worker-B");
  say(`run 2: claimed ${second?.id} as demo-worker-B -> ${JSON.stringify(await processJob(second!, "demo-worker-B"))}`);
  await printRow("after run 2", id);

  // And the database itself refuses a second report for the same job, whatever the code does.
  let dbRefused = false;
  try {
    await prisma.report.create({ data: { jobId: id, restaurantId: "x", summary: {} } });
  } catch (err) {
    dbRefused = (err as { code?: string }).code === "P2002";
    say(`direct second insert refused by the database: Prisma error ${(err as { code?: string }).code} (unique constraint on jobId)`);
  }

  const reports = await prisma.report.count({ where: { jobId: id } });
  heading("Result");
  say(`reports for job ${id}: ${reports}`);
  const ok = verdict(reports === 1, "exactly one report after two runs") && verdict(dbRefused, "the unique constraint rejects a second report");
  await finish([], !ok);
}
void main().catch((err) => { console.error(err); void finish([], true); });
