import { z } from "zod";
import { config } from "@/config";
import { request } from "@/lib/http";

const restaurantSchema = z.object({ data: z.object({ id: z.string(), name: z.string() }) });
const ordersSchema = z.object({
  data: z.array(z.object({ status: z.string(), totalMinor: z.number().int() })),
  meta: z.object({ nextCursor: z.string().nullable() }),
});

export type RestaurantReport = {
  restaurantName: string;
  orderCount: number;
  revenueMinor: number;
  countsByStatus: Record<string, number>;
  pages: number;
};

async function getJson(path: string): Promise<unknown> {
  const res = await request(`${config.foodMarketApiBaseUrl}${path}`, {
    headers: { accept: "application/json" },
    timeoutMs: config.apiTimeoutMs,
  });
  if (res.status === 429) {
    throw new Error(`Rate limited (429), Retry-After=${res.headers.get("retry-after") ?? "unknown"}s`);
  }
  if (!res.ok) throw new Error(`Food market API returned ${res.status} for ${path}`);
  return res.json();
}

/** Fetches the restaurant and every page of its orders, then aggregates. */
export async function buildRestaurantReport(restaurantId: string): Promise<RestaurantReport> {
  const id = encodeURIComponent(restaurantId);
  const restaurant = restaurantSchema.parse(await getJson(`/restaurants/${id}`));

  let orderCount = 0;
  let revenueMinor = 0;
  let pages = 0;
  const countsByStatus: Record<string, number> = {};
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ restaurantId, limit: String(config.ordersPageSize) });
    if (cursor) query.set("cursor", cursor);
    const page = ordersSchema.parse(await getJson(`/orders?${query}`));
    pages += 1;
    for (const order of page.data) {
      orderCount += 1;
      // Cancelled orders are not revenue (see DECISIONS.md).
      if (order.status !== "cancelled") revenueMinor += order.totalMinor;
      countsByStatus[order.status] = (countsByStatus[order.status] ?? 0) + 1;
    }
    cursor = page.meta.nextCursor;
  } while (cursor);

  return { restaurantName: restaurant.data.name, orderCount, revenueMinor, countsByStatus, pages };
}
