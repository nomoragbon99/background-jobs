// Happy path end to end: HTTP enqueue -> worker -> live API -> report. Real work, no simulation.
// Needs the dev server running (npm run dev). Starts its own worker.
import { APP_BASE, API_BASE, assertQueueIsOurs, finish, heading, pickRestaurantId, request, resetDemoJobs, say, startWorker, verdict, waitFor } from "./lib";

async function api<T>(path: string, init?: Parameters<typeof request>[1]) {
  const res = await request(`${APP_BASE}${path}`, init);
  return { status: res.status, body: (await res.json()) as T };
}

type JobBody = { data: { id: string; status: string; attempts: number; lastError: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; report: { summary: Record<string, unknown> } | null } };

async function main() {
  heading("Happy path: enqueue over HTTP, the worker does the work");
  await assertQueueIsOurs();
  await resetDemoJobs();
  const restaurantId = await pickRestaurantId();
  const worker = startWorker("worker", {});

  const post = (key: string) => api<{ data: { id: string; created: boolean } }>("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "demo-user", restaurantId, idempotencyKey: key }),
  });
  const t0 = Date.now();
  const created = await post("demo-happy-path");
  say(`POST /api/jobs -> HTTP ${created.status} in ${Date.now() - t0} ms (returned before any work), job ${created.body.data.id}`);
  const id = created.body.data.id;

  await waitFor(async () => (await api<JobBody>(`/api/jobs/${id}`)).body.data.status === "succeeded", 90_000, 500, "job to succeed");
  const job = await api<JobBody>(`/api/jobs/${id}`);
  say(`GET /api/jobs/${id} -> HTTP ${job.status}`);
  console.log(JSON.stringify(job.body.data, null, 2));

  const totals = await request(`${API_BASE}/orders?restaurantId=${restaurantId}&limit=1`);
  const liveTotal = ((await totals.json()) as { meta: { total: number } }).meta.total;
  const summary = job.body.data.report!.summary as { orderCount: number; countsByStatus: Record<string, number> };
  const statusSum = Object.values(summary.countsByStatus).reduce((a, b) => a + b, 0);
  const repeat = await post("demo-happy-path");

  heading("Result");
  const ok = verdict(summary.orderCount === liveTotal, `orderCount ${summary.orderCount} equals the live API's meta.total ${liveTotal}`) &&
    verdict(statusSum === summary.orderCount, "per-status counts add up to the order count") &&
    verdict(repeat.body.data.id === id && !repeat.body.data.created, "repeating the idempotency key returns the same job");
  await finish([worker], !ok);
}
void main().catch((err) => { console.error(`${err}\n(is the dev server running at ${APP_BASE}? start it with npm run dev)`); void finish([], true); });
