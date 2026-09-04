import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getArchiveNameLocator } from "./archive.ts";

const cacheRoot = resolve(process.env.ARCHIVE_CROP_CACHE_ROOT || "data/archive-name-crops");
const CACHE_VERSION = "school-cell-v2";
const MAX_CONCURRENT = 6;
const MAX_QUEUE = 1000;
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
      reject(new Error("The school-image queue is busy. Please try again shortly."));
      return;
    }
    queue.push(() => {
      active += 1;
      resolvePromise();
    });
  });
}

function release() {
  active = Math.max(0, active - 1);
  queue.shift()?.();
}

function renderSchool(pdf: string, page: number, tableNumber: string, output: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(pythonExecutable(), [
      resolve("scripts", "render_pdf_school.py"),
      "--pdf", pdf,
      "--page", String(page),
      "--table-number", tableNumber,
      "--output", output,
    ], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(stderr.trim() || "Could not render the official school name.")));
  });
}

export async function getArchiveSchoolImage(year: string, studentId: number) {
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
      await renderSchool(locator.pdf, locator.pageNumber, locator.tableNumber, output);
      return output;
    } finally {
      release();
    }
  })();
  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}
