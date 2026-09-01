import express from "express";
import { existsSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { discoveries, getZipSize, photosFromUrls, startDiscovery, startZip, zipJobs } from "./jobs.ts";
import { ocrJobs, ocrRuntimeStatus, startOcr } from "./ocr.ts";
import { fetchFacebookImage } from "./security.ts";
import { databaseStats } from "./database.ts";
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
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
app.get("/api/database/stats", (_request, response) => response.json(databaseStats()));

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
    response.status(400).json({ error: error instanceof Error ? error.message : "Could not start Khmer OCR." });
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
  job.controller.abort();
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

app.listen(port, () => console.log(`Album Packer running at http://localhost:${port}`));
