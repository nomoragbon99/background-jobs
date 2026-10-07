// Test d: the same idempotency key twice, in sequence and simultaneously, over HTTP.
// Needs the dev server running (npm run dev). No worker is started, so jobs stay pending.
import { APP_BASE, assertQueueIsOurs, finish, heading, pickRestaurantId, prisma, request, resetDemoJobs, say, verdict } from "./lib";

async function post(restaurantId: string, key: string) {
  const res = await request(`${APP_BASE}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "demo-user", restaurantId, idempotencyKey: key }),
  });
  const body = (await res.json()) as { data: { id: string; created: boolean } };
  return { status: res.status, id: body.data.id, created: body.data.created };
}

async function main() {
  heading("Test d: idempotency key, sequential then simultaneous");
  await assertQueueIsOurs();
  await resetDemoJobs();
  const restaurantId = await pickRestaurantId();

  const seqKey = "demo-idem-sequential";
  const a = await post(restaurantId, seqKey);
  say(`sequential #1: HTTP ${a.status} id=${a.id} created=${a.created}`);
  const b = await post(restaurantId, seqKey);
  say(`sequential #2: HTTP ${b.status} id=${b.id} created=${b.created}`);
  const seqRows = await prisma.job.count({ where: { idempotencyKey: seqKey } });
  say(`rows with key "${seqKey}": ${seqRows}`);

  const parKey = "demo-idem-simultaneous";
  const N = 25;
  say(`firing ${N} simultaneous POSTs with key "${parKey}"`);
  const results = await Promise.all(Array.from({ length: N }, () => post(restaurantId, parKey)));
  const ids = new Set(results.map((r) => r.id));
  const created = results.filter((r) => r.created).length;
  say(`HTTP statuses: ${[...new Set(results.map((r) => r.status))].join(",")}  distinct ids returned: ${ids.size}  responses that created the row: ${created}`);
  const parRows = await prisma.job.count({ where: { idempotencyKey: parKey } });
  say(`rows with key "${parKey}": ${parRows}`);

  heading("Result");
  const ok = verdict(a.id === b.id && a.created && !b.created && seqRows === 1, "sequential: second call returned the first job, one row") &&
    verdict(ids.size === 1 && created === 1 && parRows === 1, `simultaneous: ${N} calls, one row, one creator`);
  await finish([], !ok);
}
void main().catch((err) => { console.error(`${err}\n(is the dev server running at ${APP_BASE}? start it with npm run dev)`); void finish([], true); });
