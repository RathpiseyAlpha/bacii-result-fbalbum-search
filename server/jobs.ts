import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import { fetchFacebookImage, parseFacebookImageUrl, parsePublicAlbumUrl } from "./security.ts";
import { discoverPublicAlbum } from "./facebook.ts";
import { loadAlbumManifest, saveAlbumManifest } from "./database.ts";
import type { DiscoveryJob, Photo, ZipJob } from "./types.ts";

const TEMP_ROOT = join(tmpdir(), "album-packer");
export const discoveries = new Map<string, DiscoveryJob>();
export const zipJobs = new Map<string, ZipJob>();

export function startDiscovery(url: string, forceRefresh = false) {
  const albumUrl = parsePublicAlbumUrl(url);
  const job: DiscoveryJob = {
    id: randomUUID(), kind: "discovery", status: "queued", phase: "Queued",
    current: 0, total: 0, photos: [], albumUrl, cacheHit: false,
    createdAt: Date.now(), controller: new AbortController(),
  };
  discoveries.set(job.id, job);
  setImmediate(() => {
    void (async () => {
      const cacheMinutes = Math.max(1, Number(process.env.ALBUM_CACHE_TTL_MINUTES || 30));
      const cached = forceRefresh ? null : loadAlbumManifest(albumUrl, cacheMinutes * 60_000);
      if (cached) {
        job.photos = cached;
        job.current = cached.length;
        job.total = cached.length;
        job.cacheHit = true;
        job.status = "ready";
        job.phase = `${cached.length} photos restored from cache`;
        return;
      }
      await discoverPublicAlbum(albumUrl, job);
      saveAlbumManifest(albumUrl, job.photos);
    })().catch((error: unknown) => {
      job.status = job.controller.signal.aborted ? "cancelled" : "failed";
      job.error = error instanceof Error ? error.message : "Album discovery failed.";
    });
  });
  return job;
}

function extensionFor(type: string, url: string) {
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  const path = new URL(url).pathname.toLowerCase();
  const match = path.match(/\.(jpe?g|png|webp|gif)$/);
  return match ? `.${match[1].replace("jpeg", "jpg")}` : ".jpg";
}

function safeAlbumName(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "facebook-album").slice(0, 80);
}

export async function startZip(photos: Photo[], requestedName: string) {
  await mkdir(TEMP_ROOT, { recursive: true });
  const id = randomUUID();
  const albumName = safeAlbumName(requestedName);
  const filePath = join(TEMP_ROOT, `${id}.zip`);
  const job: ZipJob = {
    id, kind: "zip", status: "queued", phase: "Preparing ZIP", current: 0,
    total: photos.length, bytes: 0, failures: 0, filePath,
    fileName: `${albumName}.zip`, createdAt: Date.now(), controller: new AbortController(),
  };
  zipJobs.set(id, job);

  const output = createWriteStream(filePath);
  const archive = archiver("zip", { zlib: { level: 0 } });
  void (async () => {
    const finished = new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
    });
    archive.pipe(output);
    job.status = "working";
    job.phase = "Downloading photos";

    for (let index = 0; index < photos.length; index += 1) {
      if (job.controller.signal.aborted) throw new Error("Cancelled.");
      const photo = photos[index];
      try {
        const response = await fetchFacebookImage(photo.url, job.controller.signal);
        const size = Number(response.headers.get("content-length") || 0);
        if (size > 50 * 1024 * 1024) throw new Error("Photo exceeds the 50 MB safety limit.");
        const data = Buffer.from(await response.arrayBuffer());
        if (data.byteLength > 50 * 1024 * 1024) throw new Error("Photo exceeds the 50 MB safety limit.");
        job.bytes += data.byteLength;
        const extension = extensionFor(response.headers.get("content-type") ?? "", photo.url);
        archive.append(data, { name: `${albumName}/${String(index + 1).padStart(4, "0")}${extension}` });
      } catch {
        job.failures += 1;
      }
      job.current = index + 1;
    }

    if (job.current === job.failures) throw new Error("None of the photos could be downloaded. Their Facebook links may have expired.");
    job.phase = "Finalizing ZIP";
    await archive.finalize();
    await finished;
    job.status = "ready";
    job.phase = "ZIP ready";
  })().catch(async (error: unknown) => {
    archive.abort();
    output.destroy();
    job.status = job.controller.signal.aborted ? "cancelled" : "failed";
    job.error = error instanceof Error ? error.message : "Could not build the ZIP.";
    await rm(filePath, { force: true }).catch(() => undefined);
  });
  return job;
}

export function photosFromUrls(urls: string[]): Photo[] {
  return urls.map((url, index) => {
    const parsed = parseFacebookImageUrl(url);
    return { id: `manual-${index}`, url: parsed, previewUrl: parsed };
  });
}

export async function getZipSize(job: ZipJob) {
  return (await stat(job.filePath)).size;
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1_000;
  for (const [id, job] of discoveries) if (job.createdAt < cutoff) discoveries.delete(id);
  for (const [id, job] of zipJobs) {
    if (job.createdAt < cutoff) {
      zipJobs.delete(id);
      void rm(job.filePath, { force: true });
    }
  }
}, 10 * 60 * 1_000).unref();
