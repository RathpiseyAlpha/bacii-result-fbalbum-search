# BacII Result Search Engine — Development Handoff

Last updated: 2026-09-03 (Asia/Phnom Penh)

This document is the starting point for the next developer or AI agent. Read it together with:

- [ARCHIVE_IMPORT_PIPELINE.md](./ARCHIVE_IMPORT_PIPELINE.md) for the annual PDF importer, parser, OCR, and validation details.
- [DEPLOYMENT_AND_OPERATIONS.md](./DEPLOYMENT_AND_OPERATIONS.md) for local and production deployment, data volumes, backups, and troubleshooting.

## Project goal

The application has two related functions:

1. Search public MOEYS Facebook photo albums for BacII result sheets by exam center, track, and table number.
2. Maintain a searchable annual archive built from official MOEYS result PDFs, with student search, province statistics, maps, and cross-year insights.

The public UI is Khmer/English and is built for desktop and mobile. Student date of birth is deliberately not displayed by the archive API or result cards.

## Current repository state

Branch: `main`

Most recent committed work at the time of this handoff:

- `492a48a` — Fix archive PDF paths on Linux
- `9bfb075` — Add BacII archive search and insights dashboard
- `d4432d2` — Show live server and queue status
- `a24c43f` — Bound and deduplicate OCR workloads
- `6ab6c5b` — Show message when table number is missing

The protected archive-import dashboard and multi-year import support were introduced in the change set accompanying this handoff. Start with `git status --short` and recent `git log` output before editing so later local work is not mistaken for the documented baseline.

Files introduced or materially updated by that change set:

```text
.env.example
README.md
compose.yaml
package.json
scripts/archive_bacii_2026.py
scripts/ocr_archive_centers.py
scripts/render_pdf_name.py
scripts/render_pdf_school.py
server/index.ts
server/security.ts
server/admin-archive.ts
src/main.tsx
src/styles.css
src/AdminPage.tsx
docs/*.md
```

If `bacii-2026-prod.tar.gz` is present locally, it is a user-owned deployment artifact. Do not modify, delete, or commit it. The `.env` file and `data/` are ignored and must never be committed.

## Application structure

```text
React/Vite UI
  ├─ src/App.tsx             Facebook album search
  ├─ src/ArchivePage.tsx     Annual PDF archive search
  ├─ src/InsightsPage.tsx    Province and cross-year dashboards
  └─ src/AdminPage.tsx       Hidden protected importer at /admin
           │
           ▼
Express API on port 8787
  ├─ server/index.ts         HTTP routes, queues, static frontend
  ├─ server/facebook.ts      Public Facebook discovery
  ├─ server/database.ts      Album/OCR cache database
  ├─ server/archive.ts       Read-only annual archive queries
  └─ server/admin-archive.ts Import job orchestration
           │
           ▼
Python pipeline
  ├─ scripts/archive_bacii_2026.py
  ├─ scripts/ocr_archive_centers.py
  ├─ scripts/render_pdf_name.py
  ├─ scripts/render_pdf_school.py
  └─ ocr/worker.py
```

The legacy filename `scripts/archive_bacii_2026.py` now supports arbitrary years even though its name still says 2026.

## Public frontend navigation

The fixed header exposes classic menu links for:

- Facebook result photo search
- Annual archive search
- Data insights

Archive sections render as dynamic same-page views instead of one long stacked page. Clicking a province on the Cambodia map updates the adjacent province detail panel with totals, grades A–E, exam-center count, school count, and related statistics.

The admin page is intentionally absent from public navigation. It is available at `/admin`; hash routing with `#admin` is also recognized for hosts that cannot serve direct path fallbacks.

## Existing data model and storage

There are two separate classes of data:

- The album scanner uses the main `better-sqlite3` database configured by `DATABASE_PATH`. It stores album/photo discovery and OCR/cache records.
- Each annual PDF archive has its own SQLite database under `BACII_ARCHIVE_ROOT`, normally `bacii-YYYY/bacii-YYYY.sqlite`.

Annual archive databases contain `archive_info`, `documents`, `pages`, and `students` tables plus indexes. PDFs, metadata, CSV exports, OCR labels, and crop cache files live beside or beneath the year directory. Public archive connections are opened read-only/query-only.

No archive data is intended to live in Git. Production data must be mounted into the container and backed up separately.

## Work completed in the archive-import change set

### Protected importer

- Added a hidden React admin dashboard in `src/AdminPage.tsx`.
- Added bearer-token-protected import endpoints under `/api/admin/archive-imports`.
- Added import start, progress/log polling, cancellation, and retained staging data for resume.
- Added Facebook and Telegram public-post discovery.
- Restricted imports to exactly 25 recognized Cambodia province/capital documents.
- Added safe destination-host allowlists and known historical short-link mappings.
- Made the archive Docker mount writable for server-side importing.
- Made `npm start` and the API development process load `.env` when present.

### Multi-year archive parsing

- Added `--year`, `--post-url`, and `--manifest-input` to the archive script.
- Added resumable PDF downloads and PDF size/hash/open validation.
- Added per-document validation: parsed student count must equal the official passing total printed in the PDF.
- Added grade validation: only A–E are accepted and the grade sum must equal the student count.
- Added rotated-page coordinate normalization required by the 2023 PDFs.
- Updated name, school, and exam-center crop generation to use normalized coordinates.
- Added final SQLite WAL checkpoint and conversion to `journal_mode=DELETE` before publishing.

### Known supported official sources

| Year | Verified discovery source | Link format |
|---|---|---|
| 2026 | Facebook share post and Telegram post `moeysnews/42982` | MOEYS document slugs such as `phnompenh26` |
| 2025 | Telegram post `moeysnews/37100` | `go.gov.kh/moeys/...2025`, resolving to government files or public Google Drive |
| 2024 | MOEYS Facebook post | MOEYS slugs such as `result-banteaymeanchey-2024` |
| 2023 | Facebook share post | An explicitly allowlisted set of 25 Bitly links resolving to public Google Drive |

Exact mappings and normalization aliases are deliberately kept in `server/admin-archive.ts`; see the pipeline document before changing them.

## Validation already performed

The current local code has passed:

- `npm run check`
- `npm run build`
- Python bytecode compilation for the archive importer and OCR/crop scripts
- `.venv\Scripts\python.exe ocr\worker.py --check`
- `docker compose config --quiet`
- `git diff --check`
- Admin API checks: missing/incorrect auth returns `401`, correct auth returns `200`, and `/admin` returns `200`

The OCR environment reported the CPU model `Darayut/khmer-text-recognition`, with MKLDNN disabled.

Live source discovery found 25 unique documents for each of 2023, 2024, 2025, and 2026. Parser spot checks matched official passing totals:

- 2023 Pailin: 503 rows
- 2024 Banteay Meanchey: 4,839 rows
- 2025 Battambang: 7,823 rows

Generated 2023 name, school, and exam-center crops were visually checked locally and appeared upright and correctly targeted after rotation normalization.

Full end-to-end imports for every province in 2023, 2024, and 2025 have not yet been completed. The importer should stop safely when a province does not match the expected format.

Browser-based visual verification was not available in the previous environment. UI validation was limited to compilation, production bundle generation, route checks, API checks, and source inspection.

## Highest-priority technical follow-up

Before declaring older archive years fully supported, inspect `server/archive.ts`. Some summary, center-filter, track-filter, and search code still derives exam center and track from `pages.text_raw` using older text-pattern expressions.

The importer now stores the more reliable values in `pages.exam_center_raw` and `pages.track_raw`. Rotated 2023 text can have a different word order even when these stored columns are correct. Update archive queries to prefer the stored columns, retaining a safe fallback for older 2026 databases if needed. Then verify:

1. Province summary exam-center counts.
2. Exam-center dropdown values and Khmer rendering.
3. Science/social-science filtering.
4. Student search results for one sample in every supported year.
5. Name and school crop endpoints and official PDF links.

This is the most likely remaining cause of a successful import producing incorrect public center/track metadata.

## Other known limitations

- Import jobs and logs are held in memory. Restarting the Node process clears job status, although staged files remain and a retry for the same year resumes downloads/work.
- Only one import is allowed at a time. Do not run multiple app replicas against the same writable archive root without a distributed lock.
- Facebook HTML is unstable and Playwright-based discovery may need maintenance.
- The 2023 Bitly mapping accepts only the known official codes. Alternate posts or short codes are intentionally rejected.
- Import assumes exactly 25 province/capital documents and indexes passing candidates, not every registered candidate.
- Center OCR is CPU-intensive. `--limit 0` means unlimited work; it is not a dry-run option.
- OCR labels are written incrementally to preserve progress, but a full year may still take significant time on CPU-only hardware.

## First actions for the next agent

1. Run `git status --short` and inspect all existing edits without discarding them.
2. Do not print, copy, or commit `.env`; it contains the private admin token.
3. Do not modify or commit `bacii-2026-prod.tar.gz` or ignored archive/student data.
4. Read `server/admin-archive.ts`, `scripts/archive_bacii_2026.py`, and `server/archive.ts` before changing the importer or public archive queries.
5. Fix and test the stored center/track-field issue described above.
6. Run a complete historical import in a disposable/staging archive root before production use.
7. Re-run TypeScript, production build, Python, Compose, and diff checks.
8. Review the final diff and commit only intended source/documentation files.
9. Do not push until the user explicitly asks.

## Useful local commands

```powershell
npm run check
npm run build
npm start
docker compose config --quiet
git diff --check
git status --short
```

The production-style local server normally listens at `http://localhost:8787`. Do not assume an old process is still alive; confirm the port and logs first.
