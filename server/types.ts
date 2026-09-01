export type Photo = {
  id: string;
  url: string;
  previewUrl: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
};

export type JobStatus = "queued" | "working" | "ready" | "failed" | "cancelled";

export type DiscoveryJob = {
  id: string;
  kind: "discovery";
  status: JobStatus;
  phase: string;
  current: number;
  total: number;
  photos: Photo[];
  albumUrl: string;
  cacheHit: boolean;
  error?: string;
  createdAt: number;
  controller: AbortController;
};

export type ZipJob = {
  id: string;
  kind: "zip";
  status: JobStatus;
  phase: string;
  current: number;
  total: number;
  bytes: number;
  failures: number;
  filePath: string;
  fileName: string;
  error?: string;
  createdAt: number;
  controller: AbortController;
};

export type BaciiTrack = "science" | "social-science" | "unknown";

export type BaciiRow = {
  number: string;
  name?: string;
};

export type OcrPhotoResult = {
  photoId: string;
  photoIndex: number;
  status: "ready" | "skipped" | "failed";
  headerText: string;
  examCenter?: string;
  province?: string;
  track: BaciiTrack;
  rows: BaciiRow[];
  error?: string;
};

export type OcrJob = {
  id: string;
  kind: "ocr";
  status: JobStatus;
  phase: string;
  current: number;
  total: number;
  includeNames: boolean;
  model: string;
  results: OcrPhotoResult[];
  cacheHits: number;
  failures: number;
  error?: string;
  createdAt: number;
  controller: AbortController;
};
