#!/usr/bin/env python3
"""Download and index the official MOEYS BacII 2026 result PDFs.

The generated archive is intentionally kept under data/bacii-2026, which is
git-ignored because it contains large public result documents and student data.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import http.client
import json
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

try:
    import pymupdf
except ImportError as error:
    raise SystemExit(
        "PyMuPDF is required. Install it with: .venv/Scripts/python -m pip install pymupdf"
    ) from error


POST_URL = "https://web.facebook.com/share/p/1JCXKktxbb/"
BASE_URL = "https://moeys.gov.kh/"
API_TEMPLATE = BASE_URL + "api/v1/web/get-document-detail-with-category/bacii/{slug}"
PROVINCES = [
    ("phnompenh26", "រាជធានីភ្នំពេញ"),
    ("kandal26", "កណ្តាល"),
    ("pailin26", "ប៉ៃលិន"),
    ("stungtreng26", "ស្ទឹងត្រែង"),
    ("kohkong26", "កោះកុង"),
    ("oddarmeanchey26", "ឧត្តរមានជ័យ"),
    ("preahvihear26", "ព្រះវិហារ"),
    ("ratanakiri26", "រតនគិរី"),
    ("preahsihanouk26", "ព្រះសីហនុ"),
    ("kratie26", "ក្រចេះ"),
    ("pursat26", "ពោធិ៍សាត់"),
    ("svayrieng26", "ស្វាយរៀង"),
    ("kampongchhnang26", "កំពង់ឆ្នាំង"),
    ("kampongspeu26", "កំពង់ស្ពឺ"),
    ("kampot26", "កំពត"),
    ("tboungkhmum26", "ត្បូងឃ្មុំ"),
    ("kampongthom26", "កំពង់ធំ"),
    ("banteaymeanchey26", "បន្ទាយមានជ័យ"),
    ("preyveng26", "ព្រៃវែង"),
    ("kampongcham26", "កំពង់ចាម"),
    ("battambang26", "បាត់ដំបង"),
    ("takeo26", "តាកែវ"),
    ("siemreap26", "សៀមរាប"),
    ("kep26", "កែប"),
    ("mondulkiri26", "មណ្ឌលគិរី"),
]
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
BROWSER_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/pdf,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,km;q=0.8",
    "Referer": "https://moeys.gov.kh/",
    "Sec-Ch-Ua": '"Chromium";v="138", "Google Chrome";v="138", "Not?A_Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"' if sys.platform == "win32" else '"Linux"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}
OFFICIAL_GRADE_TOTALS = {"A": 2022, "B": 8848, "C": 23422, "D": 44869, "E": 46814}


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def head_size(url: str) -> int:
    MIN_VALID_PDF_SIZE = 100_000
    try:
        request = urllib.request.Request(url, method="HEAD", headers=BROWSER_HEADERS)
        with urllib.request.urlopen(request, timeout=20) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            size = int(response.headers.get("Content-Length") or 0)
            if size >= MIN_VALID_PDF_SIZE and ("pdf" in content_type or "octet-stream" in content_type or "binary" in content_type):
                return size
    except Exception:
        pass
    try:
        range_headers = dict(BROWSER_HEADERS)
        range_headers["Range"] = "bytes=0-0"
        request = urllib.request.Request(url, headers=range_headers)
        with urllib.request.urlopen(request, timeout=20) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            content_range = response.headers.get("Content-Range") or ""
            match = re.search(r"/(\d+)$", content_range)
            if match:
                size = int(match.group(1))
                if size >= MIN_VALID_PDF_SIZE and ("pdf" in content_type or "octet-stream" in content_type or "binary" in content_type):
                    return size
    except Exception:
        pass
    return 0


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_parallel_segments(url: str, target: Path, expected_size: int, num_workers: int = 6) -> bool:
    if expected_size < 4_000_000:
        return False
    curl_bin = "curl.exe" if sys.platform == "win32" else "curl"
    segment_size = (expected_size + num_workers - 1) // num_workers
    tasks = []
    part_files = []
    for i in range(num_workers):
        start = i * segment_size
        end = min(expected_size - 1, (i + 1) * segment_size - 1)
        part_file = target.parent / f"{target.stem}.part_{i}"
        part_files.append(part_file)
        tasks.append((i, start, end, part_file))

    stop_event = False

    def fetch_range(worker_id: int, start: int, end: int, part_path: Path) -> bool:
        nonlocal stop_event
        expected_len = end - start + 1
        for retry in range(1, 6):
            if stop_event:
                return False
            cmd = [
                curl_bin,
                "-L",
                "--silent",
                "--show-error",
                "-r", f"{start}-{end}",
                "-A", USER_AGENT,
                "-e", "https://moeys.gov.kh/",
                "-H", "Accept: application/pdf,*/*",
                "-H", "Accept-Language: en-US,en;q=0.9,km;q=0.8",
                "--connect-timeout", "20",
                "--speed-limit", "1024",
                "--speed-time", "15",
                url,
                "-o", str(part_path),
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            sz = part_path.stat().st_size if part_path.exists() else 0
            if res.returncode == 0 and sz == expected_len:
                return True
            print(f"        [worker {worker_id}] retry {retry}: size={sz:,}/{expected_len:,}, code={res.returncode}, stderr={res.stderr.strip()!r}", flush=True)
            time.sleep(1)
        stop_event = True
        return False

    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        futures = [executor.submit(fetch_range, w_id, s, e, p) for w_id, s, e, p in tasks]
        while any(not f.done() for f in futures):
            time.sleep(2)
            done_bytes = sum(p.stat().st_size for p in part_files if p.exists())
            pct = (done_bytes / expected_size * 100) if expected_size > 0 else 0
            elapsed = time.time() - t0
            spd = (done_bytes / 1024) / max(0.001, elapsed)
            print(f"        parallel downloading: {done_bytes:,}/{expected_size:,} bytes ({pct:.1f}%) @ {spd:.1f} KB/s", flush=True)

    if stop_event or not all(f.result() for f in futures):
        for p in part_files:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass
        return False

    try:
        with target.open("wb") as out_f:
            for p in part_files:
                with p.open("rb") as in_f:
                    while True:
                        chunk = in_f.read(1024 * 1024)
                        if not chunk:
                            break
                        out_f.write(chunk)
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception as e:
        print(f"    error stitching parts: {e}", flush=True)
        for p in part_files:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass
        return False

    try:
        with target.open("rb") as f:
            if f.read(4) != b"%PDF":
                print(f"    parallel download finished but file does not start with %PDF", flush=True)
                return False
        doc = pymupdf.open(target)
        if doc.page_count < 1:
            doc.close()
            return False
        doc.close()
        return True
    except Exception as err:
        print(f"    parallel PDF validation error: {err}", flush=True)
        return False


def download_pdf(url: str, target: Path, expected_size: int) -> None:
    parsed = urlparse(url)
    allowed_hosts = {"moeys.gov.kh", "file.go.gov.kh", "drive.usercontent.google.com"}
    hostname = parsed.hostname or ""
    if parsed.scheme != "https" or not any(hostname == host or hostname.endswith(f".{host}") for host in allowed_hosts):
        raise RuntimeError(f"Refusing an unapproved archive PDF host: {parsed.hostname or 'invalid URL'}")
    target.parent.mkdir(parents=True, exist_ok=True)

    if expected_size < 100_000:
        expected_size = 0

    if not expected_size:
        expected_size = head_size(url)

    if target.exists():
        is_valid_pdf = False
        try:
            with target.open("rb") as check_f:
                if check_f.read(4) == b"%PDF":
                    is_valid_pdf = True
        except Exception:
            is_valid_pdf = False

        if not is_valid_pdf or (expected_size >= 100_000 and target.stat().st_size > expected_size):
            print(f"    removing invalid/corrupted staging PDF file: {target.name}", flush=True)
            target.unlink()

    # Fast path: multi-worker parallel range download for large files (>= 4MB)
    if expected_size >= 4_000_000 and (not target.exists() or target.stat().st_size != expected_size):
        print(f"    starting multi-threaded range download ({expected_size:,} bytes)...", flush=True)
        if target.exists():
            target.unlink()
        if download_parallel_segments(url, target, expected_size, num_workers=6):
            print(f"    parallel download completed successfully ({expected_size:,} bytes).", flush=True)
            return
        else:
            print("    parallel download interrupted or unsupported, falling back to sequential resume...", flush=True)
            if target.exists():
                target.unlink()

    curl_bin = "curl.exe" if sys.platform == "win32" else "curl"
    has_curl = False
    try:
        test_run = subprocess.run([curl_bin, "--version"], capture_output=True, check=False)
        has_curl = (test_run.returncode == 0)
    except Exception:
        has_curl = False

    for attempt in range(1, 50):
        current = target.stat().st_size if target.exists() else 0
        if expected_size >= 100_000 and current == expected_size:
            try:
                with target.open("rb") as check_f:
                    if check_f.read(4) == b"%PDF":
                        doc = pymupdf.open(target)
                        if doc.page_count >= 1:
                            doc.close()
                            return
                        doc.close()
            except Exception:
                pass
            target.unlink()
            current = 0

        if expected_size >= 100_000 and current > expected_size:
            target.unlink()
            current = 0

        print(f"    transfer attempt {attempt}, existing {current:,}/{expected_size:,} bytes", flush=True)

        if has_curl:
            cmd = [
                curl_bin,
                "-L",
                "--silent",
                "--show-error",
                "-C", "-",
                "-A", USER_AGENT,
                "-e", "https://moeys.gov.kh/",
                "-H", "Accept: application/pdf,text/html,application/xhtml+xml,*/*",
                "-H", "Accept-Language: en-US,en;q=0.9,km;q=0.8",
                "--connect-timeout", "20",
                "--speed-limit", "1024",
                "--speed-time", "15",
                url,
                "-o", str(target),
            ]
            proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            last_size = current
            last_change = time.time()
            while proc.poll() is None:
                time.sleep(3)
                now_size = target.stat().st_size if target.exists() else 0
                if now_size != last_size:
                    last_size = now_size
                    last_change = time.time()
                    pct = (now_size / expected_size * 100) if expected_size > 0 else 0
                    print(f"        downloading: {now_size:,}/{expected_size:,} bytes ({pct:.1f}%)", flush=True)
                elif time.time() - last_change > 25:
                    print("        transfer stalled, restarting attempt...", flush=True)
                    proc.kill()
                    break
            stderr = proc.stderr.read() if proc.stderr else ""
            if stderr and "transfer closed" not in stderr and "curl: (18)" not in stderr:
                print(f"    curl log: {stderr.strip()}", flush=True)
        else:
            req = urllib.request.Request(url, headers=BROWSER_HEADERS)
            if current > 0:
                req.add_header("Range", f"bytes={current}-")

            try:
                with urllib.request.urlopen(req, timeout=45) as response:
                    if response.status == 200:
                        mode = "wb"
                        if current > 0:
                            current = 0
                        cl = int(response.headers.get("Content-Length") or 0)
                        if cl >= 100_000 and (expected_size == 0 or expected_size < 100_000):
                            expected_size = cl
                    elif response.status == 206:
                        mode = "ab"
                        cr = response.headers.get("Content-Range") or ""
                        match = re.search(r"/(\d+)$", cr)
                        if match:
                            total_sz = int(match.group(1))
                            if total_sz >= 100_000 and (expected_size == 0 or expected_size < 100_000):
                                expected_size = total_sz
                    else:
                        mode = "wb"
                        current = 0

                    last_logged = current
                    with target.open(mode) as f:
                        while True:
                            try:
                                chunk = response.read(1024 * 512)
                                if not chunk:
                                    break
                                f.write(chunk)
                                now_sz = target.stat().st_size if target.exists() else 0
                                if now_sz - last_logged >= 2 * 1024 * 1024:
                                    last_logged = now_sz
                                    pct = (now_sz / expected_size * 100) if expected_size > 0 else 0
                                    print(f"        downloading: {now_sz:,}/{expected_size:,} bytes ({pct:.1f}%)", flush=True)
                            except (http.client.IncompleteRead, urllib.error.URLError, TimeoutError) as chunk_err:
                                if hasattr(chunk_err, "partial") and chunk_err.partial:
                                    f.write(chunk_err.partial)
                                print(f"    chunk interrupted: {chunk_err}", flush=True)
                                break
            except Exception as error:
                print(f"    transfer interrupted: {error}", flush=True)

        size = target.stat().st_size if target.exists() else 0
        if size == 0:
            time.sleep(min(attempt * 2, 10))
            continue

        is_valid_pdf = False
        sample = b""
        try:
            with target.open("rb") as check_f:
                magic = check_f.read(4)
                if magic == b"%PDF":
                    is_valid_pdf = True
                else:
                    check_f.seek(0)
                    sample = check_f.read(150)
        except Exception:
            is_valid_pdf = False

        if not is_valid_pdf:
            print(f"    downloaded non-PDF content for {url} (sample: {sample!r}), removing target", flush=True)
            target.unlink()
            time.sleep(min(attempt * 2, 10))
            continue

        if expected_size >= 100_000 and size == expected_size:
            try:
                doc = pymupdf.open(target)
                if doc.page_count >= 1:
                    doc.close()
                    return
                doc.close()
            except Exception:
                pass

        if size >= 100_000:
            try:
                doc = pymupdf.open(target)
                if doc.page_count >= 1 and not doc.is_repaired:
                    with target.open("rb") as check_f:
                        check_f.seek(max(0, size - 1024))
                        tail = check_f.read()
                        if b"%%EOF" in tail:
                            doc.close()
                            return
                doc.close()
            except Exception:
                pass

        time.sleep(min(attempt * 2, 10))

    raise RuntimeError(f"Incomplete download for {url}: {target.stat().st_size if target.exists() else 0}/{expected_size}")


def cell(words: list[tuple], start: float, end: float) -> str:
    selected = [word for word in words if start <= word[0] < end]
    selected.sort(key=lambda word: (round(word[1], 1), word[0]))
    return " ".join(word[4].strip() for word in selected if word[4].strip()).strip()


def normalized_page_words(page: pymupdf.Page) -> list[tuple]:
    """Return word boxes in the visible page coordinate system.

    The 2023 archive stores landscape tables as portrait pages rotated 90
    degrees, while newer archives store landscape coordinates directly.
    Normalizing rotated boxes lets the same column parser validate both.
    """
    words = page.get_text("words", sort=False)
    if not page.rotation:
        return words
    normalized = []
    for word in words:
        box = pymupdf.Rect(*word[:4]) * page.rotation_matrix
        normalized.append((box.x0, box.y0, box.x1, box.y1, *word[4:]))
    return normalized


def page_context(words: list[tuple]) -> tuple[str, str, list[str]]:
    table_numbers = [
        word for word in words
        if 45 <= word[0] < 80 and 40 <= word[1] < 565 and re.fullmatch(r"\d{1,4}", word[4].strip())
    ]
    first_row_y = min((float(word[1]) for word in table_numbers), default=75.0)
    # The first page of a result section includes a title and shifts the table
    # down by about 25 points. Anchor both header bands to the first actual row
    # so continuation pages are indexed with the same accuracy.
    heading = [word for word in words if first_row_y - 42 <= word[1] <= first_row_y - 18]
    center = cell(heading, 548, 675)
    track = cell(heading, 690, 750)
    header = [word for word in words if first_row_y - 20 <= word[1] < first_row_y]
    slots = [
        cell(header, 350, 390), cell(header, 390, 430), cell(header, 430, 470),
        cell(header, 470, 515), cell(header, 515, 558), cell(header, 558, 598),
        cell(header, 598, 640),
    ]
    return center, track, slots


def page_rows(words: list[tuple]) -> list[dict]:
    blocks: dict[int, list[tuple]] = {}
    for word in words:
        blocks.setdefault(int(word[5]), []).append(word)
    rows: list[dict] = []
    for block_words in blocks.values():
        table_words = [
            word for word in block_words
            if 45 <= word[0] < 80 and 45 <= word[1] < 565 and re.fullmatch(r"\d{1,4}", word[4].strip())
        ]
        if len(table_words) != 1:
            continue
        row = {
            "table_number": int(table_words[0][4]),
            "name_raw": cell(block_words, 80, 175),
            "gender_raw": cell(block_words, 175, 190),
            "school_raw": cell(block_words, 190, 300),
            "birth_date_raw": cell(block_words, 300, 350),
            "subject_1": cell(block_words, 350, 390),
            "subject_2": cell(block_words, 390, 430),
            "subject_3": cell(block_words, 430, 470),
            "subject_4": cell(block_words, 470, 515),
            "subject_5": cell(block_words, 515, 558),
            "subject_6": cell(block_words, 558, 598),
            "subject_7": cell(block_words, 598, 640),
            "result_raw": cell(block_words, 640, 690),
            "grade_raw": cell(block_words, 690, 735),
            "notes_raw": cell(block_words, 735, 842),
        }
        row["row_text_raw"] = " | ".join(str(value) for value in row.values())
        rows.append(row)
    return rows


def create_schema(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS archive_info (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
          id INTEGER PRIMARY KEY,
          ordinal INTEGER NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          province TEXT NOT NULL,
          title TEXT NOT NULL,
          source_page_url TEXT NOT NULL,
          pdf_url TEXT NOT NULL,
          local_path TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          page_count INTEGER NOT NULL,
          downloaded_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pages (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL REFERENCES documents(id),
          page_number INTEGER NOT NULL,
          exam_center_raw TEXT,
          track_raw TEXT,
          subject_headers_json TEXT NOT NULL,
          text_raw TEXT NOT NULL,
          UNIQUE(document_id, page_number)
        );
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY,
          document_id INTEGER NOT NULL REFERENCES documents(id),
          page_id INTEGER NOT NULL REFERENCES pages(id),
          page_number INTEGER NOT NULL,
          province TEXT NOT NULL,
          exam_center_raw TEXT,
          track_raw TEXT,
          table_number INTEGER NOT NULL,
          name_raw TEXT,
          gender_raw TEXT,
          school_raw TEXT,
          birth_date_raw TEXT,
          subject_headers_json TEXT NOT NULL,
          subject_1 TEXT, subject_2 TEXT, subject_3 TEXT, subject_4 TEXT,
          subject_5 TEXT, subject_6 TEXT, subject_7 TEXT,
          result_raw TEXT, grade_raw TEXT, notes_raw TEXT,
          row_text_raw TEXT NOT NULL,
          UNIQUE(document_id, page_number, table_number)
        );
        CREATE INDEX IF NOT EXISTS students_lookup
          ON students(province, exam_center_raw, track_raw, table_number);
        CREATE INDEX IF NOT EXISTS students_table_number ON students(table_number);
        """
    )


def write_csv(db: sqlite3.Connection, target: Path) -> None:
    columns = [description[1] for description in db.execute("PRAGMA table_info(students)")]
    with target.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(columns)
        writer.writerows(db.execute(f"SELECT {','.join(columns)} FROM students ORDER BY document_id,page_number,table_number"))


def printed_passing_total(document: pymupdf.Document) -> int:
    """Read the passing-candidate total from the official final summary page.

    The summary has four visual columns: all candidates, female candidates,
    passing candidates, and passing female candidates. Some older PDFs render
    an overflowing value as ``#####``, so selecting the third numeric token is
    unsafe: in Phnom Penh 2023 it selected the passing-female subtotal. Locate
    the passing-total column geometrically instead, after normalizing rotated
    2023 page coordinates.
    """
    page = document[-1]
    width, height = page.rect.width, page.rect.height
    candidates = [
        int(word[4])
        for word in normalized_page_words(page)
        if width * 0.55 <= float(word[0]) < width * 0.82
        and float(word[1]) < height * 0.25
        and re.fullmatch(r"\d{3,6}", str(word[4]).strip())
    ]
    if len(candidates) != 1:
        fallback = [
            int(word[4])
            for word in normalized_page_words(page)
            if width * 0.45 <= float(word[0]) < width * 0.88
            and float(word[1]) < height * 0.35
            and re.fullmatch(r"\d{3,6}", str(word[4]).strip())
        ]
        if len(fallback) == 1:
            return fallback[0]
        raise RuntimeError(
            "Could not uniquely read the official passing total from the final PDF page "
            f"(found {candidates}, fallback {fallback})."
        )
    return candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-dir", type=Path, default=Path("data/bacii-2026"))
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--post-url", default=POST_URL)
    parser.add_argument(
        "--manifest-input",
        type=Path,
        help="Download and index documents described by an admin-generated JSON manifest.",
    )
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument(
        "--reindex-only",
        action="store_true",
        help="Rebuild SQLite and CSV from the existing manifest and PDFs without network requests.",
    )
    args = parser.parse_args()
    root = args.archive_dir.resolve()
    pdf_dir = root / "pdfs"
    root.mkdir(parents=True, exist_ok=True)

    manifest_path = root / "manifest.json"
    if args.manifest_input:
        seed_manifest = json.loads(args.manifest_input.read_text(encoding="utf-8"))
        if len(seed_manifest) != len(PROVINCES):
            raise RuntimeError(f"Expected {len(PROVINCES)} archive documents, found {len(seed_manifest)}.")
        manifest = []
        for ordinal, seed in enumerate(seed_manifest, 1):
            slug = str(seed["slug"])
            province = str(seed["province"])
            pdf_url = str(seed["pdf_url"])
            print(f"[{ordinal:02d}/25] {slug}: downloading official PDF", flush=True)
            expected_size = head_size(pdf_url)
            target = pdf_dir / f"{ordinal:02d}-{slug}.pdf"
            download_pdf(pdf_url, target, expected_size)
            document = pymupdf.open(target)
            item = {
                "ordinal": ordinal,
                "document_id": int(seed["document_id"]),
                "slug": slug,
                "province": province,
                "title": str(seed["title"]),
                "source_page_url": str(seed["source_page_url"]),
                "pdf_url": pdf_url,
                "local_path": target.relative_to(root).as_posix(),
                "byte_size": target.stat().st_size,
                "sha256": sha256_file(target),
                "page_count": document.page_count,
                "downloaded_at": datetime.now(timezone.utc).isoformat(),
            }
            document.close()
            manifest.append(item)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Downloaded {len(manifest)} PDFs ({sum(item['byte_size'] for item in manifest):,} bytes).", flush=True)
    elif args.reindex_only:
        if not manifest_path.exists():
            raise RuntimeError(f"Archive manifest not found: {manifest_path}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if len(manifest) != len(PROVINCES):
            raise RuntimeError(f"Expected {len(PROVINCES)} archive documents, found {len(manifest)}.")
        for item in manifest:
            pdf = root / item["local_path"]
            if not pdf.exists() or sha256_file(pdf) != item["sha256"]:
                raise RuntimeError(f"Missing or changed archive PDF: {pdf}")
        print(f"Using {len(manifest)} verified local PDFs.", flush=True)
    else:
        manifest = []
        for ordinal, (slug, province) in enumerate(PROVINCES, 1):
            print(f"[{ordinal:02d}/25] {slug}: reading official metadata", flush=True)
            payload = fetch_json(API_TEMPLATE.format(slug=slug))
            detail = payload["documentDetail"]
            relative_pdf = detail["document_file"]["kh"]
            pdf_url = urljoin(BASE_URL, relative_pdf)
            expected_size = head_size(pdf_url)
            target = pdf_dir / f"{ordinal:02d}-{slug}.pdf"
            print(f"    downloading {expected_size:,} bytes -> {target}", flush=True)
            download_pdf(pdf_url, target, expected_size)
            document = pymupdf.open(target)
            item = {
                "ordinal": ordinal,
                "document_id": int(detail["id"]),
                "slug": slug,
                "province": province,
                "title": detail["title"],
                "source_page_url": BASE_URL + f"bacii/{slug}",
                "pdf_url": pdf_url,
                "local_path": target.relative_to(root).as_posix(),
                "byte_size": target.stat().st_size,
                "sha256": sha256_file(target),
                "page_count": document.page_count,
                "downloaded_at": datetime.now(timezone.utc).isoformat(),
            }
            document.close()
            manifest.append(item)
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"Downloaded {len(manifest)} PDFs ({sum(item['byte_size'] for item in manifest):,} bytes).", flush=True)
    if args.download_only:
        return

    db_path = root / f"bacii-{args.year}.sqlite"
    db = sqlite3.connect(db_path)
    create_schema(db)
    db.execute("DELETE FROM students")
    db.execute("DELETE FROM pages")
    db.execute("DELETE FROM documents")
    db.execute("INSERT OR REPLACE INTO archive_info VALUES (?,?)", ("source_post_url", args.post_url))
    db.execute("INSERT OR REPLACE INTO archive_info VALUES (?,?)", ("exam_year", str(args.year)))
    db.execute("INSERT OR REPLACE INTO archive_info VALUES (?,?)", ("scope", "Passing candidates published by MOEYS"))
    db.execute("INSERT OR REPLACE INTO archive_info VALUES (?,?)", ("text_quality", "Raw PDF text; Khmer shaping may be imperfect"))

    student_columns = [
        "document_id", "page_id", "page_number", "province", "exam_center_raw", "track_raw",
        "table_number", "name_raw", "gender_raw", "school_raw", "birth_date_raw",
        "subject_headers_json", "subject_1", "subject_2", "subject_3", "subject_4",
        "subject_5", "subject_6", "subject_7", "result_raw", "grade_raw", "notes_raw", "row_text_raw",
    ]
    placeholders = ",".join("?" for _ in student_columns)

    for item in manifest:
        print(f"Indexing {item['ordinal']:02d}/25 {item['slug']} ({item['page_count']} pages)", flush=True)
        cursor = db.execute(
            """INSERT INTO documents
            (id,ordinal,slug,province,title,source_page_url,pdf_url,local_path,byte_size,sha256,page_count,downloaded_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                item["document_id"], item["ordinal"], item["slug"], item["province"], item["title"],
                item["source_page_url"], item["pdf_url"], item["local_path"], item["byte_size"],
                item["sha256"], item["page_count"], item["downloaded_at"],
            ),
        )
        del cursor
        document = pymupdf.open(root / item["local_path"])
        official_total = printed_passing_total(document)
        indexed = 0
        for page_index, page in enumerate(document):
            words = normalized_page_words(page)
            center, track, headers = page_context(words)
            text_raw = page.get_text("text", sort=True)
            page_cursor = db.execute(
                """INSERT INTO pages
                (document_id,page_number,exam_center_raw,track_raw,subject_headers_json,text_raw)
                VALUES (?,?,?,?,?,?)""",
                (item["document_id"], page_index + 1, center, track, json.dumps(headers, ensure_ascii=False), text_raw),
            )
            page_id = page_cursor.lastrowid
            for row in page_rows(words):
                values = [
                    item["document_id"], page_id, page_index + 1, item["province"], center, track,
                    row["table_number"], row["name_raw"], row["gender_raw"], row["school_raw"],
                    row["birth_date_raw"], json.dumps(headers, ensure_ascii=False),
                    *[row[f"subject_{slot}"] for slot in range(1, 8)],
                    row["result_raw"], row["grade_raw"], row["notes_raw"], row["row_text_raw"],
                ]
                db.execute(
                    f"INSERT INTO students ({','.join(student_columns)}) VALUES ({placeholders})",
                    values,
                )
                indexed += 1
            if (page_index + 1) % 50 == 0:
                db.commit()
                print(f"    {page_index + 1}/{document.page_count} pages, {indexed:,} student rows", flush=True)
        document.close()
        if indexed != official_total:
            raise RuntimeError(
                f"{item['slug']} validation failed: indexed {indexed:,}, official PDF says {official_total:,}."
            )
        db.commit()
        print(f"    complete: {indexed:,} student rows (matches official PDF)", flush=True)

    grade_totals = {
        str(grade): int(count)
        for grade, count in db.execute("SELECT grade_raw, COUNT(*) FROM students GROUP BY grade_raw")
    }
    student_total = int(db.execute("SELECT COUNT(*) FROM students").fetchone()[0])
    if not set(grade_totals).issubset({"A", "B", "C", "D", "E"}) or sum(grade_totals.values()) != student_total:
        raise RuntimeError(f"Grade validation failed: indexed {grade_totals} for {student_total:,} students.")
    if args.year == 2026 and grade_totals != OFFICIAL_GRADE_TOTALS:
        raise RuntimeError(
            f"Official grade validation failed: indexed {grade_totals}, expected {OFFICIAL_GRADE_TOTALS}."
        )
    if args.year == 2026:
        print(f"Grade totals match the official national summary: {grade_totals}", flush=True)
    else:
        print(f"Indexed national grade totals: {grade_totals}", flush=True)

    write_csv(db, root / "students.csv")
    stats = {
        "documents": db.execute("SELECT COUNT(*) FROM documents").fetchone()[0],
        "pages": db.execute("SELECT COUNT(*) FROM pages").fetchone()[0],
        "students": db.execute("SELECT COUNT(*) FROM students").fetchone()[0],
        "archive_bytes": sum(item["byte_size"] for item in manifest),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    (root / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    db.commit()
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    db.execute("PRAGMA journal_mode=DELETE")
    db.close()
    print(json.dumps(stats, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
