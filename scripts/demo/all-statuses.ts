// Leaves the database holding one job in each status, for screenshots of /jobs and /dead.
// Rows are written directly so each status is held steady: no worker runs, the failed job's
// retry is an hour away, and the processing job only becomes "stuck" after the sweep timeout
// (2 minutes), and only if a worker is running. Do not start a worker while you take screenshots.
import { assertQueueIsOurs, finish, heading, pickRestaurantId, prisma, resetDemoJobs, say } from "./lib";

async function main() {
  heading("Seeding one job per status");
  await assertQueueIsOurs();
  await resetDemoJobs();
  const restaurantId = await pickRestaurantId();
  const now = Date.now();
  const earlier = new Date(now - 2 * 60_000);
  const base = { userId: "demo-user", type: "restaurant_report", payload: { restaurantId }, maxAttempts: 5 };

  await prisma.job.create({ data: { ...base, idempotencyKey: "demo-status-pending", status: "pending" } });
  await prisma.job.create({
    data: { ...base, idempotencyKey: "demo-status-processing", status: "processing", startedAt: new Date(now), lockedBy: "demo-host:0:seeded" },
  });
  const done = await prisma.job.create({
    data: { ...base, idempotencyKey: "demo-status-succeeded", status: "succeeded", attempts: 1, createdAt: earlier, startedAt: new Date(now - 4_000), finishedAt: new Date(now - 2_000) },
  });
  await prisma.report.create({
    data: { jobId: done.id, restaurantId, summary: { restaurantName: "seeded", orderCount: 0, revenueMinor: 0, countsByStatus: {}, pages: 0 } },
  });
  await prisma.job.create({
    data: {
      ...base, idempotencyKey: "demo-status-failed", status: "failed", attempts: 2, createdAt: earlier, startedAt: new Date(now - 30_000),
      lastError: "Rate limited (429), Retry-After=30s", runAt: new Date(now + 60 * 60_000),
    },
  });
  await prisma.job.create({
    data: {
      ...base, idempotencyKey: "demo-status-dead", status: "dead", attempts: 5, createdAt: earlier, startedAt: new Date(now - 60_000), finishedAt: new Date(now - 50_000),
      lastError: "Request timed out",
    },
  });

  const counts = await prisma.job.groupBy({ by: ["status"], _count: true, where: { idempotencyKey: { startsWith: "demo-status-" } } });
  for (const row of counts) say(`${row.status.padEnd(10)} ${row._count}`);
  say("done. open http://localhost:3000/jobs and http://localhost:3000/dead");
  await finish();
}
void main().catch((err) => { console.error(err); void finish([], true); });
