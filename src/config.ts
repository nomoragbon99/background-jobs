/** Every tunable number in the system lives here. */
export const config = {
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
  },

  /** Dashboard polling interval, in ms. */
  uiPollIntervalMs: 2_000,
} as const;
