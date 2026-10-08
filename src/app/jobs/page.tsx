"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

interface JobRow {
  id: string;
  userId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: string;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        const body = await res.json();
        if (!cancelled && res.ok) setJobs(body.data);
      } catch {
        // keep the last list; the next poll will retry
      }
    }
    void load();
    const timer = setInterval(load, config.uiPollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function enqueue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: form.get("userId"),
        restaurantId: form.get("restaurantId"),
        idempotencyKey: form.get("idempotencyKey") || crypto.randomUUID(),
      }),
    });
    const body = await res.json();
    setMessage(
      res.ok
        ? `Enqueued ${body.data.id}${body.data.created ? "" : " (already existed)"}`
        : `Error: ${body.error.message}`,
    );
    setBusy(false);
  }

  return (
    <>
      <h1>Jobs</h1>
      <form onSubmit={enqueue}>
        <label>
          User id
          <input name="userId" required defaultValue="user-1" />
        </label>
        <label>
          Restaurant id
          <input name="restaurantId" required placeholder="restaurant UUID" />
        </label>
        <label>
          Idempotency key (blank = random)
          <input name="idempotencyKey" />
        </label>
        <button disabled={busy}>Enqueue report</button>
      </form>
      {message && <p role="status">{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>User</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Next run</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <a href={`/api/jobs/${job.id}`}>
                    <code>{job.id.slice(-8)}</code>
                  </a>
                </td>
                <td>{job.userId}</td>
                <td>
                  <span className={`badge ${job.status}`}>{job.status}</span>
                </td>
                <td>
                  {job.attempts}/{job.maxAttempts}
                </td>
                <td>
                  {job.status === "failed" || job.status === "pending"
                    ? new Date(job.runAt).toLocaleTimeString()
                    : ""}
                </td>
                <td className="error">{job.lastError}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
