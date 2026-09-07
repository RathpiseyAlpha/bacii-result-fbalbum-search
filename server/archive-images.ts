import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getArchiveNameLocator, getArchivePdf } from "./archive.ts";

const cacheRoot = resolve(process.env.ARCHIVE_CROP_CACHE_ROOT || "data/archive-name-crops");
const pageCacheRoot = resolve(process.env.ARCHIVE_PAGE_CACHE_ROOT || "data/archive-page-crops");
const CACHE_VERSION = "name-cell-v7";
const PAGE_CACHE_VERSION = "page-v1";
const MAX_CONCURRENT = 2;
const MAX_QUEUE = 100;
let active = 0;
const queue: Array<() => void> = [];
const inflight = new Map<string, Promise<string>>();

function pythonExecutable() {
  if (process.env.OCR_PYTHON) return process.env.OCR_PYTHON;
  const local = process.platform === "win32"
    ? resolve(".venv", "Scripts", "python.exe")
    : resolve(".venv", "bin", "python");
  return existsSync(local) ? local : "python";
}

function acquire() {
  return new Promise<void>((resolvePromise, reject) => {
    if (active < MAX_CONCURRENT) {
      active += 1;
      resolvePromise();
      return;
    }
    if (queue.length >= MAX_QUEUE) {
      reject(new Error("The name-image queue is busy. Please try again shortly."));
      return;
    }
    queue.push(() => { active += 1; resolvePromise(); });
  });
}

function release() {
  active = Math.max(0, active - 1);
  queue.shift()?.();
}

function renderName(pdf: string, page: number, tableNumber: string, output: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(pythonExecutable(), [
      resolve("scripts", "render_pdf_name.py"),
      "--pdf", pdf,
      "--page", String(page),
      "--table-number", tableNumber,
      "--output", output,
    ], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr.trim() || "Could not render the official name.")));
  });
}

function renderPage(pdf: string, page: number, output: string, hideDob = false) {
  return new Promise<void>((resolvePromise, reject) => {
    const args = [
      resolve("scripts", "render_pdf_page.py"),
      "--pdf", pdf,
      "--page", String(page),
      "--output", output,
    ];
    if (hideDob) {
      args.push("--hide-dob");
    }
    const child = spawn(pythonExecutable(), args, { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr.trim() || "Could not render the official page.")));
  });
}

export async function getArchivePageImage(year: string, documentId: number, pageNumber: number, hideDob = false) {
  const pdf = getArchivePdf(year, documentId);
  if (!pdf || !Number.isSafeInteger(pageNumber) || pageNumber < 1) return undefined;
  const directory = join(pageCacheRoot, year, String(documentId));
  const output = join(directory, `${PAGE_CACHE_VERSION}-${pageNumber}${hideDob ? "-nodob" : ""}.jpg`);
  if (existsSync(output)) return output;
  const key = `page:${year}:${documentId}:${pageNumber}:${hideDob ? "nodob" : "full"}`;
  const current = inflight.get(key);
  if (current) return current;
  const work = (async () => {
    await acquire();
    try {
      if (existsSync(output)) return output;
      await mkdir(directory, { recursive: true });
      await renderPage(pdf, pageNumber, output, hideDob);
      return output;
    } finally { release(); }
  })();
  inflight.set(key, work);
  try { return await work; } finally { inflight.delete(key); }
}

export async function getArchiveNameImage(year: string, studentId: number) {
  const locator = getArchiveNameLocator(year, studentId);
  if (!locator) return undefined;
  const directory = join(cacheRoot, year);
  const output = join(directory, `${CACHE_VERSION}-${studentId}.png`);
  if (existsSync(output)) return output;
  const key = `${year}:${studentId}`;
  const current = inflight.get(key);
  if (current) return current;
  const work = (async () => {
    await acquire();
    try {
      if (existsSync(output)) return output;
      await mkdir(directory, { recursive: true });
      await renderName(locator.pdf, locator.pageNumber, locator.tableNumber, output);
      return output;
    } finally { release(); }
  })();
  inflight.set(key, work);
  try { return await work; } finally { inflight.delete(key); }
}
