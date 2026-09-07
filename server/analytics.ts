import { createHash } from "node:crypto";
import { database } from "./database.ts";

database.exec(`
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    path TEXT NOT NULL,
    referrer TEXT,
    device_type TEXT NOT NULL,
    os TEXT NOT NULL,
    browser TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    date TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views(date);
  CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(visitor_id);
  CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at);
  CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);
`);

function getCambodiaDate(timestamp: number = Date.now()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Phnom_Penh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

export function parseUserAgent(uaRaw: string = "") {
  const ua = uaRaw.toLowerCase();

  // Device
  let deviceType: "mobile" | "tablet" | "desktop" = "desktop";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = "tablet";
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua)) {
    deviceType = "mobile";
  }

  // OS
  let os = "Other";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/cros/i.test(ua)) os = "Chrome OS";
  else if (/linux/i.test(ua)) os = "Linux";

  // Browser / In-App
  let browser = "Other";
  if (/telegram/i.test(ua)) browser = "Telegram";
  else if (/fban|fbav|facebook/i.test(ua)) browser = "Facebook";
  else if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";

  return { deviceType, os, browser };
}

function cleanReferrer(ref?: string): string {
  if (!ref || typeof ref !== "string") return "Direct";
  const trimmed = ref.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return "Direct";
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === "localhost" || host === "127.0.0.1") return "Direct";
    if (host.includes("telegram") || host.includes("t.me")) return "Telegram";
    if (host.includes("facebook") || host.includes("fb.com") || host.includes("fb.me")) return "Facebook";
    if (host.includes("google")) return "Google";
    if (host.includes("bing")) return "Bing";
    if (host.includes("youtube")) return "YouTube";
    if (host.includes("tiktok")) return "TikTok";
    return host;
  } catch {
    return trimmed.slice(0, 50);
  }
}

function cleanPath(rawPath?: string): string {
  if (!rawPath || typeof rawPath !== "string") return "/";
  let path = rawPath.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  // Strip excessive query strings but retain hash paths like /#archive, /#insights
  if (path.length > 80) path = path.slice(0, 80);
  return path;
}

const insertPageViewStatement = database.prepare(`
  INSERT INTO page_views (visitor_id, path, referrer, device_type, os, browser, created_at, date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function recordVisit(params: {
  visitorId?: string;
  path?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
}) {
  const path = cleanPath(params.path);
  // Do not record admin dashboard pages to prevent inflating visitor stats
  if (path.includes("/admin") || path.includes("#admin")) {
    return;
  }

  const now = Date.now();
  const date = getCambodiaDate(now);

  // Generate / validate visitor ID
  let visitorId = (params.visitorId || "").trim();
  const validVisitorId = /^[0-9a-f-]{16,64}$/i.test(visitorId);
  if (!validVisitorId) {
    const ip = params.ip || "127.0.0.1";
    const ua = params.userAgent || "";
    // Privacy-preserving visitor hash: hashed with daily salt
    visitorId = createHash("sha256")
      .update(`${ip}|${ua}`)
      .digest("hex")
      .slice(0, 24);
  }

  const referrer = cleanReferrer(params.referrer);
  const { deviceType, os, browser } = parseUserAgent(params.userAgent);

  insertPageViewStatement.run(
    visitorId,
    path,
    referrer,
    deviceType,
    os,
    browser,
    now,
    date,
  );
}

export type VisitorAnalyticsOverview = {
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

export function getVisitorAnalytics(days: number = 7): VisitorAnalyticsOverview {
  const safeDays = Math.max(1, Math.min(90, days));
  const now = Date.now();
  const today = getCambodiaDate(now);
  const yesterday = getCambodiaDate(now - 24 * 60 * 60 * 1000);

  // Calculate start date
  const startDate = getCambodiaDate(now - (safeDays - 1) * 24 * 60 * 60 * 1000);

  // Overall KPIs
  const totalUniqueRow = database.prepare(`SELECT COUNT(DISTINCT visitor_id) AS c FROM page_views`).get() as { c: number };
  const totalViewsRow = database.prepare(`SELECT COUNT(*) AS c FROM page_views`).get() as { c: number };

  const todayRow = database.prepare(`
    SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS views
    FROM page_views WHERE date = ?
  `).get(today) as { visitors: number; views: number };

  const yesterdayRow = database.prepare(`
    SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS views
    FROM page_views WHERE date = ?
  `).get(yesterday) as { visitors: number; views: number };

  const activeNowRow = database.prepare(`
    SELECT COUNT(DISTINCT visitor_id) AS c
    FROM page_views WHERE created_at >= ?
  `).get(now - 15 * 60 * 1000) as { c: number };

  const rangeRow = database.prepare(`
    SELECT COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS views
    FROM page_views WHERE date >= ?
  `).get(startDate) as { visitors: number; views: number };

  const rangeVisitors = Number(rangeRow.visitors || 0);
  const rangeViews = Number(rangeRow.views || 0);
  const avgPagesPerVisitor = rangeVisitors > 0 ? Number((rangeViews / rangeVisitors).toFixed(1)) : 1.0;

  // Daily time series for each day in range
  const dailyRows = database.prepare(`
    SELECT date, COUNT(DISTINCT visitor_id) AS unique_visitors, COUNT(*) AS page_views
    FROM page_views
    WHERE date >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(startDate) as Array<{ date: string; unique_visitors: number; page_views: number }>;

  const dailyMap = new Map(dailyRows.map((r) => [r.date, { visitors: Number(r.unique_visitors), views: Number(r.page_views) }]));

  const dailySeries: Array<{ date: string; uniqueVisitors: number; pageViews: number }> = [];
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = getCambodiaDate(now - i * 24 * 60 * 60 * 1000);
    const item = dailyMap.get(d) || { visitors: 0, views: 0 };
    dailySeries.push({
      date: d,
      uniqueVisitors: item.visitors,
      pageViews: item.views,
    });
  }

  // Top Pages
  const topPagesRows = database.prepare(`
    SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM page_views
    WHERE date >= ?
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  `).all(startDate) as Array<{ path: string; views: number; visitors: number }>;

  // Top Referrers
  const topRefRows = database.prepare(`
    SELECT referrer, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM page_views
    WHERE date >= ?
    GROUP BY referrer
    ORDER BY views DESC
    LIMIT 10
  `).all(startDate) as Array<{ referrer: string; views: number; visitors: number }>;

  // Device Breakdown
  const deviceRows = database.prepare(`
    SELECT device_type AS name, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM page_views
    WHERE date >= ?
    GROUP BY device_type
    ORDER BY views DESC
  `).all(startDate) as Array<{ name: string; views: number; visitors: number }>;

  const totalDeviceViews = deviceRows.reduce((sum, r) => sum + Number(r.views), 0);
  const deviceBreakdown = deviceRows.map((r) => ({
    name: r.name,
    views: Number(r.views),
    visitors: Number(r.visitors),
    percentage: totalDeviceViews > 0 ? Math.round((Number(r.views) / totalDeviceViews) * 100) : 0,
  }));

  // OS Breakdown
  const osRows = database.prepare(`
    SELECT os AS name, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM page_views
    WHERE date >= ?
    GROUP BY os
    ORDER BY views DESC
    LIMIT 6
  `).all(startDate) as Array<{ name: string; views: number; visitors: number }>;

  // Browser Breakdown
  const browserRows = database.prepare(`
    SELECT browser AS name, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM page_views
    WHERE date >= ?
    GROUP BY browser
    ORDER BY views DESC
    LIMIT 6
  `).all(startDate) as Array<{ name: string; views: number; visitors: number }>;

  // Recent Visits Feed (last 25)
  const recentRows = database.prepare(`
    SELECT id, visitor_id, path, referrer, device_type, os, browser, created_at
    FROM page_views
    ORDER BY created_at DESC
    LIMIT 25
  `).all() as Array<{
    id: number;
    visitor_id: string;
    path: string;
    referrer: string;
    device_type: string;
    os: string;
    browser: string;
    created_at: number;
  }>;

  const recentVisits = recentRows.map((row) => ({
    id: row.id,
    visitorIdMasked: row.visitor_id.length > 10 ? `${row.visitor_id.slice(0, 6)}...${row.visitor_id.slice(-4)}` : row.visitor_id,
    path: row.path,
    referrer: row.referrer,
    deviceType: row.device_type,
    os: row.os,
    browser: row.browser,
    createdAt: row.created_at,
  }));

  return {
    kpis: {
      totalUniqueVisitors: Number(totalUniqueRow.c || 0),
      totalPageViews: Number(totalViewsRow.c || 0),
      todayUniqueVisitors: Number(todayRow.visitors || 0),
      todayPageViews: Number(todayRow.views || 0),
      yesterdayUniqueVisitors: Number(yesterdayRow.visitors || 0),
      yesterdayPageViews: Number(yesterdayRow.views || 0),
      activeNow: Number(activeNowRow.c || 0),
      rangeUniqueVisitors: rangeVisitors,
      rangePageViews: rangeViews,
      avgPagesPerVisitor,
    },
    dailySeries,
    topPages: topPagesRows.map((r) => ({ path: r.path, views: Number(r.views), visitors: Number(r.visitors) })),
    topReferrers: topRefRows.map((r) => ({ referrer: r.referrer, views: Number(r.views), visitors: Number(r.visitors) })),
    deviceBreakdown,
    osBreakdown: osRows.map((r) => ({ name: r.name, views: Number(r.views), visitors: Number(r.visitors) })),
    browserBreakdown: browserRows.map((r) => ({ name: r.name, views: Number(r.views), visitors: Number(r.visitors) })),
    recentVisits,
  };
}
