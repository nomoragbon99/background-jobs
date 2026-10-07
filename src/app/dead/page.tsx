"use client";

import { useEffect, useState } from "react";
import { config } from "@/config";

interface DeadJob {
  id: string;
  userId: string;
  payload: unknown;
  attempts: number;
  lastError: string | null;
}

export default function DeadPage() {
  const [jobs, setJobs] = useState<DeadJob[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/jobs?status=dead");
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

  async function retry(id: string) {
    const res = await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
    const body = await res.json();
    setMessage(res.ok ? `Job ${id} sent back to pending` : `Error: ${body.error.message}`);
    if (res.ok) setJobs((current) => current.filter((job) => job.id !== id));
  }

  return (
    <>
      <h1>Dead letters</h1>
      {message && <p role="status">{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Payload</th>
              <th>Attempts</th>
              <th>Last error</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <code>{job.id}</code>
                  <div className="muted">{job.userId}</div>
                </td>
                <td>
                  <pre>{JSON.stringify(job.payload)}</pre>
                </td>
                <td>{job.attempts}</td>
                <td className="error">{job.lastError}</td>
                <td>
                  <button onClick={() => retry(job.id)}>Retry</button>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No dead jobs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
