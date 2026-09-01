import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { OcrPhotoResult, Photo } from "./types.ts";

const databasePath = resolve(process.env.DATABASE_PATH || "data/album-packer.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("synchronous = NORMAL");
database.pragma("foreign_keys = ON");
database.pragma("busy_timeout = 5000");
database.exec(`
  CREATE TABLE IF NOT EXISTS albums (
    album_key TEXT PRIMARY KEY,
    album_url TEXT NOT NULL,
    photo_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS photos (
    album_key TEXT NOT NULL,
    photo_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    url TEXT NOT NULL,
    preview_url TEXT NOT NULL,
    source_url TEXT,
    width INTEGER,
    height INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (album_key, photo_id),
    FOREIGN KEY (album_key) REFERENCES albums(album_key) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS photos_album_position ON photos(album_key, position);

  CREATE TABLE IF NOT EXISTS ocr_results (
    photo_id TEXT NOT NULL,
    image_signature TEXT NOT NULL,
    cache_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    header_text TEXT NOT NULL,
    exam_center TEXT,
    province TEXT,
    track TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (photo_id, cache_version, mode)
  );

  CREATE INDEX IF NOT EXISTS ocr_results_center_track ON ocr_results(exam_center, track);
  CREATE INDEX IF NOT EXISTS ocr_results_province ON ocr_results(province);

  CREATE TABLE IF NOT EXISTS ocr_rows (
    photo_id TEXT NOT NULL,
    cache_version TEXT NOT NULL,
    mode TEXT NOT NULL,
    table_number TEXT NOT NULL,
    student_name TEXT,
    PRIMARY KEY (photo_id, cache_version, mode, table_number)
  );

  CREATE INDEX IF NOT EXISTS ocr_rows_table_number ON ocr_rows(table_number);

  CREATE TABLE IF NOT EXISTS cache_metrics (
    metric TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
`);

type AlbumRow = { updated_at: number; photo_count: number };
type PhotoRow = {
  photo_id: string; url: string; preview_url: string; source_url: string | null;
  width: number | null; height: number | null;
};
type OcrRow = {
  status: OcrPhotoResult["status"]; header_text: string; exam_center: string | null;
  province: string | null; track: OcrPhotoResult["track"]; rows_json: string; image_signature: string;
};

export function albumKey(value: string) {
  const url = new URL(value);
  const set = url.searchParams.get("set")?.replace(/^a\./, "");
  if (set) return `facebook:${set}`;
  return `url:${createHash("sha256").update(url.href).digest("hex")}`;
}

export function photoSignature(photo: Photo) {
  let pathname = "";
  try { pathname = new URL(photo.url).pathname; } catch { pathname = photo.url; }
  return createHash("sha256").update(`${photo.id}|${photo.width ?? 0}|${photo.height ?? 0}|${pathname}`).digest("hex");
}

const incrementStatement = database.prepare(`
  INSERT INTO cache_metrics(metric, value) VALUES (?, 1)
  ON CONFLICT(metric) DO UPDATE SET value = value + 1
`);

export function incrementMetric(metric: "album_hits" | "ocr_hits") {
  incrementStatement.run(metric);
}

const saveAlbumTransaction = database.transaction((key: string, url: string, photos: Photo[]) => {
  const now = Date.now();
  database.prepare(`
    INSERT INTO albums(album_key, album_url, photo_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(album_key) DO UPDATE SET album_url=excluded.album_url, photo_count=excluded.photo_count, updated_at=excluded.updated_at
  `).run(key, url, photos.length, now, now);
  database.prepare("DELETE FROM photos WHERE album_key = ?").run(key);
  const insert = database.prepare(`
    INSERT INTO photos(album_key, photo_id, position, url, preview_url, source_url, width, height, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  photos.forEach((photo, position) => insert.run(
    key, photo.id, position, photo.url, photo.previewUrl, photo.sourceUrl ?? null,
    photo.width ?? null, photo.height ?? null, now,
  ));
});

export function saveAlbumManifest(url: string, photos: Photo[]) {
  saveAlbumTransaction(albumKey(url), url, photos);
}

export function loadAlbumManifest(url: string, maxAgeMs: number): Photo[] | null {
  const key = albumKey(url);
  const album = database.prepare("SELECT updated_at, photo_count FROM albums WHERE album_key = ?").get(key) as AlbumRow | undefined;
  if (!album || Date.now() - album.updated_at > maxAgeMs) return null;
  const rows = database.prepare(`
    SELECT photo_id, url, preview_url, source_url, width, height
    FROM photos WHERE album_key = ? ORDER BY position
  `).all(key) as PhotoRow[];
  if (rows.length === 0 || rows.length !== album.photo_count) return null;
  incrementMetric("album_hits");
  return rows.map((row) => ({
    id: row.photo_id, url: row.url, previewUrl: row.preview_url,
    sourceUrl: row.source_url ?? undefined, width: row.width ?? undefined, height: row.height ?? undefined,
  }));
}

const saveOcrTransaction = database.transaction((photo: Photo, result: OcrPhotoResult, cacheVersion: string, mode: string) => {
  const signature = photoSignature(photo);
  database.prepare(`
    INSERT INTO ocr_results(photo_id, image_signature, cache_version, mode, status, header_text, exam_center, province, track, rows_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(photo_id, cache_version, mode) DO UPDATE SET
      image_signature=excluded.image_signature, status=excluded.status, header_text=excluded.header_text,
      exam_center=excluded.exam_center, province=excluded.province, track=excluded.track,
      rows_json=excluded.rows_json, updated_at=excluded.updated_at
  `).run(
    photo.id, signature, cacheVersion, mode, result.status, result.headerText,
    result.examCenter ?? null, result.province ?? null, result.track, JSON.stringify(result.rows), Date.now(),
  );
  database.prepare("DELETE FROM ocr_rows WHERE photo_id = ? AND cache_version = ? AND mode = ?").run(photo.id, cacheVersion, mode);
  const insertRow = database.prepare(`
    INSERT OR REPLACE INTO ocr_rows(photo_id, cache_version, mode, table_number, student_name) VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of result.rows) {
    if (row.number) insertRow.run(photo.id, cacheVersion, mode, row.number, row.name ?? null);
  }
});

export function saveOcrRecord(photo: Photo, result: OcrPhotoResult, cacheVersion: string, includeNames: boolean) {
  if (result.status === "failed") return;
  saveOcrTransaction(photo, result, cacheVersion, includeNames ? "names" : "targeted");
}

export function loadOcrRecord(photo: Photo, cacheVersion: string, includeNames: boolean, photoIndex: number): OcrPhotoResult | null {
  const mode = includeNames ? "names" : "targeted";
  const row = database.prepare(`
    SELECT status, header_text, exam_center, province, track, rows_json, image_signature
    FROM ocr_results WHERE photo_id = ? AND cache_version = ? AND mode = ?
  `).get(photo.id, cacheVersion, mode) as OcrRow | undefined;
  if (!row || row.image_signature !== photoSignature(photo)) return null;
  incrementMetric("ocr_hits");
  return {
    photoId: photo.id, photoIndex, status: row.status, headerText: row.header_text,
    examCenter: row.exam_center ?? undefined, province: row.province ?? undefined,
    track: row.track, rows: JSON.parse(row.rows_json) as OcrPhotoResult["rows"],
  };
}

export function databaseStats() {
  const count = (table: string) => Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  const metrics = database.prepare("SELECT metric, value FROM cache_metrics").all() as Array<{ metric: string; value: number }>;
  return {
    path: databasePath,
    albums: count("albums"), photos: count("photos"),
    ocrResults: count("ocr_results"), tableRows: count("ocr_rows"),
    cacheHits: Object.fromEntries(metrics.map((row) => [row.metric, row.value])),
  };
}
