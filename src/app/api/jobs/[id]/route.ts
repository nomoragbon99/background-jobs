import { NextResponse } from "next/server";
import { errorResponse, uuidSchema } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return errorResponse(400, "BAD_ID", "Job id must be a UUID.");
  const job = await prisma.job.findUnique({ where: { id }, include: { report: true } });
  if (!job) return errorResponse(404, "NOT_FOUND", "No such job.");
  return NextResponse.json({ data: job });
}
