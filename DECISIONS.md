# Decisions

Each design choice, with the alternative that was rejected.

## 1. Reading of the status meanings

- `failed` = the last attempt failed and a retry is scheduled at `runAt`.
- `dead` = attempts exhausted, needs a human.
- The worker claims jobs whose status is `pending` or `failed` and whose `runAt` has passed.

**Rejected:** treating `failed` as terminal (and making `dead` a separate retry-limit bucket). That would
need a second mechanism to re-schedule retries; with this reading the `runAt` column and the one claim
query handle first runs, retries and swept jobs alike.

## 2. Claiming with one UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING

**Rejected:** `SELECT` then `UPDATE` in two statements (two workers can pick the same row), and an
advisory-lock scheme (more moving parts for the same guarantee).

## 3. Attempts are incremented on failure and on sweep, not on claim

The brief says "increment attempts and store lastError" under Failure and "attempts incremented" under
Sweep. **Rejected:** incrementing on claim, which would count a crash before the work ran the same as a
failed attempt and would make the sweep double-count.

## 4. Completion, failure and report writes are guarded by `status = processing AND lockedBy = me`

If the sweeper reclaims a slow job and another worker takes it, the slow worker's late result must not
overwrite the new run. **Rejected:** unconditional updates by id (last writer wins, silently).

## 5. Idempotent report: unique `jobId` plus `createMany({ skipDuplicates })`

The report insert is `ON CONFLICT DO NOTHING` inside the same transaction that marks the job succeeded.
**Rejected:** catching the unique-violation error, because in PostgreSQL an error aborts the whole
transaction, so the job-succeeded update would be lost with it.

## 6. Enqueue idempotency is enforced by the database unique constraint

`create`, and on Prisma error P2002 read back the existing row. **Rejected:** check-then-insert, which
two simultaneous requests can both pass. A repeat key returns the existing job with 202 and
`created: false`; the payload of the repeat request is ignored.

## 7. Revenue excludes cancelled orders

`revenueMinor` sums `totalMinor` over every order whose status is not `cancelled`; `orderCount` and the
per-status counts include all orders. **Rejected:** summing everything, which would count money that was
never taken. This is an interpretation of an ambiguous brief.

## 8. Backoff formula

`min(cap, base * 2^(attempts-1))` multiplied by a random factor in `[jitterMin, jitterMax]`. **Rejected:**
fixed delay (retry storms) and full jitter from zero (can retry almost immediately).

## 9. Retry of a dead job resets `attempts` to 0

The status check is part of the UPDATE so it is race-free, and non-dead jobs get 409. **Rejected:**
keeping the old attempts count, which would send the job straight back to `dead` on its next failure.

## 10. Prisma pinned to exactly 7.10.0

Exact versions (no caret) for `prisma`, `@prisma/client` and `@prisma/adapter-pg`, because the `latest`
dist-tag is a pre-release. **Rejected:** `^7.10.0`, which allows drift between CLI and client.

## 11. `uuid(7)` for primary keys

Time-ordered UUIDs index better than random v4. **Rejected:** `uuid(4)`, which scatters inserts.

## 12. Own typed `src/lib/http.ts` instead of reusing `scripts/http.mjs`

The sibling's solution (node:https instead of fetch) is reused, but the worker is TypeScript and imports
it from `src/`. **Rejected:** copying the .mjs file and writing a type declaration for it (two files
for one client).

## 13. Config overrides come in through one generic env var, JOBS_CONFIG_OVERRIDE

The numbers still live in `src/config.ts`. The env var (JSON, for example `{"worker":{"concurrency":5}}`) can
only replace numeric values that already exist there, and unknown keys are ignored. It exists so each demo
script can start workers with different settings (failure rate 1.0, short stuck timeout) from the terminal.
This replaces my first choice of no env override at all. **Rejected:** per-setting env variables (a second home
for every number) and having the demos edit `src/config.ts` (a script that rewrites source).

## 14. Dashboard polls with `setInterval` and plain `fetch`

**Rejected:** server-sent events or websockets, which add a connection lifecycle for a status page.

## 15. Simulated slow-work mode (`worker.simulatedWorkMs`)

When above 0 the work sleeps that long and writes a synthetic report instead of calling the live API. Used by
the concurrency, stuck-job, two-workers and double-run demos (the README says which). **Rejected:** real API
calls for 50-job tests, because the live API has a rate limit that would turn a concurrency test into a 429 test.

## 16. Demos own only rows whose idempotencyKey starts with "demo-"

Each demo deletes those rows when it starts and refuses to run if real non-demo jobs are pending, failed or
processing. **Rejected:** truncating the table, which would destroy real data.

## 17. The concurrency slot is reserved before the claim query

See BUILD_LOG.md entry 6. **Rejected:** a mutex around fill(), which serialises claiming for no benefit, and
re-checking the count after the claim, which would claim a job and then have to give it back.

## 18. demo:all-statuses writes rows directly

Each status is held steady for screenshots: no worker runs, and the failed job's retry is an hour away.
**Rejected:** producing each status by running real jobs, which would race the worker and make the pending and
processing rows vanish within seconds.

## 19. No `export const dynamic` in route files

See BUILD_LOG.md entry 5. **Rejected:** turning off `cacheComponents` in next.config.ts, which is the scaffold's
default and not mine to change here.

## 20. Timestamps mix two clocks

`createdAt` and `startedAt` default to the database clock; `runAt` and `updatedAt` on failure are written by the
worker's clock. The happy-path evidence shows them about half a second apart. **Rejected:** moving every
timestamp into SQL `now()`, which would work but means raw SQL for updates that Prisma expresses cleanly.
Backoff stays correct because a retry's `runAt` and the claim's `runAt <= now()` only differ by that skew.
