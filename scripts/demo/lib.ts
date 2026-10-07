/**
 * Shared helpers for the demo scripts (npm run demo:<name>).
 *
 * Every demo creates only rows whose idempotencyKey starts with "demo-", and
 * deletes those rows when it starts. Demos start their own worker processes,
 * so stop any worker you started yourself first, or it will claim demo jobs too.
 */
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { prisma } from "@/lib/db";
import { request } from "@/lib/http";

export { prisma, request };

export const API_BASE = "https://food-market-api-production.up.railway.app/api/v1";
export const APP_BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const stamp = () => new Date().toISOString();
export const say = (message = "") => console.log(message === "" ? "" : `${stamp()}  ${message}`);

export function heading(title: string) {
  console.log(`\n=== ${title} ===`);
}

/** Aborts if real (non-demo) work is waiting, because the demo's workers would claim it. */
export async function assertQueueIsOurs() {
  const others = await prisma.job.count({
    where: { status: { in: ["pending", "failed", "processing"] }, NOT: { idempotencyKey: { startsWith: "demo-" } } },
  });
  if (others > 0) {
    console.error(`Refusing to run: ${others} non-demo job(s) are pending, failed or processing.`);
    process.exit(1);
  }
}

export async function resetDemoJobs() {
  const demo = { idempotencyKey: { startsWith: "demo-" } };
  const reports = await prisma.report.deleteMany({ where: { job: demo } });
  const jobs = await prisma.job.deleteMany({ where: demo });
  say(`cleanup: removed ${jobs.count} old demo job(s) and ${reports.count} report(s)`);
}

export async function pickRestaurantId(): Promise<string> {
  const res = await request(`${API_BASE}/orders?limit=1`);
  if (!res.ok) throw new Error(`live API returned ${res.status}`);
  const body = (await res.json()) as { data: { restaurantId: string }[] };
  return body.data[0].restaurantId;
}

export async function enqueueMany(prefix: string, count: number, restaurantId: string) {
  const { enqueueRestaurantReport } = await import("@/lib/jobs");
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const { job } = await enqueueRestaurantReport({
      userId: "demo-user",
      restaurantId,
      idempotencyKey: `${prefix}-${String(i).padStart(3, "0")}`,
    });
    ids.push(job.id);
  }
  return ids;
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 250, what = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
}

export async function printRow(label: string, id: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id } });
  const reports = await prisma.report.count({ where: { jobId: id } });
  say(`${label}`);
  console.log(
    [
      `    status=${job.status}  attempts=${job.attempts}/${job.maxAttempts}  reports=${reports}`,
      `    lockedBy=${job.lockedBy ?? "null"}`,
      `    startedAt=${job.startedAt?.toISOString() ?? "null"}  finishedAt=${job.finishedAt?.toISOString() ?? "null"}`,
      `    lastError=${job.lastError ?? "null"}`,
    ].join("\n"),
  );
}

export interface WorkerHandle {
  label: string;
  child: ChildProcess;
  lines: string[];
  exited: Promise<void>;
  /** Hard kill: no graceful shutdown, like a crash. */
  kill(): Promise<void>;
}

/** Starts `npm run worker`'s entry point as a child with config overrides, echoing its log. */
export function startWorker(label: string, override: object, echo = true): WorkerHandle {
  const child = spawn(process.execPath, ["--import", "tsx", "src/worker/index.ts"], {
    env: { ...process.env, JOBS_CONFIG_OVERRIDE: JSON.stringify(override) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines: string[] = [];
  const onLine = (line: string) => {
    lines.push(line);
    if (echo) console.log(`    [${label}] ${line.replace(/\[[^\]]*\] /, "")}`);
  };
  createInterface({ input: child.stdout! }).on("line", onLine);
  createInterface({ input: child.stderr! }).on("line", onLine);
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  return {
    label,
    child,
    lines,
    exited,
    async kill() {
      child.kill("SIGKILL");
      await exited;
    },
  };
}

export async function finish(workers: WorkerHandle[] = [], failed = false) {
  for (const worker of workers) if (worker.child.exitCode === null) await worker.kill();
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

export function verdict(ok: boolean, message: string) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${message}`);
  return ok;
}
