import express from "express";
import { existsSync, createReadStream } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { join } from "node:path";
import { discoveries, getZipSize, photosFromUrls, startDiscovery, startZip, zipJobs } from "./jobs.ts";
import { cancelOcr, OcrQueueFullError, ocrJobs, ocrRuntimeStatus, startOcr } from "./ocr.ts";
import { fetchFacebookImage } from "./security.ts";
import { databaseStats } from "./database.ts";
import {
  getArchiveCenters, getArchivePdf, getArchiveSchools, getArchiveStudentStats, getArchiveStudents,
  getArchiveSubjectDetail, getArchiveSubjectOverview, getArchiveSummary, getPhnomPenhDistrictStats,
  listArchiveYears, searchArchive, warmupArchiveCache,
} from "./archive.ts";
import { getArchiveNameImage, getArchivePageImage } from "./archive-images.ts";
import { getArchiveSchoolImage } from "./archive-school-images.ts";
import {
  archiveImportJobs, cancelArchiveImport, publicArchiveImport, requireAdmin, startArchiveImport,
} from "./admin-archive.ts";
import type { Photo } from "./types.ts";

const app = express();
const port = Number(process.env.PORT || 8787);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);
app.disable("x-powered-by");
app.use((request, response, next) => {
  const origin = request.headers.origin?.replace(/\/$/, "");
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    return response.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  }
  next();
});
app.use(express.json({ limit: "2mb" }));

function publicDiscovery(job: NonNullable<ReturnType<typeof discoveries.get>>) {
  return {
    id: job.id, status: job.status, phase: job.phase, current: job.current,
    total: job.total, photos: job.status === "ready" ? job.photos : [], cacheHit: job.cacheHit, error: job.error,
  };
}

function publicZip(job: NonNullable<ReturnType<typeof zipJobs.get>>) {
  return {
    id: job.id, status: job.status, phase: job.phase, current: job.current,
    total: job.total, bytes: job.bytes, failures: job.failures, fileName: job.fileName,
    error: job.error,
  };
}

function publicOcr(job: NonNullable<ReturnType<typeof ocrJobs.get>>) {
  return {
    id: job.id, status: job.status, phase: job.phase, current: job.current,
    total: job.total, includeNames: job.includeNames, model: job.model,
    results: job.results, failures: job.failures, cacheHits: job.cacheHits, error: job.error,
  };
}

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/ocr/status", (_request, response) => response.json(ocrRuntimeStatus()));
app.get("/api/server/status", (_request, response) => {
  const ocr = ocrRuntimeStatus();
  const discoveriesRunning = [...discoveries.values()].filter((job) => job.status === "queued" || job.status === "working").length;
  const zipsRunning = [...zipJobs.values()].filter((job) => job.status === "queued" || job.status === "working").length;
  const archiveImportsRunning = [...archiveImportJobs.values()].filter((job) => job.status === "queued" || job.status === "working").length;
  const currentRequests = discoveriesRunning + zipsRunning + ocr.running + archiveImportsRunning;
  const queuedRequests = ocr.queued;
  const loadRatio = loadavg()[0] / Math.max(1, availableParallelism());
  const status = archiveImportsRunning > 0 || queuedRequests > 0 || loadRatio >= 0.9
    ? "busy"
    : currentRequests > 0 || loadRatio >= 0.35 ? "normal" : "idle";
  response.setHeader("Cache-Control", "no-store");
  response.json({ status, currentRequests, queuedRequests, updatedAt: Date.now() });
});
app.get("/api/database/stats", (_request, response) => response.json(databaseStats()));

app.get("/api/admin/archive-imports", requireAdmin, (_request, response) => {
  response.setHeader("Cache-Control", "private, no-store");
  response.json({ jobs: [...archiveImportJobs.values()].slice(-20).reverse().map(publicArchiveImport) });
});

app.post("/api/admin/archive-imports", requireAdmin, (request, response) => {
  try {
    const job = startArchiveImport(String(request.body?.postUrl || ""), request.body?.year);
    response.status(202).json(publicArchiveImport(job));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the archive import.";
    response.status(message.includes("already running") ? 409 : 400).json({ error: message });
  }
});

app.get("/api/admin/archive-imports/:id", requireAdmin, (request, response) => {
  const job = archiveImportJobs.get(String(request.params.id));
  if (!job) return response.status(404).json({ error: "Archive import not found." });
  response.setHeader("Cache-Control", "private, no-store");
  response.json(publicArchiveImport(job));
});

app.delete("/api/admin/archive-imports/:id", requireAdmin, (request, response) => {
  const job = archiveImportJobs.get(String(request.params.id));
  if (!job) return response.status(404).json({ error: "Archive import not found." });
  if (job.status === "queued" || job.status === "working") cancelArchiveImport(job);
  response.status(204).end();
});

app.get("/api/archive/years", (_request, response) => {
  response.setHeader("Cache-Control", "public, max-age=300");
  response.json({ years: listArchiveYears() });
});

app.get("/api/archive/:year/summary", (request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=300");
    response.json(getArchiveSummary(request.params.year));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Archive not found." });
  }
});

app.get("/api/archive/:year/centers", (request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=300");
    response.json({ centers: getArchiveCenters(request.params.year, String(request.query.province || "") || undefined) });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Archive not found." });
  }
});

app.get("/api/archive/:year/schools", (request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=300");
    const province = String(request.query.province || "") || undefined;
    const khan = String(request.query.khan || "") || undefined;
    const schoolType = (request.query.schoolType as "all" | "public" | "private") || undefined;
    const search = String(request.query.search || "") || undefined;
    const sort = String(request.query.sort || "") as "candidates" | "gradeA" | "gradeAPercent" | "name";
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const schools = getArchiveSchools(request.params.year, { province, khan, schoolType, search, sort, limit });
    response.json({ schools, count: schools.length });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Archive not found." });
  }
});

app.get("/api/archive/:year/districts/phnom-penh", (request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=300");
    const districts = getPhnomPenhDistrictStats(request.params.year);
    response.json({ districts, count: districts.length });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "District data not found." });
  }
});

app.get("/api/archive/:year/subjects/overview", (request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=300");
    const overview = getArchiveSubjectOverview(request.params.year);
    response.json({ overview, count: overview.length });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Archive not found." });
  }
});

app.get("/api/archive/:year/subjects/detail", (request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=300");
    const track = request.query.track === "social-science" ? "social-science" : "science";
    const subject = String(request.query.subject || "") as any;
    const province = String(request.query.province || "") || undefined;
    const schoolType = (request.query.schoolType as "all" | "public" | "private") || undefined;
    const search = String(request.query.search || "") || undefined;
    const sort = String(request.query.sort || "") as any;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const detail = getArchiveSubjectDetail(request.params.year, { track, subject, province, schoolType, search, sort, limit });
    response.json(detail);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Subject data not found." });
  }
});

app.get("/api/archive/:year/students/stats", (request, response) => {
  try {
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const stats = getArchiveStudentStats(request.params.year);
    response.json(stats);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Student stats not found." });
  }
});

app.get("/api/archive/:year/students", (request, response) => {
  try {
    response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const aCount = request.query.aCount ? (request.query.aCount === "all" ? "all" : Number(request.query.aCount)) : undefined;
    const grade = String(request.query.grade || "") || undefined;
    const province = String(request.query.province || "") || undefined;
    const khan = String(request.query.khan || "") || undefined;
    const schoolType = (request.query.schoolType as "all" | "public" | "private") || undefined;
    const track = (request.query.track as "science" | "social-science") || undefined;
    const gender = (request.query.gender as "all" | "female" | "male") || undefined;
    const search = String(request.query.search || "") || undefined;
    const sort = (request.query.sort as "aCount" | "tableNumber" | "name") || undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const offset = request.query.offset ? Number(request.query.offset) : undefined;

    const data = getArchiveStudents(request.params.year, {
      aCount,
      grade,
      province,
      khan,
      schoolType,
      track,
      gender,
      search,
      sort,
      limit,
      offset,
    });
    response.json(data);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Student data not found." });
  }
});

app.get("/api/archive/:year/search", (request, response) => {
  try {
    response.setHeader("Cache-Control", "private, no-store");
    const track = request.query.track === "science" || request.query.track === "social-science" ? request.query.track : undefined;
    const results = searchArchive(request.params.year, {
      tableNumber: String(request.query.tableNumber || ""),
      province: String(request.query.province || "") || undefined,
      center: String(request.query.center || "") || undefined,
      track,
    });
    response.json({ results, count: results.length });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Search failed." });
  }
});

app.get("/api/archive/:year/documents/:documentId/pdf", (request, response) => {
  try {
    const documentId = Number(request.params.documentId);
    if (!Number.isSafeInteger(documentId)) return response.status(400).json({ error: "Invalid document." });
    const file = getArchivePdf(request.params.year, documentId);
    if (!file) return response.status(404).json({ error: "PDF not found." });
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.setHeader("Content-Disposition", `inline; filename="bacii-${request.params.year}-${documentId}.pdf"`);
    response.sendFile(file);
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "PDF not found." });
  }
});

app.get("/api/archive/:year/documents/:documentId/pages/:pageNumber/image", async (request, response) => {
  try {
    const documentId = Number(request.params.documentId);
    const pageNumber = Number(request.params.pageNumber);
    const hideDob = request.query.hide_dob === "1" || request.query.hide_dob === "true" || request.query.hideDob === "1";
    if (!Number.isSafeInteger(documentId) || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      return response.status(400).json({ error: "Invalid document or page number." });
    }
    const file = await getArchivePageImage(request.params.year, documentId, pageNumber, hideDob);
    if (!file) return response.status(404).json({ error: "Page not found." });
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("Content-Type", "image/jpeg");
    response.sendFile(file);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not render the official page." });
  }
});

app.get("/api/archive/:year/documents/:documentId/view", (request, response) => {
  try {
    const documentId = Number(request.params.documentId);
    const pageNumber = Math.max(1, Number(request.query.page || 1));
    const year = request.params.year;
    // Default to hiding DoB for privacy unless explicitly asked to show with hide_dob=0
    const hideDob = request.query.hide_dob !== "0" && request.query.hide_dob !== "false";

    if (!Number.isSafeInteger(documentId)) return response.status(400).send("Invalid document.");
    const file = getArchivePdf(year, documentId);
    if (!file) return response.status(404).send("PDF not found.");

    const imageUrlNoDob = `/api/archive/${year}/documents/${documentId}/pages/${pageNumber}/image?hide_dob=1`;
    const imageUrlFull = `/api/archive/${year}/documents/${documentId}/pages/${pageNumber}/image`;
    const imageUrl = hideDob ? imageUrlNoDob : imageUrlFull;
    const prevPage = pageNumber > 1 ? pageNumber - 1 : null;
    const nextPage = pageNumber + 1;
    const downloadPdfUrl = `/api/archive/${year}/documents/${documentId}/pdf`;

    const html = `<!DOCTYPE html>
<html lang="km">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BacII ${year} — Official Result Page ${pageNumber}</title>
  <style>
    :root {
      --bg: #0b1220;
      --card: #111c2f;
      --card-hover: #17243c;
      --line: #2b3b55;
      --ink: #eaf1ff;
      --muted: #9fb0ca;
      --primary: #2563eb;
      --green: #10b981;
      --green-dark: #059669;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--ink);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      background: rgba(11, 18, 32, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--line);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 700;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .nav-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      background: var(--card);
      border: 1px solid var(--line);
      color: var(--ink);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .nav-btn:hover {
      background: var(--card-hover);
      border-color: var(--primary);
      color: #fff;
    }
    .page-indicator {
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      height: 32px;
      font-size: 13px;
      font-weight: 700;
      color: var(--ink);
      background: var(--card);
      border-radius: 8px;
      border: 1px solid var(--line);
    }
    .privacy-toggle-btn {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.35);
      color: #34d399;
    }
    .privacy-toggle-btn:hover {
      background: rgba(16, 185, 129, 0.22);
      border-color: #34d399;
      color: #fff;
    }
    .privacy-toggle-btn.revealed {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.35);
      color: #f87171;
    }
    .privacy-toggle-btn.revealed:hover {
      background: rgba(239, 68, 68, 0.22);
      border-color: #f87171;
      color: #fff;
    }
    .zoom-btn {
      padding: 0 9px;
      font-size: 14px;
    }
    .content-area {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 20px 12px;
      overflow: auto;
    }
    .page-container {
      position: relative;
      display: inline-block;
      max-width: 100%;
      transition: transform 0.15s ease;
      transform-origin: top center;
    }
    .page-img {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
      background: #fff;
    }
    .status-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: rgba(17, 28, 47, 0.95);
      border: 1px solid var(--line);
      color: var(--ink);
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      pointer-events: none;
      opacity: 0;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 999;
    }
    .status-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <span>BacII ${year} — ទំព័រ ${pageNumber} (Page ${pageNumber})</span>
    </div>
    <div class="header-actions">
      <!-- DoB Privacy Toggle -->
      <button
        id="toggleDobBtn"
        type="button"
        class="nav-btn privacy-toggle-btn ${hideDob ? "" : "revealed"}"
        onclick="toggleDob()"
        title="${hideDob ? "Click to reveal Date of Birth column" : "Click to hide Date of Birth column"}"
      >
        <span id="toggleDobIcon">${hideDob ? "🔒" : "👁️"}</span>
        <span id="toggleDobText">${hideDob ? "លាក់ថ្ងៃខែ (DoB Hidden)" : "បង្ហាញថ្ងៃខែ (DoB Shown)"}</span>
      </button>

      <!-- Zoom Controls -->
      <button type="button" class="nav-btn zoom-btn" onclick="zoom(-0.15)" title="Zoom out">−</button>
      <button type="button" class="nav-btn zoom-btn" onclick="resetZoom()" title="Reset zoom">100%</button>
      <button type="button" class="nav-btn zoom-btn" onclick="zoom(0.15)" title="Zoom in">+</button>

      <!-- Navigation -->
      ${prevPage ? `<a id="prevBtn" class="nav-btn" href="/api/archive/${year}/documents/${documentId}/view?page=${prevPage}&hide_dob=${hideDob ? 1 : 0}">← មុន (Prev)</a>` : ""}
      <span class="page-indicator">ទំព័រ ${pageNumber}</span>
      <a id="nextBtn" class="nav-btn" href="/api/archive/${year}/documents/${documentId}/view?page=${nextPage}&hide_dob=${hideDob ? 1 : 0}">បន្ទាប់ (Next) →</a>
      <a class="nav-btn" href="${downloadPdfUrl}" download style="margin-left:8px;font-size:11.5px;opacity:0.85;">ទាញយក PDF</a>
    </div>
  </header>
  <main class="content-area">
    <div id="pageContainer" class="page-container">
      <img id="pageImage" src="${imageUrl}" alt="Official PDF Page ${pageNumber}" class="page-img" />
    </div>
  </main>
  <div id="toast" class="status-toast"></div>

  <script>
    const urlNoDob = ${JSON.stringify(imageUrlNoDob)};
    const urlFull = ${JSON.stringify(imageUrlFull)};
    let isHidden = ${hideDob};
    let currentZoom = 1.0;

    // Check localStorage preference on load if user previously chose a setting
    const savedPref = localStorage.getItem("bacii_pdf_hide_dob");
    if (savedPref !== null) {
      const wantHide = savedPref === "1";
      if (wantHide !== isHidden) {
        setDobState(wantHide, false);
      }
    }

    function showToast(msg) {
      const toast = document.getElementById("toast");
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2000);
    }

    function setDobState(hide, notify = true) {
      isHidden = hide;
      localStorage.setItem("bacii_pdf_hide_dob", isHidden ? "1" : "0");
      const img = document.getElementById("pageImage");
      const btn = document.getElementById("toggleDobBtn");
      const icon = document.getElementById("toggleDobIcon");
      const text = document.getElementById("toggleDobText");

      img.src = isHidden ? urlNoDob : urlFull;

      if (isHidden) {
        btn.classList.remove("revealed");
        icon.textContent = "🔒";
        text.textContent = "លាក់ថ្ងៃខែ (DoB Hidden)";
        btn.title = "Click to reveal Date of Birth column";
        if (notify) showToast("🔒 DoB column hidden for privacy");
      } else {
        btn.classList.add("revealed");
        icon.textContent = "👁️";
        text.textContent = "បង្ហាញថ្ងៃខែ (DoB Shown)";
        btn.title = "Click to hide Date of Birth column";
        if (notify) showToast("👁️ DoB column visible");
      }

      // Update Prev / Next links to preserve state
      const prevBtn = document.getElementById("prevBtn");
      if (prevBtn) {
        const u = new URL(prevBtn.href, window.location.origin);
        u.searchParams.set("hide_dob", isHidden ? "1" : "0");
        prevBtn.href = u.pathname + u.search;
      }
      const nextBtn = document.getElementById("nextBtn");
      if (nextBtn) {
        const u = new URL(nextBtn.href, window.location.origin);
        u.searchParams.set("hide_dob", isHidden ? "1" : "0");
        nextBtn.href = u.pathname + u.search;
      }

      // Update current URL without reload
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("hide_dob", isHidden ? "1" : "0");
      window.history.replaceState({}, "", currentUrl.pathname + currentUrl.search);
    }

    function toggleDob() {
      setDobState(!isHidden, true);
    }

    function zoom(delta) {
      currentZoom = Math.min(2.5, Math.max(0.6, currentZoom + delta));
      const container = document.getElementById("pageContainer");
      container.style.transform = "scale(" + currentZoom + ")";
    }

    function resetZoom() {
      currentZoom = 1.0;
      const container = document.getElementById("pageContainer");
      container.style.transform = "none";
    }

    // Keyboard shortcuts: [Left/Right] arrows for prev/next, [H] to toggle DoB
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        const p = document.getElementById("prevBtn");
        if (p) p.click();
      } else if (e.key === "ArrowRight") {
        const n = document.getElementById("nextBtn");
        if (n) n.click();
      } else if (e.key.toLowerCase() === "h") {
        toggleDob();
      }
    });
  </script>
</body>
</html>`;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.send(html);
  } catch (error) {
    response.status(500).send("Could not display the page viewer.");
  }
});

app.get("/api/archive/:year/students/:studentId/name-image", async (request, response) => {
  try {
    const studentId = Number(request.params.studentId);
    if (!Number.isSafeInteger(studentId)) return response.status(400).json({ error: "Invalid student." });
    const file = await getArchiveNameImage(request.params.year, studentId);
    if (!file) return response.status(404).json({ error: "Student name image not found." });
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("Content-Type", "image/png");
    response.sendFile(file);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not render the official name." });
  }
});

app.get("/api/archive/:year/students/:studentId/school-image", async (request, response) => {
  try {
    const studentId = Number(request.params.studentId);
    if (!Number.isSafeInteger(studentId)) return response.status(400).json({ error: "Invalid student." });
    const file = await getArchiveSchoolImage(request.params.year, studentId);
    if (!file) return response.status(404).json({ error: "Student school image not found." });
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("Content-Type", "image/png");
    response.sendFile(file);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Could not render the official school name." });
  }
});

app.post("/api/discover", (request, response) => {
  try {
    const url = String(request.body?.url ?? "");
    const job = startDiscovery(url, request.body?.forceRefresh === true);
    response.status(202).json(publicDiscovery(job));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Invalid album URL." });
  }
});

app.get("/api/discover/:id", (request, response) => {
  const job = discoveries.get(request.params.id);
  if (!job) return response.status(404).json({ error: "Discovery job not found." });
  response.json(publicDiscovery(job));
});

app.get("/api/discover/:id/photo/:photoId/download", async (request, response) => {
  const job = discoveries.get(request.params.id);
  if (!job || job.status !== "ready") return response.status(404).json({ error: "Album scan not found or expired." });
  const photo = job.photos.find((candidate) => candidate.id === request.params.photoId);
  if (!photo) return response.status(404).json({ error: "Photo not found in this album." });
  try {
    const controller = new AbortController();
    response.once("close", () => controller.abort());
    const source = await fetchFacebookImage(photo.url, controller.signal);
    const declaredSize = Number(source.headers.get("content-length") || 0);
    if (declaredSize > 50 * 1024 * 1024) throw new Error("Photo exceeds the 50 MB safety limit.");
    const data = Buffer.from(await source.arrayBuffer());
    if (data.byteLength > 50 * 1024 * 1024) throw new Error("Photo exceeds the 50 MB safety limit.");
    const contentType = source.headers.get("content-type") || "image/jpeg";
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "jpg";
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", data.byteLength);
    response.setHeader("Content-Disposition", `attachment; filename="bacii-${photo.id}.${extension}"`);
    response.send(data);
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "Could not download this photo." });
  }
});

app.delete("/api/discover/:id", (request, response) => {
  const job = discoveries.get(request.params.id);
  if (!job) return response.status(404).json({ error: "Discovery job not found." });
  job.controller.abort();
  job.status = "cancelled";
  job.phase = "Scan cancelled";
  response.status(204).end();
});

app.post("/api/zip", async (request, response) => {
  try {
    let photos: Photo[] = [];
    if (typeof request.body?.discoveryId === "string") {
      const discovery = discoveries.get(request.body.discoveryId);
      if (!discovery || discovery.status !== "ready") throw new Error("The album scan is not ready.");
      const selected = Array.isArray(request.body.photoIds) ? new Set(request.body.photoIds.map(String)) : null;
      photos = selected ? discovery.photos.filter((photo) => selected.has(photo.id)) : discovery.photos;
    } else if (Array.isArray(request.body?.urls)) {
      photos = photosFromUrls(request.body.urls.map(String));
    }
    if (photos.length === 0) throw new Error("Choose at least one photo.");
    if (photos.length > 2_000) throw new Error("A single ZIP can contain up to 2,000 photos.");
    const job = await startZip(photos, String(request.body?.name ?? "facebook-album"));
    response.status(202).json(publicZip(job));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not start the ZIP." });
  }
});

app.get("/api/zip/:id", (request, response) => {
  const job = zipJobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: "ZIP job not found." });
  response.json(publicZip(job));
});

app.get("/api/zip/:id/download", async (request, response) => {
  const job = zipJobs.get(request.params.id);
  if (!job || job.status !== "ready" || !existsSync(job.filePath)) {
    return response.status(404).json({ error: "ZIP is not ready or has expired." });
  }
  const size = await getZipSize(job);
  response.setHeader("Content-Type", "application/zip");
  response.setHeader("Content-Length", size);
  response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(job.fileName)}`);
  createReadStream(job.filePath).pipe(response);
});

app.delete("/api/zip/:id", (request, response) => {
  const job = zipJobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: "ZIP job not found." });
  job.controller.abort();
  response.status(204).end();
});

app.post("/api/ocr", (request, response) => {
  try {
    const discovery = discoveries.get(String(request.body?.discoveryId ?? ""));
    if (!discovery || discovery.status !== "ready") throw new Error("The album scan is not ready.");
    const requested = Array.isArray(request.body?.photoIds) ? new Set(request.body.photoIds.map(String)) : null;
    const photos = requested ? discovery.photos.filter((photo) => requested.has(photo.id)) : discovery.photos;
    if (photos.length === 0) throw new Error("Choose at least one result-sheet photo.");
    if (photos.length > 500) throw new Error("A single OCR job can analyze up to 500 photos.");
    const job = startOcr(photos, request.body?.includeNames === true);
    response.status(202).json(publicOcr(job));
  } catch (error) {
    if (error instanceof OcrQueueFullError) response.setHeader("Retry-After", "30");
    response.status(error instanceof OcrQueueFullError ? 429 : 400)
      .json({ error: error instanceof Error ? error.message : "Could not start Khmer OCR." });
  }
});

app.get("/api/ocr/:id", (request, response) => {
  const job = ocrJobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: "OCR job not found." });
  response.json(publicOcr(job));
});

app.delete("/api/ocr/:id", (request, response) => {
  const job = ocrJobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: "OCR job not found." });
  cancelOcr(job);
  response.status(204).end();
});

const dist = join(process.cwd(), "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_request, response) => response.sendFile(join(dist, "index.html")));
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`BacII Result Search Engine running at http://localhost:${port}`);
  warmupArchiveCache();
});
