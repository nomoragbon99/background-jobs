import { config } from "@/config";

/** Exponential backoff with jitter. `attempts` is the count after the failure (>= 1). */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const { backoffBaseMs, backoffCapMs, jitterMin, jitterMax } = config.jobs;
  const exponential = Math.min(backoffCapMs, backoffBaseMs * 2 ** (attempts - 1));
  const jitter = jitterMin + random() * (jitterMax - jitterMin);
  return Math.round(exponential * jitter);
}
