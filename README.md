# background-jobs

A job system that moves slow, unreliable work off the request path, survives failure, and can prove what
happened to every job. The job type is `restaurant_report`: the worker calls the live food-market API,
walks every page of a restaurant's orders, and stores order count, revenue (minor units) and counts per
status.

Stack: Next.js (App Router), TypeScript, Prisma 7.10.0 (pinned), PostgreSQL, Zod, tsx.

## Setup

Requires Node 22+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env        # then set DATABASE_URL yourself; never commit .env
npm run db:migrate          # applies prisma/migrations
```

If Prisma reports `P1001` against a database you can reach from Node, your machine's DNS may be blocking
Prisma's native engine. `npm run db:migrate` already goes through `scripts/with-resolved-db.mjs`, which
resolves the host with the OS resolver (see the sibling food-market-api BUILD_LOG.md, entry 8).

## Run

Two processes, in two terminals:

```bash
npm run dev       # web app and API on http://localhost:3000
npm run worker    # the job worker
```

Pages: `/jobs` (enqueue form and live list), `/dead` (dead jobs with a retry button).

## API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/jobs` | Body `{ userId, restaurantId, idempotencyKey }`. Writes a pending row, returns 202 with the job id. Same key returns the existing job. |
| GET | `/api/jobs/:id` | Status, attempts, lastError, timestamps, and the report when done. |
| GET | `/api/jobs?status=` | Newest first, up to 100. |
| POST | `/api/jobs/:id/retry` | Dead jobs only (409 otherwise). |

```bash
curl -X POST localhost:3000/api/jobs -H "content-type: application/json" \
  -d '{"userId":"user-1","restaurantId":"<restaurant-uuid>","idempotencyKey":"demo-1"}'
```

## How it behaves

- Statuses: `pending`, `processing`, `succeeded`, `failed` (a retry is scheduled at `runAt`), `dead`
  (attempts exhausted).
- The worker claims with one atomic `UPDATE ... FOR UPDATE SKIP LOCKED ... RETURNING`, runs at most
  `worker.concurrency` jobs at once, and logs the active count on every start and finish.
- Failures retry with exponential backoff and jitter; a sweeper returns jobs stuck in `processing` past
  the timeout to `pending` (or `dead` when exhausted).
- The report row has a unique `jobId`, and is written in the same transaction that marks the job
  succeeded.
- Every tunable number is in [src/config.ts](src/config.ts), including `failureInjectionRate` (0 to 1),
  which makes attempts throw on purpose.

Design choices and their rejected alternatives: [DECISIONS.md](DECISIONS.md). Errors hit while building:
[BUILD_LOG.md](BUILD_LOG.md). Run output: [evidence/](evidence/).
