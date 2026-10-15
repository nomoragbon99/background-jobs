import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { config } from "@/config";

/**
 * GET /api/health
 *
 * Readiness check: verifies downstream dependency connectivity to PostgreSQL rather than
 * functioning as an isolated process liveness probe. Ensures the service is ready to handle
 * traffic and work requiring database access within a bounded timeout window.
 */
export async function GET() {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Database health check timed out."));
      }, config.DB_HEALTH_CHECK_TIMEOUT_MS);
      timer.unref?.();
    });

    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      timeoutPromise,
    ]);

    return NextResponse.json({
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    return errorResponse(503, "SERVICE_UNAVAILABLE", "Database is unreachable.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
