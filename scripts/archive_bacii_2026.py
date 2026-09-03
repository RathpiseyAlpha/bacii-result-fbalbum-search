#!/usr/bin/env python3
"""Download and index the official MOEYS BacII 2026 result PDFs.

The generated archive is intentionally kept under data/bacii-2026, which is
git-ignored because it contains large public result documents and student data.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import time
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
OFFICIAL_GRADE_TOTALS = {"A": 2022, "B": 8848, "C": 23422, "D": 44869, "E": 46814}


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def head_size(url: str) -> int:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return int(response.headers.get("Content-Length") or 0)
    except Exception:
        return 0


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_pdf(url: str, target: Path, expected_size: int) -> None:
    parsed = urlparse(url)
    allowed_hosts = {"moeys.gov.kh", "file.go.gov.kh", "drive.usercontent.google.com"}
    hostname = parsed.hostname or ""
    if parsed.scheme != "https" or not any(hostname == host or hostname.endswith(f".{host}") for host in allowed_hosts):
        raise RuntimeError(f"Refusing an unapproved archive PDF host: {parsed.hostname or 'invalid URL'}")
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, 16):
        current = target.stat().st_size if target.exists() else 0
        if expected_size and current == expected_size:
            return
        if expected_size and current > expected_size:
            target.unlink()
        print(f"    transfer attempt {attempt}, existing {current:,} bytes", flush=True)
        result = subprocess.run(
            [
                "curl.exe" if sys.platform == "win32" else "curl",
                "-L", "--fail", "--silent", "--show-error", "--retry", "5",
                "--retry-all-errors", "--retry-delay", "2", "-C", "-",
                "-A", USER_AGENT, url, "-o", str(target),
            ],
            check=False,
        )
        size = target.stat().st_size if target.exists() else 0
        if result.returncode == 0 and (not expected_size or size == expected_size):
            return
        time.sleep(min(attempt * 2, 15))
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
        raise RuntimeError(
            "Could not uniquely read the official passing total from the final PDF page "
            f"(found {candidates})."
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
