# Annual Archive Import Pipeline

Last updated: 2026-09-03 (Asia/Phnom Penh)

This document describes the annual PDF import feature. It lets an administrator paste an official MOEYS Facebook or Telegram post, discover all 25 province/capital result documents, download and validate the PDFs, build the annual SQLite search archive, and OCR the Khmer exam-center labels directly on the production server.

## Entry points

### Admin UI

- Direct route: `/admin`
- Static-host fallback: `#admin`
- Component: `src/AdminPage.tsx`
- There is no public menu link.
- The token is entered by the administrator and retained only in `sessionStorage` for the browser session.

### Admin API

The routes are registered in `server/index.ts` and implemented by `server/admin-archive.ts`:

```text
GET    /api/admin/archive-imports
POST   /api/admin/archive-imports
GET    /api/admin/archive-imports/:id
DELETE /api/admin/archive-imports/:id
```

All routes require `Authorization: Bearer <ADMIN_TOKEN>`. Authentication uses a timing-safe comparison. CORS permits the `Authorization` header.

Example request body:

```json
{
  "year": 2025,
  "postUrl": "https://t.me/moeysnews/37100"
}
```

Do not put the real admin token in source, documentation, frontend build variables, GitHub Pages settings, logs, or screenshots.

## Job lifecycle

Only one import job can run at a time in the Node process.

```text
Validate request and token
  → discover exactly 25 official document URLs
  → write a normalized manifest
  → run the Python downloader/parser/indexer
  → run exam-center OCR
  → validate all artifacts
  → atomically publish the completed year directory
```

Job state, progress, and recent logs are in memory. An application restart loses the status record. The actual staging directory is stable and retained after failure or cancellation, so the next import for the same year can reuse already-downloaded PDFs and completed work.

Cancellation terminates the spawned child process and, on Linux, its process group. The import is not published until every stage succeeds.

## Directories and publication

With `BACII_ARCHIVE_ROOT=/app/archive`, a 2025 import uses:

```text
/app/archive/
  .imports/
    bacii-2025/
      bacii-2025/          retained staging directory
  bacii-2025/              atomically published final archive
    bacii-2025.sqlite
    students.csv
    manifest.json
    stats.json
    pdf/
    labels.json
```

The importer refuses to overwrite an already-published year. Replacement should be a deliberate backup-and-migrate operation, not an automatic import retry.

## Source discovery

### Facebook

Facebook post/share URLs are resolved with Playwright. The discovery code unwraps Facebook redirect/wrapper URLs before validating document destinations. Since public Facebook markup and anti-automation behavior can change, treat this as a maintained integration rather than a permanent parser.

Known verified official examples:

- 2026 share post: `https://web.facebook.com/share/p/1JCXKktxbb/`
- 2024 canonical post: `https://www.facebook.com/moeys.gov.kh/posts/pfbid0262c3Z9oCqicdRHiq5Xbp1jyxQtiXQPXjPnWyAx5c2uDfVfSNvqZDGm8pLmRxEgnXl`
- 2023 share post: `https://web.facebook.com/share/p/18UpeTRgkZ/`

The 2023 share URL resolves to a canonical MOEYS post containing 25 known Bitly links. For safety, the code maps only those exact official short codes to provinces.

### Telegram

Public Telegram URLs in the form `https://t.me/<channel>/<post>` are converted to the embeddable public form `https://t.me/s/<channel>/<post>` and fetched without a Telegram account.

Known verified official examples:

- 2026: `https://t.me/moeysnews/42982`
- 2025: `https://t.me/moeysnews/37100`

### Historical normalization

The code normalizes source-specific names to stable database slugs:

- 2026 uses MOEYS document slugs such as `phnompenh26`.
- 2025 recognizes the 25 official `go.gov.kh/moeys/...2025` short links. Most resolve to `file.go.gov.kh`; Phnom Penh resolves to a public Google Drive file. Canonical archive slugs use the province base plus `25`.
- 2024 recognizes slugs such as `result-banteaymeanchey-2024`. Known source spelling aliases are normalized: `rattanakiri` to `ratanakiri`, `oddarmanchey` to `oddarmeanchey`, and `tbongkhmum` to `tboungkhmum`. Canonical archive slugs use the province base plus `24`.
- 2023 recognizes only the allowlisted official Bitly codes, resolves their Drive targets, and uses canonical archive slugs ending in `23`.

The exact 25-link maps are in `server/admin-archive.ts`. Do not replace explicit allowlists with a permissive arbitrary redirect downloader.

## Download security

The importer must not become a server-side request forgery endpoint. It accepts only known source shapes and permitted final document hosts. Current PDF destinations include:

- `moeys.gov.kh` and permitted subdomains
- `file.go.gov.kh`
- `drive.usercontent.google.com`

Google Drive sharing links are converted to direct public-download URLs. Redirect destinations are revalidated. New years or official hosting providers should be added narrowly after inspecting the real source.

## Python indexing stage

The Node job creates a manifest and invokes `scripts/archive_bacii_2026.py`. Despite the legacy filename, the script supports:

```text
--year YYYY
--post-url URL
--manifest-input PATH
```

Interpreter selection order is:

1. `OCR_PYTHON`, when configured.
2. Project `.venv/Scripts/python.exe` on Windows.
3. Project `.venv/bin/python` on Linux.
4. A system Python fallback.

The script:

1. Requires exactly 25 normalized documents.
2. Reuses valid downloads already present in staging.
3. Downloads missing PDFs through `curl`.
4. Records file size and SHA-256.
5. Opens every PDF with PyMuPDF before trusting it.
6. Parses document/page metadata and student rows.
7. Checks each parsed document row count against the official passing total printed on the final PDF page.
8. Accepts grades A–E only and checks that grade totals equal the student count.
9. Writes the SQLite database, CSV, manifest, statistics, PDFs, and supporting metadata.
10. Checkpoints SQLite WAL and switches to `journal_mode=DELETE` before publication.

The existing exact national 2026 total validation remains in place. Other years use per-document official totals, which are stronger than trusting a scraped post caption.

## Rotated 2023 PDFs

Some 2023 result pages have a 90-degree PDF rotation. Raw PyMuPDF word coordinates are in unrotated page space while visible cells are rotated. `normalized_page_words(page)` applies `page.rotation_matrix` to word boxes so row parsing and crop selection use visible page coordinates.

The following scripts share this normalization:

- `scripts/archive_bacii_2026.py`
- `scripts/ocr_archive_centers.py`
- `scripts/render_pdf_name.py`
- `scripts/render_pdf_school.py`

Do not remove this transformation just because 2024–2026 PDFs appear unrotated.

## Exam-center OCR

After indexing, `scripts/ocr_archive_centers.py` builds/refines Khmer exam-center labels. It prefers stored `pages.exam_center_raw`, falls back to page parsing when necessary, rejects implausibly long/digit-heavy/summary strings, and writes `labels.json` incrementally.

The OCR model checked in the local virtual environment is `Darayut/khmer-text-recognition`. OCR is CPU- and memory-intensive and may launch Tesseract subprocesses as part of fallback processing.

Important: the script's `--limit 0` means no limit. It will process all remaining labels; it does not mean zero work.

## Name and school rendering

Archive search results render source-image crops for names and schools rather than displaying damaged PDF text extraction. Crop routes use `scripts/render_pdf_name.py` and `scripts/render_pdf_school.py`, and results are cached beneath the app data/cache directory.

The official PDF-page link depends on the original PDF existing inside the published archive directory. A database copied without its matching PDFs will produce missing crop images and broken PDF links.

## Critical compatibility issue to resolve

The importer stores reliable values in `pages.exam_center_raw` and `pages.track_raw`, but parts of `server/archive.ts` still derive these values from `pages.text_raw`. That older approach may work for 2026 yet fail on rotated 2023 text order or produce mojibake-derived labels.

Audit at least:

- Summary exam-center counts.
- Center list/dropdown queries.
- Track filtering SQL.
- Student-search joins and filters.

Prefer stored columns and preserve a fallback only for legacy databases where those columns are empty. Test against a 2023 rotated sample and the existing 2026 archive before changing query behavior.

## Validation evidence and remaining scope

Confirmed discovery:

- 2023: 25 normalized documents, all direct downloads on the permitted Drive host.
- 2024: 25 normalized MOEYS documents.
- 2025: 25 normalized government links, ending on government file hosting or public Drive.
- 2026: 25 documents from both the known Facebook and Telegram posts.

Confirmed parser samples:

| Year | Province | Parsed rows | Official passing total |
|---|---|---:|---:|
| 2023 | Pailin | 503 | 503 |
| 2024 | Banteay Meanchey | 4,839 | 4,839 |
| 2025 | Battambang | 7,823 | 7,823 |

Still required before broad production claims:

1. Complete all 25 documents for 2023, 2024, and 2025 in a staging archive root.
2. Confirm aggregate and per-province counts through the public API.
3. Verify at least one science and social-science student per year.
4. Verify Khmer center labels, school crops, name crops, and PDF-page links.
5. Test cancel/retry and restart/retry behavior.
6. Test disk-full and corrupt-partial-download failure behavior.
