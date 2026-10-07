import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, enqueueSchema, JOB_STATUSES } from "@/lib/api";
import { prisma } from "@/lib/db";
import { enqueueRestaurantReport } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Only writes a pending row; the worker does the work. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "BAD_JSON", "Request body must be valid JSON.");
  }
  const parsed = enqueueSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(422, "VALIDATION_FAILED", "Body failed validation.", z.flattenError(parsed.error).fieldErrors);
  }
  const { job, created } = await enqueueRestaurantReport(parsed.data);
  return NextResponse.json(
    { data: { id: job.id, status: job.status, created } },
    { status: 202, headers: { Location: `/api/jobs/${job.id}` } },
  );
}

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  if (status !== null && !(JOB_STATUSES as readonly string[]).includes(status)) {
    return errorResponse(400, "BAD_QUERY", `status must be one of ${JOB_STATUSES.join(", ")}.`);
  }
  const jobs = await prisma.job.findMany({
    where: status ? { status: status as (typeof JOB_STATUSES)[number] } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ data: jobs });
}
