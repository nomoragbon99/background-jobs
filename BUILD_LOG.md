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

**Fix:** not applied. Stopped and asked.
