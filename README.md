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

## Deploy with Docker Compose

The production image contains the compiled React app, Express API, Playwright Chromium, CPU-only PyTorch OCR, and Tesseract. SQLite data and the downloaded Hugging Face model are kept in named Docker volumes.

On a Linux server with Docker and Docker Compose installed:

```bash
git clone https://github.com/RathpiseyAlpha/bacii-result-fbalbum-search.git
cd bacii-result-fbalbum-search
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The Compose file binds the application to `127.0.0.1:8787`, so expose it through an HTTPS reverse proxy. For example, an Nginx virtual host can proxy to `http://127.0.0.1:8787`:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

Useful deployment commands:

```bash
# Rebuild after pulling an update
git pull
docker compose up -d --build

# Check health and logs
curl http://127.0.0.1:8787/api/health
docker compose logs --tail=200 app

# Back up the persistent SQLite database volume
docker compose stop app
docker run --rm -v bacii-result-fbalbum-search_app_data:/data -v "$PWD":/backup ubuntu:24.04 \
  tar czf /backup/album-packer-data.tar.gz -C /data .
docker compose start app
```

The first image build downloads the CPU PyTorch runtime and can take several minutes. The Khmer model downloads on the first uncached OCR job and is then retained in the `hf_cache` volume. Do not run multiple app replicas against the same SQLite volume; migrate to PostgreSQL before horizontal scaling.
