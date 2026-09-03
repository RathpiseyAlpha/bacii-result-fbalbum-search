import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import type { NextFunction, Request, Response } from "express";
import { parsePublicArchivePostUrl } from "./security.ts";

type ImportStatus = "queued" | "working" | "ready" | "error" | "cancelled";
export type ArchiveImportJob = {
  id: string;
  year: number;
  postUrl: string;
  status: ImportStatus;
  phase: string;
  current: number;
  total: number;
  message?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  logs: string[];
  child?: ChildProcessWithoutNullStreams;
  cancelled?: boolean;
};

type SeedDocument = {
  document_id: number;
  slug: string;
  province: string;
  title: string;
  source_page_url: string;
  pdf_url: string;
};

const provinceNames: Record<string, string> = {
  phnompenh: "រាជធានីភ្នំពេញ", kandal: "កណ្ដាល", pailin: "ប៉ៃលិន", stungtreng: "ស្ទឹងត្រែង",
  kohkong: "កោះកុង", oddarmeanchey: "ឧត្ដរមានជ័យ", preahvihear: "ព្រះវិហារ", ratanakiri: "រតនគិរី",
  preahsihanouk: "ព្រះសីហនុ", kratie: "ក្រចេះ", pursat: "ពោធិ៍សាត់", svayrieng: "ស្វាយរៀង",
  kampongchhnang: "កំពង់ឆ្នាំង", kampongspeu: "កំពង់ស្ពឺ", kampot: "កំពត", tboungkhmum: "ត្បូងឃ្មុំ",
  kampongthom: "កំពង់ធំ", banteaymeanchey: "បន្ទាយមានជ័យ", preyveng: "ព្រៃវែង", kampongcham: "កំពង់ចាម",
  battambang: "បាត់ដំបង", takeo: "តាកែវ", siemreap: "សៀមរាប", kep: "កែប", mondulkiri: "មណ្ឌលគិរី",
};
const governmentProvinceCodes: Record<string, string> = {
  pp: "phnompenh", kandal: "kandal", pailin: "pailin", stungtreng: "stungtreng", kohkong: "kohkong",
  oddor: "oddarmeanchey", preahv: "preahvihear", ratanakiri: "ratanakiri", shv: "preahsihanouk",
  kratie: "kratie", ps: "pursat", svayrieng: "svayrieng", kpch: "kampongchhnang", kps: "kampongspeu",
  kampot: "kampot", tb: "tboungkhmum", kpt: "kampongthom", btc: "banteaymeanchey", pv: "preyveng",
  kpc: "kampongcham", btb: "battambang", tk: "takeo", sr: "siemreap", kep: "kep", md: "mondulkiri",
};
const legacy2023ShortCodes: Record<string, string> = {
  ResultPP2023: "phnompenh", Kandal2023: "kandal", pailin2023: "pailin", StungTreng2023: "stungtreng",
  "49OINSa": "kohkong", "49NnUqF": "oddarmeanchey", "47q9gnL": "preahvihear", "40VOGcu": "ratanakiri",
  "49Oct1W": "preahsihanouk", "3SUqQvq": "kratie", "3sWWqy2": "pursat", "3Rcc55V": "svayrieng",
  KpChhnang2023: "kampongchhnang", KpSper: "kampongspeu", Kampot2023: "kampot",
  TboungKhmum2023: "tboungkhmum", KpThom2023: "kampongthom", BanteayMeanchey2023: "banteaymeanchey",
  PreyVeng2023: "preyveng", KpCham2023: "kampongcham", BaTT2023: "battambang", takeo2023: "takeo",
  ResultSR2023: "siemreap", Resultkep2023: "kep", Mondulkiri2023: "mondulkiri",
};

export const archiveImportJobs = new Map<string, ArchiveImportJob>();

function configuredToken() {
  return process.env.ADMIN_TOKEN?.trim() || "";
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const expected = configuredToken();
  if (!expected) return response.status(503).json({ error: "Archive administration is not configured." });
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return response.status(401).json({ error: "Invalid admin token." });
  }
  next();
}

export function publicArchiveImport(job: ArchiveImportJob) {
  return {
    id: job.id, year: job.year, postUrl: job.postUrl, status: job.status, phase: job.phase,
    current: job.current, total: job.total, message: job.message, error: job.error,
    createdAt: job.createdAt, updatedAt: job.updatedAt, logs: job.logs.slice(-80),
  };
}

function appendLog(job: ArchiveImportJob, value: string) {
  for (const line of value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    job.logs.push(line.slice(0, 500));
    if (job.logs.length > 200) job.logs.shift();
    const download = line.match(/^\[(\d+)\/25\]/);
    const indexing = line.match(/^Indexing\s+(\d+)\/25/);
    const ocr = line.match(/^\[(\d+)\/(\d+)\]/);
    if (job.phase === "Downloading PDFs" && download) job.current = Number(download[1]);
    if (indexing) {
      job.phase = "Building search index";
      job.current = Number(indexing[1]);
      job.total = 25;
    }
    if (job.phase === "Reading exam-center labels" && ocr) {
      job.current = Number(ocr[1]);
      job.total = Number(ocr[2]);
    }
  }
  job.updatedAt = Date.now();
}

function decodeCandidate(value: string): string[] {
  const results = [value
    .replace(/\\u003a/gi, ":")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")];
  try { results.push(decodeURIComponent(results[0])); } catch { /* Keep the original candidate. */ }
  for (const candidate of [...results]) {
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname.endsWith("facebook.com") && parsed.pathname === "/l.php") {
        const target = parsed.searchParams.get("u");
        if (target) results.push(target);
      }
    } catch { /* Ignore malformed candidates. */ }
  }
  return results;
}

export function extractBaciiSlugs(values: string[], year: number) {
  const suffix = String(year).slice(-2);
  const slugs = new Set<string>();
  for (const value of values) {
    for (const candidate of decodeCandidate(value)) {
      for (const match of candidate.matchAll(/(?:https?:\/\/[^\s"'<>]+)?\/bacii\/([a-z0-9-]+)/gi)) {
        const slug = match[1].toLowerCase().replace(/[?&#].*$/, "");
        if (slug.endsWith(suffix)) slugs.add(slug);
      }
    }
  }
  return [...slugs];
}

function extractGovernmentLinks(values: string[], year: number) {
  const links = new Map<string, string>();
  for (const value of values) {
    for (const candidate of decodeCandidate(value)) {
      for (const match of candidate.matchAll(/https:\/\/go\.gov\.kh\/moeys\/(bacii[a-z0-9_-]+)/gi)) {
        const path = match[1].toLowerCase();
        if (path.endsWith(String(year))) links.set(path, `https://go.gov.kh/moeys/${path}`);
      }
    }
  }
  return links;
}

function extractLegacy2023Links(values: string[], year: number) {
  const links = new Map<string, string>();
  if (year !== 2023) return links;
  for (const value of values) {
    for (const candidate of decodeCandidate(value)) {
      for (const match of candidate.matchAll(/https:\/\/bit\.ly\/([a-zA-Z0-9]+)/g)) {
        const base = legacy2023ShortCodes[match[1]];
        if (base) links.set(base, `https://bit.ly/${match[1]}`);
      }
    }
  }
  return links;
}

function provinceBaseFromMoeysSlug(slug: string, year: number) {
  const longSuffix = `-${year}`;
  let base = slug.startsWith("result-") && slug.endsWith(longSuffix)
    ? slug.slice("result-".length, -longSuffix.length)
    : slug.slice(0, -String(year).slice(-2).length);
  const aliases: Record<string, string> = {
    rattanakiri: "ratanakiri", oddarmanchey: "oddarmeanchey", tbongkhmum: "tboungkhmum",
  };
  base = aliases[base] || base;
  return provinceNames[base] ? base : "";
}

function googleDriveDownload(destination: URL) {
  if (destination.hostname !== "drive.google.com") return "";
  const fileId = destination.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1];
  return fileId ? `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t` : "";
}

async function resolveGovernmentPdf(shortUrl: string) {
  const response = await fetch(shortUrl, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status < 300 || response.status >= 400) {
    throw new Error(`Government document link did not redirect (${response.status}): ${shortUrl}`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error(`Government document link returned no destination: ${shortUrl}`);
  const destination = new URL(location, shortUrl);
  if (destination.hostname === "file.go.gov.kh" && destination.pathname.toLowerCase().endsWith(".pdf")) {
    return destination.toString();
  }
  const driveDownload = googleDriveDownload(destination);
  if (driveDownload) return driveDownload;
  throw new Error(`Government document link redirected to an unsupported host: ${destination.hostname}`);
}

async function resolveLegacy2023Pdf(shortUrl: string) {
  const response = await fetch(shortUrl, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status < 300 || response.status >= 400) {
    throw new Error(`Official 2023 document link did not redirect (${response.status}): ${shortUrl}`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error(`Official 2023 document link returned no destination: ${shortUrl}`);
  const destination = new URL(location, shortUrl);
  const driveDownload = googleDriveDownload(destination);
  if (!driveDownload) throw new Error(`Official 2023 document link redirected to an unsupported host: ${destination.hostname}`);
  return driveDownload;
}

export async function discoverArchiveDocuments(postUrl: string, year: number, job: ArchiveImportJob): Promise<SeedDocument[]> {
  job.phase = "Discovering PDF links";
  job.total = 25;
  const source = new URL(postUrl);
  let sourceValues: string[];
  if (source.hostname === "t.me" || source.hostname.endsWith(".t.me") || source.hostname === "telegram.me") {
    const response = await fetch(postUrl, {
      headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`Telegram post request failed (${response.status}).`);
    const html = await response.text();
    sourceValues = [html, postUrl];
  } else {
    const browser = await chromium.launch({ headless: true, args: ["--disable-blink-features=AutomationControlled"] });
    try {
    const context = await browser.newContext({
      locale: "en-US", viewport: { width: 1440, height: 1000 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2_000);
    await page.getByText(/see more/i).first().click({ timeout: 2_000 }).catch(() => undefined);
    for (let pass = 0; pass < 8; pass += 1) {
      if (job.cancelled) throw new Error("Import cancelled.");
      await page.mouse.wheel(0, 1_200);
      await page.waitForTimeout(350);
    }
    const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
    const html = await page.content();
    const rawUrls = html.match(/https?(?:\\u003A|:)(?:\\\/|\/){2}[^\s"'<>]+/gi) || [];
      sourceValues = [...hrefs, ...rawUrls, html, page.url()];
    } finally {
      await browser.close();
    }
  }
    const slugs = extractBaciiSlugs(sourceValues, year);
    const governmentLinks = extractGovernmentLinks(sourceValues, year);
    const legacy2023Links = extractLegacy2023Links(sourceValues, year);
    appendLog(job, `Found ${Math.max(slugs.length, governmentLinks.size, legacy2023Links.size)} unique BacII document links in the public post.`);
    const documents: SeedDocument[] = [];
    if (slugs.length === 25) for (const slug of slugs.slice().sort((left, right) =>
      Object.keys(provinceNames).indexOf(provinceBaseFromMoeysSlug(left, year))
      - Object.keys(provinceNames).indexOf(provinceBaseFromMoeysSlug(right, year)))) {
      if (job.cancelled) throw new Error("Import cancelled.");
      const base = provinceBaseFromMoeysSlug(slug, year);
      const province = provinceNames[base];
      if (!province) throw new Error(`Unknown province document slug: ${slug}`);
      const apiUrl = `https://moeys.gov.kh/api/v1/web/get-document-detail-with-category/bacii/${slug}`;
      const response = await fetch(apiUrl, {
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`MOEYS metadata request failed for ${slug} (${response.status}).`);
      const responseText = await response.text();
      let payload: { documentDetail?: Record<string, unknown> };
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error(`MOEYS metadata API for ${slug} returned HTML or invalid JSON (${response.status}). The server or firewall may be blocking non-browser requests.`);
      }
      const detail = payload.documentDetail;
      const file = detail?.document_file as Record<string, unknown> | undefined;
      if (!detail || typeof detail.id !== "number" || typeof detail.title !== "string" || typeof file?.kh !== "string") {
        throw new Error(`MOEYS returned incomplete metadata for ${slug}.`);
      }
      const pdfUrl = new URL(file.kh, "https://moeys.gov.kh/");
      if (pdfUrl.protocol !== "https:" || !(pdfUrl.hostname === "moeys.gov.kh" || pdfUrl.hostname.endsWith(".moeys.gov.kh"))) {
        throw new Error(`MOEYS returned an unsafe PDF URL for ${slug}.`);
      }
      documents.push({ document_id: detail.id, slug: `${base}${String(year).slice(-2)}`, province, title: detail.title,
        source_page_url: `https://moeys.gov.kh/${slug.startsWith("result-") ? "kh/" : ""}bacii/${slug}`, pdf_url: pdfUrl.toString() });
      job.current = documents.length;
      job.updatedAt = Date.now();
    }
    else if (governmentLinks.size === 25) {
      const suffix = String(year).slice(-2);
      const discovered = [...governmentLinks].map(([path, shortUrl]) => {
        const code = path.replace(/^baciir/, "").replace(new RegExp(`${year}$`), "");
        const base = governmentProvinceCodes[code];
        if (!base) throw new Error(`Unknown government province link: ${shortUrl}`);
        return { base, shortUrl };
      }).sort((left, right) => Object.keys(provinceNames).indexOf(left.base) - Object.keys(provinceNames).indexOf(right.base));
      for (const [index, item] of discovered.entries()) {
        if (job.cancelled) throw new Error("Import cancelled.");
        const pdfUrl = await resolveGovernmentPdf(item.shortUrl);
        const province = provinceNames[item.base];
        documents.push({
          document_id: year * 100 + index + 1,
          slug: `${item.base}${suffix}`,
          province,
          title: `${province} BacII ${year} results`,
          source_page_url: item.shortUrl,
          pdf_url: pdfUrl,
        });
        job.current = documents.length;
        job.updatedAt = Date.now();
      }
    } else if (legacy2023Links.size === 25) {
      const suffix = String(year).slice(-2);
      const discovered = [...legacy2023Links].map(([base, shortUrl]) => ({ base, shortUrl }))
        .sort((left, right) => Object.keys(provinceNames).indexOf(left.base) - Object.keys(provinceNames).indexOf(right.base));
      for (const [index, item] of discovered.entries()) {
        if (job.cancelled) throw new Error("Import cancelled.");
        const pdfUrl = await resolveLegacy2023Pdf(item.shortUrl);
        const province = provinceNames[item.base];
        documents.push({
          document_id: year * 100 + index + 1,
          slug: `${item.base}${suffix}`,
          province,
          title: `${province} BacII ${year} results`,
          source_page_url: item.shortUrl,
          pdf_url: pdfUrl,
        });
        job.current = documents.length;
        job.updatedAt = Date.now();
      }
    } else {
      throw new Error(`Expected 25 province/capital document links for ${year}, but found ${Math.max(slugs.length, governmentLinks.size, legacy2023Links.size)}. Confirm that this is the complete official result post and that the selected year is correct.`);
    }
    return documents;
}

function runProcess(job: ArchiveImportJob, command: string, args: string[], phase: string, total: number) {
  return new Promise<void>((resolvePromise, reject) => {
    job.phase = phase;
    job.current = 0;
    job.total = total;
    job.updatedAt = Date.now();
    const child = spawn(command, args, {
      cwd: process.cwd(), env: process.env, detached: process.platform !== "win32",
    });
    job.child = child;
    child.stdout.on("data", (chunk) => appendLog(job, String(chunk)));
    child.stderr.on("data", (chunk) => appendLog(job, String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      job.child = undefined;
      if (job.cancelled) return reject(new Error("Import cancelled."));
      if (code !== 0) return reject(new Error(`${phase} failed (exit code ${code ?? "unknown"}).`));
      resolvePromise();
    });
  });
}

function archivePython() {
  const configured = process.env.OCR_PYTHON?.trim();
  if (configured) return configured;
  const projectVenv = join(process.cwd(), ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  return existsSync(projectVenv) ? projectVenv : "python";
}

async function executeImport(job: ArchiveImportJob) {
  const archiveRoot = resolve(process.env.BACII_ARCHIVE_ROOT || "data");
  // A stable per-year staging path lets a retry resume already verified PDF
  // downloads and incrementally written OCR labels after a transient failure.
  const jobRoot = join(archiveRoot, ".imports", `bacii-${job.year}`);
  try {
    job.status = "working";
    const finalDir = join(archiveRoot, `bacii-${job.year}`);
    if (existsSync(finalDir)) throw new Error(`The ${job.year} archive already exists. Remove or back it up before importing it again.`);
    const stagedDir = join(jobRoot, `bacii-${job.year}`);
    await mkdir(jobRoot, { recursive: true });
    const documents = await discoverArchiveDocuments(job.postUrl, job.year, job);
    const manifestPath = join(jobRoot, "source-manifest.json");
    await writeFile(manifestPath, JSON.stringify(documents, null, 2), "utf8");
    const python = archivePython();
    await runProcess(job, python, ["scripts/archive_bacii_2026.py", "--archive-dir", stagedDir, "--year", String(job.year),
      "--post-url", job.postUrl, "--manifest-input", manifestPath], "Downloading PDFs", 25);
    job.phase = "Building search index";
    appendLog(job, "PDF validation and search index completed.");
    await runProcess(job, python, ["scripts/ocr_archive_centers.py", "--archive", stagedDir, "--year", String(job.year)],
      "Reading exam-center labels", 1);
    job.phase = "Publishing archive";
    job.current = 0;
    job.total = 1;
    await rename(stagedDir, finalDir);
    await rm(jobRoot, { recursive: true, force: true });
    job.status = "ready";
    job.current = 1;
    job.message = `${job.year} is now available in Archive Search and Insights.`;
    job.updatedAt = Date.now();
  } catch (error) {
    job.status = job.cancelled ? "cancelled" : "error";
    job.phase = job.cancelled ? "Import cancelled" : "Import failed";
    job.error = error instanceof Error ? error.message : "Archive import failed.";
    appendLog(job, "Partial staging data was retained so the next import for this year can resume.");
    job.updatedAt = Date.now();
  }
}

export function startArchiveImport(rawUrl: string, rawYear: unknown) {
  const postUrl = parsePublicArchivePostUrl(rawUrl);
  const year = Number(rawYear);
  if (!Number.isSafeInteger(year) || year < 2014 || year > new Date().getFullYear() + 1) {
    throw new Error("Enter a valid BacII archive year.");
  }
  const active = [...archiveImportJobs.values()].find((job) => job.status === "queued" || job.status === "working");
  if (active) throw new Error(`Import ${active.id} is already running for ${active.year}.`);
  const now = Date.now();
  const job: ArchiveImportJob = { id: randomUUID(), year, postUrl, status: "queued", phase: "Queued",
    current: 0, total: 1, createdAt: now, updatedAt: now, logs: [] };
  archiveImportJobs.set(job.id, job);
  void executeImport(job);
  return job;
}

export function cancelArchiveImport(job: ArchiveImportJob) {
  job.cancelled = true;
  if (job.child?.pid && process.platform !== "win32") {
    try { process.kill(-job.child.pid, "SIGTERM"); } catch { job.child.kill("SIGTERM"); }
  } else {
    job.child?.kill("SIGTERM");
  }
  job.status = "cancelled";
  job.phase = "Import cancelled";
  job.updatedAt = Date.now();
}
