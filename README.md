# Album Packer

A local-first web app for downloading public Facebook photo albums in bulk. It discovers photos with a headless browser, lets you select what to keep, then builds a numbered ZIP on disk.

## Run locally

```powershell
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:5173`.

For a production build:

```powershell
npm run build
npm start
```

Open `http://localhost:8787`.

## Khmer BacII OCR search

The result gallery can build a local search index for Cambodia BacII result sheets. The fast default reads the repeated header (exam center, province, and science/social-science track) plus the first table-number column. Enable **Also recognize Khmer names** only when name search is needed, because it runs the recognizer on every student row.

Install the optional OCR runtime once:

```powershell
npm run ocr:setup
```

Restart the app, paste a province result-album URL, scan it, and choose **Detect centers**. The app indexes the entire album, builds exam-center and track selectors from the recognized headers, and finds the matching photo from an exact first-column table number. The first job downloads the `Darayut/khmer-text-recognition` model from Hugging Face (about 18 million parameters). OCR runs locally and its searchable metadata is persisted in SQLite.

The fast number-column pass also requires Tesseract 5 on `PATH`. On Windows the standard `C:\Program Files\Tesseract-OCR\tesseract.exe` location is detected automatically; set `TESSERACT_CMD` for a custom location. Set `OCR_PYTHON` to use a Python environment other than the project `.venv`, or `KHMER_OCR_MODEL` and `KHMER_OCR_REVISION` to test a compatible pinned model.

## Persistent cache and search database

The server stores album manifests, recognized photo metadata, and normalized table-number rows in `data/album-packer.sqlite`. Repeating the same album scan restores its ordered photo list without reopening Facebook, and repeating the same OCR mode restores matching results without rerunning the model. The cache survives application restarts.

- Album manifests refresh after 30 minutes by default. Set `ALBUM_CACHE_TTL_MINUTES` to change that interval.
- Set `DATABASE_PATH` to place the SQLite database elsewhere, including on a persistent deployment volume.
- A changed photo or OCR pipeline version creates a new OCR record automatically, so stale recognition is not reused.
- `GET /api/database/stats` reports stored album, photo, OCR-result, searchable-row, and cache hit/miss counts.
- Send `{ "url": "...", "forceRefresh": true }` to `POST /api/discover` when an album must be rescanned immediately.

## How it works

- The album URL must use HTTPS on `facebook.com` and be publicly visible without signing in.
- The browser worker scrolls the album, collects photo pages, and resolves their best exposed image.
- ZIP jobs download one photo at a time and write to the system temporary directory, avoiding large in-memory archives.
- Finished jobs expire after one hour and their temporary ZIP is removed.
- OCR uses template/grid detection before recognition, so the album cover is skipped and full-page VLM inference is avoided.
- Bulk detection uses fast greedy decoding and caches repeated province, track, and exam-center header crops within each job. Optional name recognition remains slower because every student row is unique.
- If Facebook places a public album behind its login wall, use the **Photo links** tab with direct `fbcdn.net` image URLs.

## Limits and deployment

- A ZIP can contain up to 2,000 photos; each photo has a 50 MB safety limit.
- Facebook changes its public markup frequently. The fallback exists because some public albums are still gated by region, consent state, or automated-access checks.
- A deployed server needs enough temporary disk for concurrent archives and must have Playwright Chromium installed. On Linux, use `npx playwright install --with-deps chromium` during setup.
- Only download photos you own or have permission to save. This project does not bypass privacy controls and does not request Facebook credentials.
