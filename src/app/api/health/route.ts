import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return errorResponse(503, "SERVICE_UNAVAILABLE", "Database is unreachable.");
  }
}
