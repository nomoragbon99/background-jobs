/** Every tunable number in the system lives here. */
const defaults = {
  /** Live API the restaurant_report job reads from. */
  foodMarketApiBaseUrl: "https://food-market-api-production.up.railway.app/api/v1",
  /** Page size requested when walking a restaurant's orders. */
  ordersPageSize: 100,
  /** Per-request timeout for the live API, in ms. */
  apiTimeoutMs: 30_000,

  jobs: {
    /** Copied onto each job row at creation. */
    maxAttempts: 5,
    /** Retry delay = min(cap, base * 2^(attempts-1)), then jitter is applied. */
    backoffBaseMs: 2_000,
    backoffCapMs: 5 * 60_000,
    /** Delay is multiplied by a random factor in [min, max]. */
    jitterMin: 0.5,
    jitterMax: 1.5,
  },

  worker: {
    /** Max jobs running at once in one worker process. */
    concurrency: 3,
    pollIntervalMs: 1_000,
    /** A job in `processing` longer than this is considered stuck. */
    stuckJobTimeoutMs: 2 * 60_000,
    sweepIntervalMs: 15_000,
    /** Probability (0 to 1) that an attempt throws on purpose. */
    failureInjectionRate: 0,
    /**
     * Simulated slow-work mode. 0 = off (the real live-API work runs). Above 0,
     * the work sleeps this many ms and writes a synthetic report instead of
     * calling the live API, so load tests do not trip its rate limit.
     */
    simulatedWorkMs: 0,
  },

  /** Dashboard polling interval, in ms. */
  uiPollIntervalMs: 2_000,
};

type Defaults = typeof defaults;

/**
 * The demo scripts start workers with different settings from the terminal, so
 * JOBS_CONFIG_OVERRIDE (JSON, e.g. {"worker":{"concurrency":5}}) may replace
 * numeric values that already exist above. Unknown keys are ignored.
 */
function applyOverrides(base: Defaults): Defaults {
  const raw = typeof process !== "undefined" ? process.env.JOBS_CONFIG_OVERRIDE : undefined;
  if (!raw) return base;
  const overrides = JSON.parse(raw) as Record<string, unknown>;
  const result = structuredClone(base) as Record<string, unknown>;
  for (const [section, values] of Object.entries(overrides)) {
    const target = result[section];
    if (typeof target === "object" && target !== null && typeof values === "object" && values !== null) {
      for (const [key, value] of Object.entries(values)) {
        if (typeof (target as Record<string, unknown>)[key] === "number" && typeof value === "number") {
          (target as Record<string, unknown>)[key] = value;
        }
      }
    }
  }
  return result as Defaults;
}

export const config = applyOverrides(defaults);
