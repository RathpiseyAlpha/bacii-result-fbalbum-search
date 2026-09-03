#!/usr/bin/env python3
"""Build proper Unicode Khmer labels for BacII archive exam centers.

The PDF text layer uses a legacy/broken Khmer character map.  This utility
groups pages by their extracted center value, renders one representative
header crop per value, and runs the existing Khmer recognizer only once per
center.  Results are written incrementally so an interrupted CPU run resumes.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pymupdf
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ocr"))
from worker import MODEL_ID, MODEL_REVISION, KhmerRecognizer  # noqa: E402


def raw_center(text: str) -> str:
    """Recover the center field from either PDF text-stream ordering."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    marker_index = next((index for index, line in enumerate(lines[:8]) if ":" in line), None)
    if marker_index is None:
        return ""
    parts = lines[marker_index].split(":", 2)
    after_marker = parts[1].strip() if len(parts) > 1 else ""
    value = after_marker or (lines[marker_index - 1] if marker_index else "")
    # On first pages the class label follows the center after a wide gap.
    value = re.split(r"\s{2,}", value, maxsplit=1)[0].strip()
    # Province summary/footer pages contain a candidate total in the same text
    # stream position. It is not an exam center.
    if re.match(r"^\d", value) or "នាក់" in value:
        return ""
    return value


def representative_pages(database: sqlite3.Connection) -> dict[str, dict[str, object]]:
    pages: dict[str, dict[str, object]] = {}
    query = """
        SELECT p.text_raw, p.page_number, d.local_path, d.id AS document_id,
               d.province
        FROM pages p JOIN documents d ON d.id = p.document_id
        ORDER BY d.ordinal, p.page_number
    """
    for text, page_number, local_path, document_id, province in database.execute(query):
        center = raw_center(text or "")
        if center and center not in pages:
            pages[center] = {
                "pageNumber": int(page_number),
                "localPath": str(local_path),
                "documentId": int(document_id),
                "province": str(province),
            }
    return pages


def center_crop(pdf: Path, page_number: int, raw: str, scale: float) -> Image.Image:
    document = pymupdf.open(pdf)
    try:
        page = document[page_number - 1]
        width, height = page.rect.width, page.rect.height
        # The first result page has a report title, while continuation pages do
        # not, so their center headers have different vertical positions. Find
        # the text block instead of cropping a fixed y coordinate.
        header = next(
            (block for block in page.get_text("blocks") if raw in str(block[4]) and float(block[1]) < height * 0.15),
            None,
        )
        if header is None:
            header = next(
                (
                    block for block in page.get_text("blocks")
                    if float(block[1]) < height * 0.15
                    and ":" in str(block[4])
                    and len(str(block[4]).splitlines()) >= 4
                ),
                None,
            )
        if header is None:
            raise RuntimeError(f"could not locate center header on page {page_number}")
        y0, y1 = float(header[1]), float(header[3])
        # Horizontal placement is stable across the official result template:
        # begin after the printed "exam center:" label and stop before "class:".
        clip = pymupdf.Rect(width * 0.656, max(0, y0 - 2), width * 0.800, min(height, y1 + 2))
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        return ImageOps.expand(ImageOps.autocontrast(image.convert("L")), border=12, fill=255)
    finally:
        document.close()


def load_existing(path: Path, year: str) -> dict[str, object]:
    if path.exists():
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("year") == year and isinstance(value.get("centers"), dict):
            return value
    return {
        "schemaVersion": 1,
        "year": year,
        "model": MODEL_ID,
        "modelRevision": MODEL_REVISION,
        "centers": {},
    }


def save(path: Path, payload: dict[str, object]) -> None:
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", dir=path.parent, delete=False) as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        temporary = Path(file.name)
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ROOT / "data" / "bacii-2026")
    parser.add_argument("--year", default="2026")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--beam-width", type=int, default=3)
    parser.add_argument("--scale", type=float, default=6.0)
    parser.add_argument("--limit", type=int, default=0, help="OCR at most N new labels; zero means all")
    parser.add_argument("--write-crops", type=Path, help="Optional diagnostic crop directory")
    args = parser.parse_args()
    if not 1 <= args.beam_width <= 8 or not 2 <= args.scale <= 8:
        parser.error("beam width must be 1..8 and scale must be 2..8")

    archive = args.archive.resolve()
    database_path = archive / f"bacii-{args.year}.sqlite"
    output = (args.output or archive / "labels.json").resolve()
    if not database_path.exists():
        parser.error(f"archive database not found: {database_path}")

    database = sqlite3.connect(f"file:{database_path.as_posix()}?mode=ro", uri=True)
    try:
        representatives = representative_pages(database)
    finally:
        database.close()
    payload = load_existing(output, args.year)
    labels = payload["centers"]
    assert isinstance(labels, dict)
    # Drop obsolete keys produced by an older parser (for example province
    # footer totals that were once mistaken for center names).
    for stale in set(labels) - set(representatives):
        del labels[stale]
    pending = [
        (raw, item) for raw, item in representatives.items()
        if raw not in labels or (isinstance(labels.get(raw), dict) and labels[raw].get("error"))
    ]
    if args.limit:
        pending = pending[: args.limit]
    print(f"Found {len(representatives)} center keys; {len(pending)} queued.", file=sys.stderr)
    if not pending:
        save(output, payload)
        return 0

    recognizer = KhmerRecognizer()
    for index, (raw, source) in enumerate(pending, 1):
        pdf = archive / "pdfs" / Path(str(source["localPath"])).name
        try:
            crop = center_crop(pdf, int(source["pageNumber"]), raw, args.scale)
            if args.write_crops:
                args.write_crops.mkdir(parents=True, exist_ok=True)
                crop.save(args.write_crops / f"center-{source['documentId']}-{source['pageNumber']}.png")
            recognized = unicodedata.normalize(
                "NFC", recognizer.predict(crop, beam_width=args.beam_width, max_len=140)
            ).strip()
            if not recognized:
                raise RuntimeError("recognizer returned an empty label")
            labels[raw] = {
                "label": recognized,
                "province": source["province"],
                "documentId": source["documentId"],
                "pageNumber": source["pageNumber"],
            }
            print(f"[{index}/{len(pending)}] {raw!r} -> {recognized!r}", flush=True)
        except Exception as error:  # Keep the batch useful and retry failures next run.
            labels[raw] = {
                "error": str(error),
                "province": source["province"],
                "documentId": source["documentId"],
                "pageNumber": source["pageNumber"],
            }
            print(f"[{index}/{len(pending)}] {raw!r} FAILED: {error}", file=sys.stderr, flush=True)
        save(output, payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
