# BacII Result Search Engine

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

## Annual BacII results archive

Open `http://localhost:5173/#archive` in development or `http://localhost:8787/#archive` after a production build. The archive page discovers every available year, supports exact table-number search with province, exam-center, and track filters, and visualizes published passing candidates across Cambodia's 25 provinces and capital.

Archive files are deliberately excluded from Git. Keep each year in its own directory:

```text
data/
  bacii-2026/
    bacii-2026.sqlite
    labels.json
    pdfs/
      *.pdf
```

The API opens archive databases in read-only mode. The current archive contains only the candidates MOEYS published as passing, so the dashboard reports passing-candidate counts rather than pass rates. Because the source PDFs have broken Khmer character mappings, result cards render the exact name and school cells from the official PDF instead of displaying corrupted extracted text. These crops are created lazily only for search results, cached under `data/archive-name-crops`, and linked to the matching official PDF page for verification. Date of birth is intentionally omitted from both archive search responses and result cards.

Build the exam-center label cache once before packaging or transferring a year:

```powershell
.\.venv\Scripts\python.exe scripts\ocr_archive_centers.py --archive data\bacii-2026
```

On Linux, use `.venv/bin/python` instead. The command OCRs one official header per distinct exam center, writes proper Unicode Khmer labels incrementally to `labels.json`, and resumes unfinished work on the next run. The original extracted center value remains the internal search key, so a display-label correction cannot break filtering. Transfer `labels.json` with the SQLite file and PDFs; the production API reloads it when the file changes and never runs this batch during a user request.

To rebuild the searchable database and CSV from already downloaded PDFs without making network requests:

```powershell
.\.venv\Scripts\python.exe scripts\archive_bacii_2026.py --archive-dir data\bacii-2026 --reindex-only
```

The importer verifies each province against the passing total printed on its official PDF summary page, then verifies the national A–E totals. It stops with an error instead of accepting a partial archive when any total differs.

## Khmer BacII OCR search

The result gallery can build a local search index for Cambodia BacII result sheets. The fast default reads the repeated header (exam center, province, and science/social-science track) plus the first table-number column. Enable **Also recognize Khmer names** only when name search is needed, because it runs the recognizer on every student row.

Install the optional OCR runtime once:

```powershell
npm run ocr:setup
```

Restart the app, paste a province result-album URL, scan it, and choose **Detect centers**. The app indexes the entire album, builds exam-center and track selectors from the recognized headers, and finds the matching photo from an exact first-column table number. The first job downloads the `Darayut/khmer-text-recognition` model from Hugging Face (about 18 million parameters). OCR runs locally and its searchable metadata is persisted in SQLite.

The fast number-column pass also requires Tesseract 5 on `PATH`. On Windows the standard `C:\Program Files\Tesseract-OCR\tesseract.exe` location is detected automatically; set `TESSERACT_CMD` for a custom location. Set `OCR_PYTHON` to use a Python environment other than the project `.venv`, or `KHMER_OCR_MODEL` and `KHMER_OCR_REVISION` to test a compatible pinned model.

MKLDNN/oneDNN is disabled by default so CPU OCR remains compatible with older servers and virtual CPUs. A modern host can opt back into the faster kernels with `TORCH_MKLDNN=1` after verifying OCR inference on that CPU.

## Persistent cache and search database

The server stores album manifests, recognized photo metadata, and normalized table-number rows in `data/album-packer.sqlite`. Repeating the same album scan restores its ordered photo list without reopening Facebook, and repeating the same OCR mode restores matching results without rerunning the model. The cache survives application restarts.

- Album manifests refresh after 30 minutes by default. Set `ALBUM_CACHE_TTL_MINUTES` to change that interval.
- Set `DATABASE_PATH` to place the SQLite database elsewhere, including on a persistent deployment volume.
- A changed photo or OCR pipeline version creates a new OCR record automatically, so stale recognition is not reused.
- Identical OCR requests share one active job, preventing simultaneous users from processing the same uncached album more than once.
- Uncached OCR jobs use a bounded queue. `OCR_MAX_CONCURRENT` controls active Python workers and `OCR_MAX_QUEUE` controls how many jobs may wait.
- `GET /api/database/stats` reports stored album, photo, OCR-result, searchable-row, and cache hit/miss counts.
- `GET /api/ocr/status` reports the configured concurrency plus current running and queued job counts.
- Send `{ "url": "...", "forceRefresh": true }` to `POST /api/discover` when an album must be rescanned immediately.

## How it works

- The album URL or Facebook-app Share URL must use HTTPS on `facebook.com` and be publicly visible without signing in. Share links are resolved to their canonical album before pagination.
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
- The Docker defaults run one OCR worker with six PyTorch CPU threads, suitable for an 8-vCPU host. Tune `OCR_TORCH_THREADS`, `OMP_NUM_THREADS`, and `MKL_NUM_THREADS` together if the server has a different CPU count.
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

### Transfer archive data without Git

Create a host-only archive directory and transfer the generated archive independently of the source repository:

```bash
# On the server
sudo mkdir -p /srv/bacii-archive
sudo chown "$USER":"$USER" /srv/bacii-archive
```

From the development machine, package and upload one year (PowerShell):

```powershell
tar -czf bacii-2026.tar.gz -C data bacii-2026
scp bacii-2026.tar.gz USER@SERVER:/tmp/
```

Then install it atomically on the server:

```bash
mkdir -p /srv/bacii-archive/.incoming
tar -xzf /tmp/bacii-2026.tar.gz -C /srv/bacii-archive/.incoming
mv /srv/bacii-archive/.incoming/bacii-2026 /srv/bacii-archive/bacii-2026
rm -f /tmp/bacii-2026.tar.gz
```

Set `BACII_ARCHIVE_HOST_PATH=/srv/bacii-archive` in the server `.env`, then run `docker compose up -d --build`. The public API still opens published SQLite archives read-only, while the protected importer has write access to this directory. Future years appear automatically after atomic publication.

### Automated archive import

Generate a strong token and put it in the production `.env` (never commit the token):

```bash
openssl rand -hex 32
# Edit .env and set ADMIN_TOKEN to the generated value.
sudo mkdir -p /srv/bacii-archive/.imports
sudo chown -R root:root /srv/bacii-archive
sudo chmod -R u+rwX,go+rX /srv/bacii-archive
docker compose up -d --build
```

Open `https://YOUR-API-DOMAIN/admin`. This route is intentionally absent from public navigation. Enter the admin token, archive year, and official public MOEYS Facebook or Telegram post URL. Telegram links may use either `https://t.me/channel/message` or `https://t.me/s/channel/message`. The importer requires exactly 25 recognized province/capital links, supports both current `moeys.gov.kh/bacii` documents and the 2025 `go.gov.kh` links, validates every redirect against a small government/Google Drive host allowlist, validates each PDF against its printed candidate total, builds the search database and CSV, OCRs center labels, and publishes the completed year atomically. Only one import can run at a time.

The token protects the API, not merely the hidden page address. It is held in browser `sessionStorage` for the current tab session. Back up `/srv/bacii-archive` regularly; the automated importer intentionally refuses to overwrite an existing year.

For local imports, the server automatically uses `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on Linux when `OCR_PYTHON` is not set. Docker explicitly uses `/app/.venv/bin/python`. This keeps the archive parser and Khmer center OCR on the environment containing PyTorch and the OCR dependencies. Failed or cancelled jobs retain their per-year staging data under `.imports`, so retrying the same year resumes completed PDF downloads and OCR labels instead of starting from zero. Staging is removed automatically after publication.

## GitHub Pages frontend

GitHub Pages hosts only the static React frontend. Album scanning, OCR, caching, and ZIP creation continue to run on your server. The public frontend URL is:

```text
https://rathpiseyalpha.github.io/bacii-result-fbalbum-search/
```

Before enabling Pages:

1. Expose the server API over HTTPS. An HTTP IP address will be blocked by browsers because the Pages site uses HTTPS.
2. In the GitHub repository, open **Settings > Secrets and variables > Actions > Variables** and create `API_BASE_URL` with the HTTPS server origin, for example `https://203.0.113.10` (no trailing slash and no `/api`).
3. Open **Settings > Pages** and set **Source** to **GitHub Actions**.
4. In the server `.env`, keep `ALLOWED_ORIGINS=https://rathpiseyalpha.github.io`, then rebuild with `docker compose up -d --build`.
5. Push to `main`, or run the **Deploy frontend to GitHub Pages** workflow manually.

The workflow builds with `/bacii-result-fbalbum-search/` as Vite's base path while local development continues to use `/` and the port `5173` proxy.
