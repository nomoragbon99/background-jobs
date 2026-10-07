# Build log

Real errors hit while building, with symptom, cause and fix. Newest at the bottom.

## 1. A long shell command with several heredocs failed to parse

**Symptom:** twice, the shell rejected a multi-file command before running any of it:

```
/usr/bin/bash: -c: line 135: unexpected EOF while looking for matching `''
```

**Cause:** the commands bundled many heredocs and quoted fragments into one invocation; the shell could
not match the quotes. Nothing in the project was written by those attempts (checked by listing the files).

**Fix:** wrote the files one at a time with the file-writing tool instead.

## 2. ESLint rejected a data-loading effect on the dead letter page

**Symptom:**

```
src/app/dead/page.tsx
  29:10  error  Calling setState synchronously within an effect can trigger cascading renders
  > 29 |     void load();    react-hooks/set-state-in-effect
```

**Cause:** the page called a `useCallback` loader from the effect, and the loader set state before its
first await. The same problem (and the same fix) is entry 14 of the sibling food-market-api BUILD_LOG.md.

**Fix:** the loader moved inside the effect as a nested async function with a `cancelled` flag, so state
is only set after the awaited fetch. The retry handler removes the retried row locally; the next poll
confirms it.

## 3. TypeScript rejected an interface as a Prisma JSON value

**Symptom:**

```
src/worker/index.ts(42,52): error TS2345: ... Type 'RestaurantReport' is not assignable to type
'InputJsonObject'. Index signature for type 'string' is missing in type 'RestaurantReport'.
```

**Cause:** interfaces do not get an implicit index signature, which Prisma's JSON input type requires.

**Fix:** declared `RestaurantReport` as a `type` alias.

## 4. DATABASE_URL is not set, so migrations and the end-to-end run are blocked

**Symptom:** `.env` is 0 bytes, so there is no `DATABASE_URL`.

**Cause:** the project's `.env` has not been filled in. Per AGENTS.md, secrets are typed in by the user.

**Fix:** not applied by the AI coding agent; it stopped and asked. The user then filled in `.env`, and the
migration (`20261007180518_init_jobs`) applied cleanly through `scripts/with-resolved-db.mjs`.

## 5. Every API route returned 500: route segment config is incompatible with cacheComponents

**Symptom:** the first request to the dev server returned an HTML 500 page whose error payload read:

```
./src/app/api/jobs/route.ts:7:14
Error: Route segment config "dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.
> 7 | export const dynamic = "force-dynamic";
```

**Cause:** the scaffolded `next.config.ts` sets `cacheComponents: true`, under which `export const dynamic`
is rejected. I had added it to all three route files out of habit.

**Fix:** removed the export from the three route files. Handlers that read the request, params or the
database are dynamic without it. All four endpoints then answered correctly.

## 6. The worker exceeded its concurrency cap (6 jobs at once with a cap of 3)

**Symptom:** the first run of `npm run demo:concurrency` failed. Saved as
`evidence/concurrency-before-fix.txt`:

```
highest active count in the worker log:        6
highest rows in "processing" (DB, every 50ms): 6
configured cap:                                3
FAIL: concurrency never exceeded 3
```

**Cause:** `fill()` checked `active < concurrency`, then awaited the claim query, and only then incremented
`active`. `fill()` is entered from the poll loop and from every finishing job, so several callers passed the
check together and each claimed a job.

**Fix:** reserve the slot (`active += 1`) before the await, and give it back if the claim returns nothing or
throws. Re-run: highest active 3, highest rows in processing 3 (`evidence/concurrency.txt`).

## 7. next dev rewrote AGENTS.md

**Symptom:** after the first `npm run dev`, `git status` showed AGENTS.md modified: a generated
`nextjs-agent-rules` block had been appended.

**Cause:** Next.js 16 re-adds its agent guidance on every `next dev` start (the sibling food-market-api
BUILD_LOG.md entry 4 hit the same thing). No separate agent pointer file was generated this time.

**Fix:** the generated block is not committed; the file is restored to the project's own rules with
`git checkout AGENTS.md` before each commit.
