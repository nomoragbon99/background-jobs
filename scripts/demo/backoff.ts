// Test b: failure rate 1.0; follow one job through every attempt to dead.
// Real backoff delays (config defaults); no simulated work needed, attempts fail before any API call.
import { assertQueueIsOurs, enqueueMany, finish, heading, pickRestaurantId, prisma, resetDemoJobs, say, sleep, startWorker, verdict } from "./lib";

async function main() {
  const { config } = await import("@/config");
  const { backoffBaseMs, backoffCapMs, jitterMin, jitterMax, maxAttempts } = config.jobs;
  heading("Test b: failure injection rate 1.0, one job from pending to dead");
  say(`backoff = min(${backoffCapMs}ms, ${backoffBaseMs}ms * 2^(attempt-1)) * jitter[${jitterMin}..${jitterMax}], maxAttempts=${maxAttempts}`);
  await assertQueueIsOurs();
  await resetDemoJobs();

  const [id] = await enqueueMany("demo-backoff", 1, await pickRestaurantId());
  const enqueuedAt = (await prisma.job.findUniqueOrThrow({ where: { id } })).createdAt.getTime();
  say(`enqueued job ${id}`);

  const worker = startWorker("worker", { worker: { failureInjectionRate: 1, pollIntervalMs: 200 } }, false);
  const rows: { attempt: number; at: number; delay: number | null }[] = [];
  let seen = 0;
  let lastAt = enqueuedAt;
  console.log("\n  attempt  failed at (UTC)           gap since last   next retry in   (nominal, before jitter)   status");
  for (;;) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id } });
    if (job.attempts > seen) {
      seen = job.attempts;
      const at = job.updatedAt.getTime();
      const delay = job.status === "failed" ? job.runAt.getTime() - at : null;
      rows.push({ attempt: seen, at, delay });
      console.log(
        `  ${String(seen).padStart(7)}  ${job.updatedAt.toISOString()}  ${((at - lastAt) / 1000).toFixed(2).padStart(10)} s   ` +
          `${delay === null ? "          -  " : (delay / 1000).toFixed(2).padStart(10) + " s"}   ${(delay === null ? "-" : (Math.min(backoffCapMs, backoffBaseMs * 2 ** (seen - 1)) / 1000).toFixed(0) + " s").padStart(22)}   ${job.status}`,
      );
      lastAt = at;
    }
    if (job.status === "dead") break;
    await sleep(100);
  }
  const dead = await prisma.job.findUniqueOrThrow({ where: { id } });
  heading("Result");
  say(`final status=${dead.status} attempts=${dead.attempts}/${dead.maxAttempts}`);
  say(`lastError=${dead.lastError}`);
  const delays = rows.map((r) => r.delay).filter((d): d is number => d !== null);
  const withinBounds = delays.every((d, i) => {
    const nominal = Math.min(backoffCapMs, backoffBaseMs * 2 ** i);
    return d >= nominal * jitterMin - 1 && d <= nominal * jitterMax + 1;
  });
  const ok = verdict(dead.status === "dead" && dead.attempts === maxAttempts, `dead after exactly ${maxAttempts} attempts`) &&
    verdict(withinBounds, `every scheduled delay is within its jittered exponential bounds`);
  await finish([worker], !ok);
}
void main().catch((err) => { console.error(err); void finish([], true); });
