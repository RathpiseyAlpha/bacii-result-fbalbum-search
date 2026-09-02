import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fetchFacebookImage } from "./security.ts";
import { loadOcrRecord, photoSignature, saveOcrRecord } from "./database.ts";
import type { OcrJob, OcrPhotoResult, Photo } from "./types.ts";

const OCR_TEMP_ROOT = join(tmpdir(), "album-packer-ocr");
const MODEL = "Darayut/khmer-text-recognition";
const CACHE_VERSION = "f8d2ef9a3d60862cd695029ec2376f618685445b:fast-v3";

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

const OCR_MAX_CONCURRENT = boundedInteger(process.env.OCR_MAX_CONCURRENT, 1, 1, 8);
const OCR_MAX_QUEUE = boundedInteger(process.env.OCR_MAX_QUEUE, 25, 0, 500);

type PendingPhoto = { photo: Photo; photoIndex: number };
type OcrTask = { key: string; job: OcrJob; photos: Photo[]; pending: PendingPhoto[] };

const ocrQueue: OcrTask[] = [];
const activeOcrRequests = new Map<string, OcrJob>();
let runningOcrJobs = 0;

export const ocrJobs = new Map<string, OcrJob>();

export class OcrQueueFullError extends Error {}

function pythonExecutable() {
  if (process.env.OCR_PYTHON) return process.env.OCR_PYTHON;
  const local = process.platform === "win32"
    ? resolve(".venv", "Scripts", "python.exe")
    : resolve(".venv", "bin", "python");
  return existsSync(local) ? local : "python";
}

export function ocrRuntimeStatus() {
  const local = process.platform === "win32"
    ? resolve(".venv", "Scripts", "python.exe")
    : resolve(".venv", "bin", "python");
  return {
    available: Boolean(process.env.OCR_PYTHON) || existsSync(local),
    model: MODEL,
    mode: "local-hugging-face",
    maxConcurrent: OCR_MAX_CONCURRENT,
    maxQueue: OCR_MAX_QUEUE,
    running: runningOcrJobs,
    queued: ocrQueue.length,
    message: "Run npm run ocr:setup once if the OCR runtime is not installed.",
  };
}

function parseWorkerLine(line: string): OcrPhotoResult | null {
  try {
    const value = JSON.parse(line) as OcrPhotoResult;
    return value && typeof value.photoId === "string" ? value : null;
  } catch {
    return null;
  }
}

async function downloadPhotoOnce(photo: Photo, path: string, signal: AbortSignal) {
  const response = await fetchFacebookImage(photo.url, signal);
  const size = Number(response.headers.get("content-length") || 0);
  if (size > 25 * 1024 * 1024) throw new Error("Photo exceeds the 25 MB OCR safety limit.");
  const stream = createWriteStream(path);
  await new Promise<void>(async (resolvePromise, reject) => {
    stream.on("error", reject);
    stream.on("finish", resolvePromise);
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Facebook returned an empty photo.");
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > 25 * 1024 * 1024) throw new Error("Photo exceeds the 25 MB OCR safety limit.");
        if (!stream.write(Buffer.from(value))) await new Promise<void>((resume) => stream.once("drain", () => resume()));
      }
      stream.end();
    } catch (error) {
      stream.destroy();
      reject(error);
    }
  });
}

async function downloadPhoto(photo: Photo, path: string, signal: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (signal.aborted) throw new Error("Cancelled.");
    try {
      await downloadPhotoOnce(photo, path, signal);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not download the Facebook photo.");
}

function ocrRequestKey(photos: Photo[], includeNames: boolean) {
  const hash = createHash("sha256").update(includeNames ? "names" : "targeted");
  for (const photo of photos) hash.update(`\0${photoSignature(photo)}`);
  return hash.digest("hex");
}

function updateQueuePhases() {
  ocrQueue.forEach(({ job }, index) => {
    if (job.status === "queued") job.phase = `Queued for OCR · position ${index + 1}`;
  });
}

async function runOcrTask({ job, photos, pending }: OcrTask) {
  const runtime = ocrRuntimeStatus();
  if (!runtime.available) throw new Error("Khmer OCR is not installed yet. Run npm run ocr:setup, then restart the app.");
  await mkdir(OCR_TEMP_ROOT, { recursive: true });
  const jobDir = join(OCR_TEMP_ROOT, job.id);
  await mkdir(jobDir, { recursive: true });
  const manifest: Array<{ photoId: string; photoIndex: number; path: string }> = [];
  let lastDownloadError = "";
  job.status = "working";
  job.phase = job.cacheHits > 0
    ? `Preparing ${pending.length} uncached photos · ${job.cacheHits} reused`
    : "Downloading result sheets";

  try {
    for (let index = 0; index < pending.length; index += 1) {
      if (job.controller.signal.aborted) throw new Error("Cancelled.");
      const { photo, photoIndex } = pending[index];
      const path = join(jobDir, `${String(photoIndex).padStart(4, "0")}.jpg`);
      try {
        await downloadPhoto(photo, path, job.controller.signal);
        manifest.push({ photoId: photo.id, photoIndex, path });
      } catch (error) {
        lastDownloadError = error instanceof Error ? error.message : "Could not download photo.";
        job.failures += 1;
        job.results.push({
          photoId: photo.id, photoIndex, status: "failed", headerText: "",
          track: "unknown", rows: [], error: error instanceof Error ? error.message : "Could not download photo.",
        });
        job.current += 1;
      }
    }

    if (manifest.length === 0) {
      throw new Error(`None of the ${pending.length} uncached photos could be downloaded for OCR.${lastDownloadError ? ` Facebook reported: ${lastDownloadError}` : ""}`);
    }
    const manifestPath = join(jobDir, "manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    job.phase = job.includeNames
      ? `Reading headers, numbers, and names${job.cacheHits ? ` · ${job.cacheHits} cached` : ""}`
      : `Reading headers and table numbers${job.cacheHits ? ` · ${job.cacheHits} cached` : ""}`;
    const photoById = new Map(photos.map((photo) => [photo.id, photo]));

    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(pythonExecutable(), [
        resolve("ocr", "worker.py"), "--manifest", manifestPath,
        "--mode", job.includeNames ? "names" : "targeted",
      ], {
        cwd: process.cwd(),
        env: { ...process.env, HF_HUB_DISABLE_PROGRESS_BARS: "1", TOKENIZERS_PARALLELISM: "false", PYTHONUTF8: "1" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const abort = () => child.kill();
      job.controller.signal.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() ?? "";
        for (const line of lines) {
          const result = parseWorkerLine(line);
          if (!result) continue;
          job.results.push(result);
          if (result.status === "failed") job.failures += 1;
          const photo = photoById.get(result.photoId);
          if (photo) saveOcrRecord(photo, result, CACHE_VERSION, job.includeNames);
          job.current += 1;
        }
      });
      child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
      child.on("error", reject);
      child.on("exit", (code) => {
        job.controller.signal.removeEventListener("abort", abort);
        if (job.controller.signal.aborted) return reject(new Error("Cancelled."));
        if (code !== 0) return reject(new Error(stderr.trim() || `OCR worker stopped with exit code ${code}.`));
        resolvePromise();
      });
    });

    job.status = "ready";
    job.current = job.results.length;
    job.phase = job.cacheHits > 0 ? `Search index ready · ${job.cacheHits} restored from database` : "Search index ready";
    job.results.sort((a, b) => a.photoIndex - b.photoIndex);
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function drainOcrQueue() {
  while (runningOcrJobs < OCR_MAX_CONCURRENT && ocrQueue.length > 0) {
    const task = ocrQueue.shift();
    if (!task) break;
    if (task.job.controller.signal.aborted) {
      task.job.status = "cancelled";
      task.job.phase = "Cancelled";
      if (activeOcrRequests.get(task.key) === task.job) activeOcrRequests.delete(task.key);
      continue;
    }
    runningOcrJobs += 1;
    updateQueuePhases();
    void runOcrTask(task).catch((error: unknown) => {
      task.job.status = task.job.controller.signal.aborted ? "cancelled" : "failed";
      task.job.error = error instanceof Error ? error.message : "Khmer OCR failed.";
    }).finally(() => {
      runningOcrJobs -= 1;
      if (activeOcrRequests.get(task.key) === task.job) activeOcrRequests.delete(task.key);
      drainOcrQueue();
    });
  }
  updateQueuePhases();
}

export function startOcr(photos: Photo[], includeNames: boolean) {
  const key = ocrRequestKey(photos, includeNames);
  const existing = activeOcrRequests.get(key);
  if (existing && (existing.status === "queued" || existing.status === "working")) return existing;

  const id = randomUUID();
  const job: OcrJob = {
    id, kind: "ocr", status: "queued", phase: "Preparing OCR", current: 0,
    total: photos.length, includeNames, model: MODEL, results: [], failures: 0, cacheHits: 0,
    createdAt: Date.now(), controller: new AbortController(),
  };
  const pending: PendingPhoto[] = [];
  photos.forEach((photo, photoIndex) => {
    const cached = loadOcrRecord(photo, CACHE_VERSION, includeNames, photoIndex);
    if (cached) {
      job.results.push(cached);
      job.cacheHits += 1;
    } else {
      pending.push({ photo, photoIndex });
    }
  });
  job.current = job.cacheHits;

  if (pending.length === 0) {
    ocrJobs.set(id, job);
    job.status = "ready";
    job.phase = `Search index restored from database · ${job.cacheHits} cached`;
    job.results.sort((a, b) => a.photoIndex - b.photoIndex);
    return job;
  }

  if (runningOcrJobs + ocrQueue.length >= OCR_MAX_CONCURRENT + OCR_MAX_QUEUE) {
    throw new OcrQueueFullError(`The OCR queue is full (${OCR_MAX_QUEUE} waiting). Please try again later.`);
  }

  ocrJobs.set(id, job);
  activeOcrRequests.set(key, job);
  ocrQueue.push({ key, job, photos, pending });
  updateQueuePhases();
  queueMicrotask(drainOcrQueue);
  return job;
}

export function cancelOcr(job: OcrJob) {
  job.controller.abort();
  if (job.status !== "queued") return;
  const index = ocrQueue.findIndex((task) => task.job === job);
  if (index >= 0) {
    const [task] = ocrQueue.splice(index, 1);
    if (activeOcrRequests.get(task.key) === job) activeOcrRequests.delete(task.key);
  }
  job.status = "cancelled";
  job.phase = "Cancelled";
  updateQueuePhases();
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1_000;
  for (const [id, job] of ocrJobs) {
    if (job.createdAt < cutoff && job.status !== "queued" && job.status !== "working") ocrJobs.delete(id);
  }
}, 10 * 60 * 1_000).unref();
