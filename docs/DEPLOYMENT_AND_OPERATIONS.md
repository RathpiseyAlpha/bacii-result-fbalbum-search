# Deployment and Operations Runbook

Last updated: 2026-09-03 (Asia/Phnom Penh)

This application can run as one Docker container serving the compiled frontend, Express API, album scanner, annual archive reader, and protected archive importer. The importer performs expensive Python/PDF/OCR work, so operational controls and durable data mounts matter more than adding web replicas immediately.

## Configuration

The repository intentionally contains `.env.example`, not a real `.env`. Create `.env` independently on each machine. Never commit or send it.

Important variables include:

```dotenv
PORT=8787
ADMIN_TOKEN=<long-random-secret>
DATABASE_PATH=/app/data/app.sqlite
BACII_ARCHIVE_ROOT=/app/archive
OCR_PYTHON=/app/.venv/bin/python
```

Use the names and defaults in the current `.env.example` as the authoritative list. Generate a production admin token on the server:

```bash
openssl rand -hex 32
```

Set the result only in the server's `.env`. The token grants import/cancel access and must never be exposed as a `VITE_` variable, because Vite variables are embedded into public JavaScript.

Local `npm start` and the API half of `npm run dev` use `tsx --env-file-if-exists=.env`, so a project-root `.env` is loaded automatically.

## Docker layout

The production service normally binds only to localhost so Cloudflare Tunnel or another reverse proxy is the public entry point:

```text
Internet
  → Cloudflare Tunnel
  → http://127.0.0.1:8787
  → Docker app container
       ├─ /app/data       main album/cache SQLite and rendered crop cache
       └─ /app/archive    annual databases, PDFs, imports, labels, CSVs
```

The Compose archive mount must be read-write for the admin importer. Public archive database connections still use SQLite read-only/query-only mode.

Recommended host directories:

```text
/srv/bacii-app-data
/srv/bacii-archive
```

Ensure the archive directory is writable by the container process while remaining non-public on the host:

```bash
sudo mkdir -p /srv/bacii-app-data /srv/bacii-archive
sudo chown -R root:root /srv/bacii-app-data /srv/bacii-archive
sudo chmod -R u+rwX,go+rX /srv/bacii-app-data /srv/bacii-archive
```

Adjust ownership if the container is later changed to a non-root UID. Do not solve permission errors with world-writable `chmod 777`.

## Deploy or update

On the server:

```bash
git pull --ff-only
docker compose build
docker compose up -d --remove-orphans
docker compose ps
docker compose logs --tail=200 app
```

Use Docker Compose v2 (`docker compose`), not the obsolete Python `docker-compose` 1.29.x. The old implementation can fail with `KeyError: 'ContainerConfig'` on current Docker images.

If the Docker repository is not configured and `docker-compose-plugin` is unavailable from Ubuntu's default packages, install Docker Engine and the Compose plugin from Docker's official apt repository rather than reinstalling the legacy Python package.

## First deployment checks

From the server:

```bash
curl -fsS http://127.0.0.1:8787/
curl -i http://127.0.0.1:8787/api/admin/archive-imports
```

The first command should return the app. The second should return `401 Unauthorized` without a bearer token; that confirms the protected route exists without exposing the secret.

Then test with the token without putting it in shell history when possible. Verify the public domain, `/admin`, archive summary endpoint, one name crop, one school crop, and one official PDF link.

## Cloudflare Tunnel

Only one `cloudflared` system service is required per machine. Add another public hostname/origin mapping to the existing tunnel rather than trying to install a second service.

In the Cloudflare Zero Trust dashboard, configure the application's public hostname to target:

```text
http://127.0.0.1:8787
```

After changing a hostname, verify both the tunnel route and public DNS record. A route-name change without its matching DNS record commonly appears as a DNS resolution failure.

## GitHub Pages frontend option

The frontend may be built for GitHub Pages using `VITE_API_BASE_URL` pointed at the HTTPS API domain. However:

- The API, importer, PDFs, SQLite databases, and OCR still run on the server.
- CORS must explicitly allow the GitHub Pages origin.
- Direct navigation to `/admin` may 404 on GitHub Pages because it is a static host without a server fallback.
- Prefer opening the admin page on the API/app domain. The `#admin` form is available as a static-host fallback.
- Never place `ADMIN_TOKEN` in GitHub Pages secrets used as a Vite build variable.

## Importing a year in production

1. Confirm free disk space and make a backup.
2. Open `https://<app-domain>/admin`.
3. Enter the server admin token for this browser session.
4. Select the year and paste the official public Facebook or Telegram post URL.
5. Start the import and monitor progress/logs.
6. If cancelled or failed, fix the reported issue and start the same year again; stable staging should resume valid work.
7. After publication, verify the year's public summary, province counts, student search, crops, and PDF link.

Never manually move a half-built staging directory into the public year path. Publication is deliberately atomic and occurs only after successful validation and OCR.

## Moving prebuilt archive data without Git

Archive data should be transferred independently of source code. For a one-time transfer, use `rsync` because it is resumable and verifies changed file sizes/timestamps:

```bash
rsync -avh --partial --progress data/bacii-2025/ user@server:/srv/bacii-archive/bacii-2025/
```

On Windows, run `rsync` from WSL or use `scp` for a small one-time archive. For repeated transfers, the in-app importer is preferable because it downloads official files directly on the server and validates them before publication.

Always copy the complete year directory, not just the SQLite file. Missing PDFs cause broken official-page links and prevent lazy name/school crop rendering. After copying, verify permissions and restart only if the running process does not discover the new year dynamically.

## Backups

Back up both persistent roots:

- Main app data: album cache/database and rendered crop cache.
- Annual archive data: year databases, source PDFs, manifests, OCR labels, and import staging.

Before backing up a live SQLite database, prefer a SQLite online backup or stop the app briefly. Published annual databases use `journal_mode=DELETE`, simplifying file-level snapshots, but the main app database may still use WAL and require its `-wal`/`-shm` companions if copied live.

At minimum, retain:

```text
/srv/bacii-app-data/
/srv/bacii-archive/
/path/to/repository/.env        stored securely, separately from public backups
```

Test restore procedures. A backup is incomplete if the SQLite archive is restored but its PDFs are not.

## Capacity and scaling

The bottleneck during a new album/year scan is CPU and memory consumed by Python OCR and Tesseract, not ordinary archive search. Existing indexed searches are SQLite reads and should be substantially cheaper.

Current safeguards include bounded/deduplicated OCR workloads, cached results, queue/status reporting, and only one annual importer job. For an 8-core/8-GB host, unbounded workers can saturate every CPU and force swap, increasing rather than reducing throughput.

Recommended order of improvement:

1. Keep OCR concurrency bounded according to measured memory per worker.
2. Reuse indexed/cached results and avoid rescanning identical albums or years.
3. Separate background OCR/import work from the web process when operational isolation is needed.
4. Add a durable queue such as Redis/BullMQ before horizontally scaling workers.
5. Put read-only API replicas behind a load balancer only after shared cache/data and job locking are designed.

Do not run multiple importer-capable replicas against the same archive directory today. The single-job guard is process-local, not distributed.

## Troubleshooting

### `unable to open database file`

Check:

- `BACII_ARCHIVE_ROOT` inside the container.
- The host-to-container volume mapping.
- The expected path `bacii-YYYY/bacii-YYYY.sqlite`.
- Directory traversal/read permissions for the container user.
- That the copied filename and year directory match exactly, including Linux case sensitivity.

Inspect from inside the service:

```bash
docker compose exec app sh -lc 'id; echo "$BACII_ARCHIVE_ROOT"; find /app/archive -maxdepth 3 -type f | sort | head -100'
```

### Database works but crops/PDF links fail

The SQLite database was probably copied without its source PDFs, or PDF `local_path` entries use Windows separators/old absolute paths. Current imports store POSIX relative paths. Confirm files exist inside the same published year directory and the route resolves the path beneath `BACII_ARCHIVE_ROOT`.

### Incorrect Khmer school/exam-center text

Names and schools should use source-image crops. Exam-center dropdown labels use OCR labels. Confirm `labels.json` and PDFs were copied and inspect the stored `pages.exam_center_raw` values. Also address the `server/archive.ts` legacy `text_raw` query issue described in `ARCHIVE_IMPORT_PIPELINE.md`.

### `ModuleNotFoundError: torch`

The script is using the wrong Python interpreter. Set `OCR_PYTHON` to the project/container virtual environment and verify:

```bash
/app/.venv/bin/python -c 'import torch, fitz, PIL; print(torch.__version__)'
```

### NumPy reports unsupported `X86_V2`

The installed NumPy wheel was built for a newer CPU baseline than the server supports. Use the project's compatible pinned package/build strategy and build on a conservative CPU image. Do not solve it by copying a virtual environment from a different CPU or OS.

### Docker build fails compiling `better-sqlite3`

The image needs native build tooling (`make`, compiler, Python) unless a compatible prebuilt binary exists. Prefer the repository's pinned Node/base-image version and ensure the builder stage installs the required toolchain. Avoid an unpinned bleeding-edge Node release on an old server CPU.

### Legacy Compose `ContainerConfig` error

Replace `docker-compose` v1 with Compose v2. If a failed legacy recreation left an obsolete container, remove only the exact Compose service container after confirming its data is in named/bind volumes, then run `docker compose up -d`.

## Release checklist

Before committing or deploying:

```powershell
npm run check
npm run build
.venv\Scripts\python.exe -m py_compile scripts\archive_bacii_2026.py scripts\ocr_archive_centers.py scripts\render_pdf_name.py scripts\render_pdf_school.py
docker compose config --quiet
git diff --check
git status --short
```

Review the staged file list. Exclude `.env`, `data/`, generated databases/PDFs/crops, `bacii-2026-prod.tar.gz`, logs, and temporary downloads. Push only when explicitly requested.
