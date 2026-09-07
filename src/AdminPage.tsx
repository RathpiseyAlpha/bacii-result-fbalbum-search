import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  Database,
  Eye,
  Globe,
  KeyRound,
  Laptop,
  LoaderCircle,
  Lock,
  Monitor,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Square,
  Tablet,
  TrendingUp,
  UploadCloud,
  Users,
} from "lucide-react";

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

type VisitorAnalyticsOverview = {
  kpis: {
    totalUniqueVisitors: number;
    totalPageViews: number;
    todayUniqueVisitors: number;
    todayPageViews: number;
    yesterdayUniqueVisitors: number;
    yesterdayPageViews: number;
    activeNow: number;
    rangeUniqueVisitors: number;
    rangePageViews: number;
    avgPagesPerVisitor: number;
  };
  dailySeries: Array<{
    date: string;
    uniqueVisitors: number;
    pageViews: number;
  }>;
  topPages: Array<{ path: string; views: number; visitors: number }>;
  topReferrers: Array<{ referrer: string; views: number; visitors: number }>;
  deviceBreakdown: Array<{ name: string; views: number; visitors: number; percentage: number }>;
  osBreakdown: Array<{ name: string; views: number; visitors: number }>;
  browserBreakdown: Array<{ name: string; views: number; visitors: number }>;
  recentVisits: Array<{
    id: number;
    visitorIdMasked: string;
    path: string;
    referrer: string;
    deviceType: string;
    os: string;
    browser: string;
    createdAt: number;
  }>;
};

async function adminRequest(path: string, token: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return response;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 10_000) return "Just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem("bacii-admin-token") || "");
  const [tokenInput, setTokenInput] = useState("");
  const [tab, setTab] = useState<"visitors" | "importer">(() =>
    window.location.hash.includes("importer") ? "importer" : "visitors",
  );

  // Importer state
  const [year, setYear] = useState(new Date().getFullYear());
  const [postUrl, setPostUrl] = useState("");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [importerError, setImporterError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Analytics state
  const [days, setDays] = useState(7);
  const [analytics, setAnalytics] = useState<VisitorAnalyticsOverview | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Sync tab with hash
  function switchTab(nextTab: "visitors" | "importer") {
    setTab(nextTab);
    window.location.hash = nextTab === "importer" ? "#admin/importer" : "#admin/visitors";
  }

  // Load analytics when token or days change
  async function fetchAnalytics(silent = false) {
    if (!token) return;
    if (!silent) setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const res = await adminRequest(`/api/admin/analytics/overview?days=${days}`, token);
      const data = (await res.json()) as VisitorAnalyticsOverview;
      setAnalytics(data);
      setLastRefreshed(new Date());
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : "Failed to load visitor analytics.");
    } finally {
      if (!silent) setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "visitors" && token) {
      fetchAnalytics();
    }
  }, [tab, token, days]);

  // Auto-refresh analytics every 20 seconds if enabled
  useEffect(() => {
    if (tab !== "visitors" || !token || !autoRefresh) return;
    const interval = window.setInterval(() => {
      fetchAnalytics(true);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [tab, token, days, autoRefresh]);

  // Importer polling
  useEffect(() => {
    if (!job || !["queued", "working"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await adminRequest(`/api/admin/archive-imports/${job.id}`, token);
        setJob((await response.json()) as ImportJob);
      } catch (pollError) {
        setImporterError(pollError instanceof Error ? pollError.message : "Could not read import progress.");
      }
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, token]);

  function handleSaveToken(e: React.FormEvent) {
    e.preventDefault();
    const clean = tokenInput.trim();
    if (!clean) return;
    sessionStorage.setItem("bacii-admin-token", clean);
    setToken(clean);
    setTokenInput("");
  }

  function handleLogout() {
    sessionStorage.removeItem("bacii-admin-token");
    setToken("");
    setAnalytics(null);
  }

  async function startImport(event: React.FormEvent) {
    event.preventDefault();
    setImporterError("");
    setSubmitting(true);
    try {
      sessionStorage.setItem("bacii-admin-token", token);
      const response = await adminRequest("/api/admin/archive-imports", token, {
        method: "POST",
        body: JSON.stringify({ year, postUrl }),
      });
      setJob((await response.json()) as ImportJob);
    } catch (submitError) {
      setImporterError(submitError instanceof Error ? submitError.message : "Could not start the import.");
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
      setImporterError(cancelError instanceof Error ? cancelError.message : "Could not cancel the import.");
    }
  }

  const progress = job ? Math.min(100, Math.round((job.current / Math.max(1, job.total)) * 100)) : 0;
  const running = job?.status === "queued" || job?.status === "working";

  // Max value for daily series chart scaling
  const maxDailyViews = useMemo(() => {
    if (!analytics?.dailySeries.length) return 10;
    return Math.max(10, ...analytics.dailySeries.map((d) => Math.max(d.uniqueVisitors, d.pageViews)));
  }, [analytics?.dailySeries]);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <a className="brand" href="/#archive">
            <span className="brand-mark">
              <Database />
            </span>
            <span className="admin-brand-text">BacII Dashboard</span>
          </a>

          <nav className="admin-nav-tabs">
            <button
              type="button"
              className={`admin-nav-tab ${tab === "visitors" ? "active" : ""}`}
              onClick={() => switchTab("visitors")}
            >
              <Users size={16} />
              <span>Visitor Analytics</span>
            </button>
            <button
              type="button"
              className={`admin-nav-tab ${tab === "importer" ? "active" : ""}`}
              onClick={() => switchTab("importer")}
            >
              <UploadCloud size={16} />
              <span>Archive Importer</span>
            </button>
          </nav>
        </div>

        <div className="admin-header-right">
          {token ? (
            <div className="admin-auth-status">
              <span className="admin-auth-badge">
                <ShieldCheck size={14} /> Admin Verified
              </span>
              <button type="button" className="admin-auth-logout" onClick={handleLogout} title="Clear saved token">
                Sign Out
              </button>
            </div>
          ) : (
            <span className="admin-locked-label">
              <Lock size={14} /> Locked
            </span>
          )}
        </div>
      </header>

      <section className="admin-shell admin-shell-wide">
        {!token ? (
          <div className="admin-login-box">
            <div className="admin-login-icon">
              <KeyRound size={28} />
            </div>
            <h2>Admin Authentication</h2>
            <p>Please enter your administration token to access the dashboard and view visitor statistics.</p>
            <form onSubmit={handleSaveToken} className="admin-login-form">
              <input
                type="password"
                placeholder="Enter admin token..."
                autoComplete="current-password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                autoFocus
                required
              />
              <button type="submit">Unlock Dashboard</button>
            </form>
          </div>
        ) : tab === "visitors" ? (
          /* =========================================================
             VISITOR ANALYTICS PAGE
             ========================================================= */
          <div className="analytics-view">
            <div className="analytics-header">
              <div>
                <h1>Unique Visitor Analytics</h1>
                <p>
                  Traffic volume, audience engagement, and real-time site visits across BacII search and archive.
                </p>
              </div>

              <div className="analytics-controls">
                <div className="analytics-range-selector">
                  <Calendar size={14} />
                  <button
                    type="button"
                    className={days === 7 ? "active" : ""}
                    onClick={() => setDays(7)}
                  >
                    7 Days
                  </button>
                  <button
                    type="button"
                    className={days === 14 ? "active" : ""}
                    onClick={() => setDays(14)}
                  >
                    14 Days
                  </button>
                  <button
                    type="button"
                    className={days === 30 ? "active" : ""}
                    onClick={() => setDays(30)}
                  >
                    30 Days
                  </button>
                </div>

                <button
                  type="button"
                  className="analytics-refresh-btn"
                  onClick={() => fetchAnalytics()}
                  disabled={analyticsLoading}
                  title="Refresh visitor statistics"
                >
                  <RefreshCw size={15} className={analyticsLoading ? "spin" : ""} />
                  <span>Refresh</span>
                </button>

                <label className="analytics-auto-toggle" title="Auto-refresh every 20 seconds">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  <span>Live</span>
                </label>
              </div>
            </div>

            {analyticsError && <div className="admin-error">{analyticsError}</div>}

            {analytics && (
              <>
                {/* KPI Cards Grid */}
                <div className="analytics-kpi-grid">
                  <div className="analytics-kpi-card highlight">
                    <div className="kpi-header">
                      <span className="kpi-title">Unique Visitors ({days}d)</span>
                      <div className="kpi-icon blue">
                        <Users size={20} />
                      </div>
                    </div>
                    <div className="kpi-value">{analytics.kpis.rangeUniqueVisitors.toLocaleString()}</div>
                    <div className="kpi-subtitle">Distinct people in selected period</div>
                  </div>

                  <div className="analytics-kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Total Page Views ({days}d)</span>
                      <div className="kpi-icon purple">
                        <Eye size={20} />
                      </div>
                    </div>
                    <div className="kpi-value">{analytics.kpis.rangePageViews.toLocaleString()}</div>
                    <div className="kpi-subtitle">
                      ~{analytics.kpis.avgPagesPerVisitor} views per unique visitor
                    </div>
                  </div>

                  <div className="analytics-kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Today's Visitors</span>
                      <div className="kpi-icon green">
                        <TrendingUp size={20} />
                      </div>
                    </div>
                    <div className="kpi-value">{analytics.kpis.todayUniqueVisitors.toLocaleString()}</div>
                    <div className="kpi-subtitle">
                      {analytics.kpis.todayPageViews.toLocaleString()} views today &bull;{" "}
                      {analytics.kpis.yesterdayUniqueVisitors.toLocaleString()} yesterday
                    </div>
                  </div>

                  <div className="analytics-kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Active Now</span>
                      <div className="kpi-icon emerald">
                        <Radio size={20} />
                      </div>
                    </div>
                    <div className="kpi-value active-now-value">
                      <span className="live-pulse-dot" />
                      {analytics.kpis.activeNow}
                    </div>
                    <div className="kpi-subtitle">Active visitors in last 15 minutes</div>
                  </div>

                  <div className="analytics-kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">All-Time Unique</span>
                      <div className="kpi-icon indigo">
                        <Activity size={20} />
                      </div>
                    </div>
                    <div className="kpi-value">{analytics.kpis.totalUniqueVisitors.toLocaleString()}</div>
                    <div className="kpi-subtitle">
                      {analytics.kpis.totalPageViews.toLocaleString()} lifetime page views
                    </div>
                  </div>
                </div>

                {/* Daily Trend Chart */}
                <div className="analytics-card chart-card">
                  <div className="analytics-card-header">
                    <div className="card-title-group">
                      <BarChart3 size={18} className="card-icon" />
                      <div>
                        <h3>Daily Visitor & Page View Trends</h3>
                        <p>Daily volume comparison over the last {days} days</p>
                      </div>
                    </div>

                    <div className="chart-legend">
                      <span className="legend-item">
                        <span className="legend-box blue" /> Unique Visitors
                      </span>
                      <span className="legend-item">
                        <span className="legend-box light-blue" /> Page Views
                      </span>
                    </div>
                  </div>

                  <div className="analytics-bar-chart">
                    {analytics.dailySeries.map((item) => {
                      const visitorHeight = Math.max(
                        4,
                        Math.round((item.uniqueVisitors / maxDailyViews) * 140),
                      );
                      const viewHeight = Math.max(
                        4,
                        Math.round((item.pageViews / maxDailyViews) * 140),
                      );
                      const shortDate = item.date.slice(5); // MM-DD
                      return (
                        <div className="chart-bar-column" key={item.date}>
                          <div className="bar-group" title={`${item.date}: ${item.uniqueVisitors} visitors, ${item.pageViews} views`}>
                            <div
                              className="bar view-bar"
                              style={{ height: `${viewHeight}px` }}
                            />
                            <div
                              className="bar visitor-bar"
                              style={{ height: `${visitorHeight}px` }}
                            />
                          </div>
                          <span className="bar-date-label">{shortDate}</span>
                          <span className="bar-count-label">{item.uniqueVisitors}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2x2 Breakdown Grid */}
                <div className="analytics-breakdowns-grid">
                  {/* Top Pages */}
                  <div className="analytics-card">
                    <div className="analytics-card-header">
                      <div className="card-title-group">
                        <Compass size={18} className="card-icon" />
                        <div>
                          <h3>Top Visited Pages</h3>
                          <p>Most popular routes and sections</p>
                        </div>
                      </div>
                    </div>
                    <div className="breakdown-list">
                      {analytics.topPages.length === 0 ? (
                        <div className="breakdown-empty">No page visits recorded in this period.</div>
                      ) : (
                        analytics.topPages.map((page, idx) => {
                          const maxViews = analytics.topPages[0].views || 1;
                          const percent = Math.round((page.views / maxViews) * 100);
                          return (
                            <div className="breakdown-item" key={idx}>
                              <div className="breakdown-info">
                                <span className="breakdown-name font-mono">{page.path}</span>
                                <span className="breakdown-stats">
                                  <strong>{page.visitors.toLocaleString()}</strong> visitors &bull; {page.views.toLocaleString()} views
                                </span>
                              </div>
                              <div className="breakdown-bar-bg">
                                <div className="breakdown-bar-fill" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Traffic Referrers */}
                  <div className="analytics-card">
                    <div className="analytics-card-header">
                      <div className="card-title-group">
                        <Globe size={18} className="card-icon" />
                        <div>
                          <h3>Traffic Referrers</h3>
                          <p>Where visitors discovered the site</p>
                        </div>
                      </div>
                    </div>
                    <div className="breakdown-list">
                      {analytics.topReferrers.length === 0 ? (
                        <div className="breakdown-empty">No external referrer data yet.</div>
                      ) : (
                        analytics.topReferrers.map((ref, idx) => {
                          const maxViews = analytics.topReferrers[0].views || 1;
                          const percent = Math.round((ref.views / maxViews) * 100);
                          return (
                            <div className="breakdown-item" key={idx}>
                              <div className="breakdown-info">
                                <span className="breakdown-name">{ref.referrer}</span>
                                <span className="breakdown-stats">
                                  <strong>{ref.visitors.toLocaleString()}</strong> visitors &bull; {ref.views.toLocaleString()} views
                                </span>
                              </div>
                              <div className="breakdown-bar-bg">
                                <div className="breakdown-bar-fill green" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Device & OS */}
                  <div className="analytics-card">
                    <div className="analytics-card-header">
                      <div className="card-title-group">
                        <Smartphone size={18} className="card-icon" />
                        <div>
                          <h3>Device & OS Breakdown</h3>
                          <p>Platforms used by visitors</p>
                        </div>
                      </div>
                    </div>
                    <div className="device-distribution">
                      {analytics.deviceBreakdown.map((dev) => (
                        <div className="device-pill" key={dev.name}>
                          {dev.name === "mobile" ? (
                            <Smartphone size={16} />
                          ) : dev.name === "tablet" ? (
                            <Tablet size={16} />
                          ) : (
                            <Monitor size={16} />
                          )}
                          <div className="device-pill-info">
                            <span className="device-type-title">
                              {dev.name.charAt(0).toUpperCase() + dev.name.slice(1)}
                            </span>
                            <strong>{dev.percentage}%</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="sub-breakdown-title">Operating Systems</div>
                    <div className="breakdown-list compact">
                      {analytics.osBreakdown.map((os) => (
                        <div className="breakdown-item compact" key={os.name}>
                          <span className="breakdown-name">{os.name}</span>
                          <span className="breakdown-badge">{os.visitors} visitors</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Browsers */}
                  <div className="analytics-card">
                    <div className="analytics-card-header">
                      <div className="card-title-group">
                        <Globe size={18} className="card-icon" />
                        <div>
                          <h3>Browsers & In-App</h3>
                          <p>Web browser and app webview usage</p>
                        </div>
                      </div>
                    </div>
                    <div className="breakdown-list">
                      {analytics.browserBreakdown.length === 0 ? (
                        <div className="breakdown-empty">No browser data available.</div>
                      ) : (
                        analytics.browserBreakdown.map((b, idx) => {
                          const maxViews = analytics.browserBreakdown[0].views || 1;
                          const percent = Math.round((b.views / maxViews) * 100);
                          return (
                            <div className="breakdown-item" key={idx}>
                              <div className="breakdown-info">
                                <span className="breakdown-name">{b.name}</span>
                                <span className="breakdown-stats">
                                  <strong>{b.visitors.toLocaleString()}</strong> visitors
                                </span>
                              </div>
                              <div className="breakdown-bar-bg">
                                <div className="breakdown-bar-fill purple" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Real-time Activity Stream */}
                <div className="analytics-card stream-card">
                  <div className="analytics-card-header">
                    <div className="card-title-group">
                      <Clock size={18} className="card-icon" />
                      <div>
                        <h3>Live Visitor Activity Stream</h3>
                        <p>Real-time log of recent page visits</p>
                      </div>
                    </div>
                    {lastRefreshed && (
                      <span className="stream-time">
                        Updated {lastRefreshed.toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  <div className="stream-table-container">
                    <table className="stream-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Page Path</th>
                          <th>Referrer</th>
                          <th>Device / OS</th>
                          <th>Browser</th>
                          <th>Visitor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.recentVisits.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="stream-empty">
                              No recent page visits recorded yet.
                            </td>
                          </tr>
                        ) : (
                          analytics.recentVisits.map((v) => (
                            <tr key={v.id}>
                              <td className="stream-cell-time">{formatRelativeTime(v.createdAt)}</td>
                              <td className="stream-cell-path">
                                <code>{v.path}</code>
                              </td>
                              <td className="stream-cell-ref">
                                <span className="ref-badge">{v.referrer}</span>
                              </td>
                              <td>
                                <span className="device-badge">
                                  {v.deviceType} &bull; {v.os}
                                </span>
                              </td>
                              <td>{v.browser}</td>
                              <td className="stream-cell-visitor font-mono">{v.visitorIdMasked}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* =========================================================
             ARCHIVE IMPORTER TAB
             ========================================================= */
          <div>
            <div className="admin-title">
              <h1>Publish a result year</h1>
              <p>
                Paste the official MOEYS Facebook or Telegram post containing all 25 province and capital PDF
                links. The server discovers, downloads, validates, indexes, and publishes the archive automatically.
              </p>
            </div>

            <form className="admin-card" onSubmit={startImport}>
              <div className="admin-card-title">
                <UploadCloud />
                <div>
                  <h2>New archive import</h2>
                  <p>Only one CPU-intensive import can run at a time.</p>
                </div>
              </div>
              <div className="admin-fields">
                <label>
                  <span>
                    <KeyRound /> Admin token
                  </span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>
                    <Archive /> Result year
                  </span>
                  <input
                    type="number"
                    min="2014"
                    max={new Date().getFullYear() + 1}
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                    required
                  />
                </label>
                <label className="admin-url">
                  <span>Official Facebook or Telegram post URL</span>
                  <input
                    type="url"
                    placeholder="https://t.me/moeysnews/1234 or https://www.facebook.com/share/p/..."
                    value={postUrl}
                    onChange={(event) => setPostUrl(event.target.value)}
                    required
                  />
                </label>
              </div>
              {importerError && <div className="admin-error" role="alert">{importerError}</div>}
              <button className="admin-start" disabled={submitting || running}>
                {submitting ? <LoaderCircle className="spin" /> : <UploadCloud />}{" "}
                {running ? "Import in progress" : "Discover and import PDFs"}
              </button>
            </form>

            {job && (
              <section className={`admin-job ${job.status}`}>
                <div className="admin-job-head">
                  <div>
                    {job.status === "ready" ? (
                      <CheckCircle2 />
                    ) : running ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <Archive />
                    )}
                    <div>
                      <span>{job.year} archive</span>
                      <h2>{job.phase}</h2>
                    </div>
                  </div>
                  <strong>{progress}%</strong>
                </div>
                <div className="admin-progress">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <p>{job.error || job.message || `${job.current} of ${job.total}`}</p>
                {job.logs.length > 0 && <pre className="admin-log">{job.logs.join("\n")}</pre>}
                {running && (
                  <button className="admin-cancel" type="button" onClick={cancelImport}>
                    <Square /> Cancel import
                  </button>
                )}
                {job.status === "ready" && (
                  <a className="admin-open" href={`/#archive?year=${job.year}`}>
                    Open published archive
                  </a>
                )}
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
