/**
 * A minimal fetch-shaped client built on node:https. Global fetch (undici)
 * times out against Railway's edge on this machine while node:https works; see
 * the sibling food-market-api BUILD_LOG.md entry 15.
 */
import http from "node:http";
import https from "node:https";

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export function request(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<HttpResponse> {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method: init.method ?? "GET",
        headers: init.headers ?? {},
        family: 4,
        timeout: init.timeoutMs ?? 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: {
              get: (name) => {
                const value = res.headers[name.toLowerCase()];
                return Array.isArray(value) ? value[0] : (value ?? null);
              },
            },
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
