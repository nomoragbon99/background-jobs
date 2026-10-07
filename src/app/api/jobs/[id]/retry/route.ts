import { NextResponse } from "next/server";
import { errorResponse, uuidSchema } from "@/lib/api";
import { prisma } from "@/lib/db";
import { retryDeadJob } from "@/lib/jobs";

/** Dead jobs only. The status check is part of the UPDATE, so it is race-free. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "Job id must be a UUID.");
  if (await retryDeadJob(id)) {
    return NextResponse.json({ data: { id, status: "pending" } }, { status: 202 });
  }
  const job = await prisma.job.findUnique({ where: { id }, select: { status: true } });
  if (!job) return errorResponse(404, "NOT_FOUND", "No such job.");
  return errorResponse(409, "NOT_DEAD", `Only dead jobs can be retried; this job is ${job.status}.`);
}
