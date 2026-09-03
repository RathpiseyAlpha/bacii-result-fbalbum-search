import { useEffect, useState } from "react";
import { Archive, CheckCircle2, Database, KeyRound, LoaderCircle, ShieldCheck, Square, UploadCloud } from "lucide-react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

type ImportJob = {
  id: string;
  year: number;
  status: "queued" | "working" | "ready" | "error" | "cancelled";
  phase: string;
  current: number;
  total: number;
  message?: string;
  error?: string;
  logs: string[];
};

async function adminRequest(path: string, token: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return response;
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem("bacii-admin-token") || "");
  const [year, setYear] = useState(new Date().getFullYear());
  const [postUrl, setPostUrl] = useState("");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!job || !["queued", "working"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await adminRequest(`/api/admin/archive-imports/${job.id}`, token);
        setJob(await response.json() as ImportJob);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Could not read import progress.");
      }
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, token]);

  async function startImport(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      sessionStorage.setItem("bacii-admin-token", token);
      const response = await adminRequest("/api/admin/archive-imports", token, {
        method: "POST", body: JSON.stringify({ year, postUrl }),
      });
      setJob(await response.json() as ImportJob);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not start the import.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelImport() {
    if (!job) return;
    try {
      await adminRequest(`/api/admin/archive-imports/${job.id}`, token, { method: "DELETE" });
      setJob({ ...job, status: "cancelled", phase: "Import cancelled" });
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel the import.");
    }
  }

  const progress = job ? Math.min(100, Math.round((job.current / Math.max(1, job.total)) * 100)) : 0;
  const running = job?.status === "queued" || job?.status === "working";

  return <main className="admin-page">
    <header className="admin-header">
      <a className="brand" href="/#archive"><span className="brand-mark"><Database /></span><span>BacII Archive</span></a>
      <span><ShieldCheck /> Protected administration</span>
    </header>
    <section className="admin-shell">
      <div className="admin-title">
        <span className="eyebrow">ARCHIVE INGESTION</span>
        <h1>Publish a result year</h1>
        <p>Paste the official MOEYS Facebook or Telegram post containing all 25 province and capital PDF links. The server discovers, downloads, validates, indexes, and publishes the archive automatically.</p>
      </div>

      <form className="admin-card" onSubmit={startImport}>
        <div className="admin-card-title"><UploadCloud /><div><h2>New archive import</h2><p>Only one CPU-intensive import can run at a time.</p></div></div>
        <div className="admin-fields">
          <label><span><KeyRound /> Admin token</span><input type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} required /></label>
          <label><span><Archive /> Result year</span><input type="number" min="2014" max={new Date().getFullYear() + 1} value={year} onChange={(event) => setYear(Number(event.target.value))} required /></label>
          <label className="admin-url"><span>Official Facebook or Telegram post URL</span><input type="url" placeholder="https://t.me/moeysnews/1234 or https://www.facebook.com/share/p/..." value={postUrl} onChange={(event) => setPostUrl(event.target.value)} required /></label>
        </div>
        {error && <div className="admin-error" role="alert">{error}</div>}
        <button className="admin-start" disabled={submitting || running}>{submitting ? <LoaderCircle className="spin" /> : <UploadCloud />} {running ? "Import in progress" : "Discover and import PDFs"}</button>
      </form>

      {job && <section className={`admin-job ${job.status}`}>
        <div className="admin-job-head">
          <div>{job.status === "ready" ? <CheckCircle2 /> : running ? <LoaderCircle className="spin" /> : <Archive />}<div><span>{job.year} archive</span><h2>{job.phase}</h2></div></div>
          <strong>{progress}%</strong>
        </div>
        <div className="admin-progress"><i style={{ width: `${progress}%` }} /></div>
        <p>{job.error || job.message || `${job.current} of ${job.total}`}</p>
        {job.logs.length > 0 && <pre className="admin-log">{job.logs.join("\n")}</pre>}
        {running && <button className="admin-cancel" type="button" onClick={cancelImport}><Square /> Cancel import</button>}
        {job.status === "ready" && <a className="admin-open" href={`/#archive?year=${job.year}`}>Open published archive</a>}
      </section>}
    </section>
  </main>;
}
