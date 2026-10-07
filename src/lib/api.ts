import { NextResponse } from "next/server";
import { z } from "zod";

export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export const uuidSchema = z.uuid();

export const enqueueSchema = z.object({
  userId: z.string().min(1).max(200),
  restaurantId: z.uuid(),
  idempotencyKey: z.string().min(1).max(200),
});

export const JOB_STATUSES = ["pending", "processing", "succeeded", "failed", "dead"] as const;
