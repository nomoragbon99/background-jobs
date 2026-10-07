# background-jobs: agent rules
- Task 2 of a product engineering bootcamp: a job system that moves slow, unreliable work off the request path, survives failure, and can prove what happened to every job.
- Out of scope: authentication beyond a user id, landing page, any UI beyond a trigger and status page and a dead letter page.
- Stack: Next.js App Router, TypeScript, Prisma 7 (pin it; the "latest" tag is a pre-release), PostgreSQL, Zod, tsx. The sibling project at ../food-market-api already solved Prisma 7 setup, the P1001 DNS problem (scripts/with-resolved-db.mjs) and Node fetch timeouts to Railway (scripts/http.mjs). Read its BUILD_LOG.md and reuse those solutions.
- Every tunable number lives in src/config.ts: max attempts, backoff base and cap, jitter range, concurrency cap, poll interval, stuck-job timeout, sweep interval, failure-injection rate.
- Plan, build only what is asked, verify by running, show real output, commit in small steps.
- Commits are authored only by me, with no attribution trailers. Never write the name of any AI product or model in any file or commit message; say "the AI coding agent". Delete any agent-specific pointer file a scaffolder generates.
- Never read, write or print secrets. Never write a real database host, port or IP into any file; use placeholders.
- Log every real error in BUILD_LOG.md and every choice with its rejected alternative in DECISIONS.md. Save evidence under evidence/.
- If something conflicts with these rules or looks wrong, stop and ask.
