#!/usr/bin/env python3
"""Run high-accuracy Khmer OCR on BacII student name cell crops."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ocr"))
sys.path.insert(0, str(ROOT / "scripts"))

from worker import KhmerRecognizer  # noqa: E402
from archive_bacii_2026 import normalized_page_words  # noqa: E402
from render_pdf_name import find_row  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def crop_name_cell(page: pymupdf.Page, table_number: str, scale: float = 3.0) -> Image.Image | None:
    words = normalized_page_words(page)
    try:
        row = find_row(words, str(table_number))
    except Exception:
        return None

    name_words = [word for word in row if 80 <= word[0] < 175 and word[4].strip()]
    if not name_words:
        return None

    y0 = max(0, min(word[1] for word in name_words) - 2.0)
    y1 = min(page.rect.height, max(word[3] for word in name_words) + 2.0)
    x0 = max(80, min(word[0] for word in name_words) - 1.5)
    x1 = min(172, max(word[2] for word in name_words) + 1.5)
    clip = pymupdf.Rect(x0, y0, x1, y1)

    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, alpha=False)
    image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)

    # Clean borders
    draw = ImageDraw.Draw(image)
    edge = max(2, round(scale))
    draw.rectangle((0, 0, image.width, edge - 1), fill="white")
    draw.rectangle((0, image.height - edge, image.width, image.height), fill="white")
    draw.rectangle((0, 0, edge - 1, image.height), fill="white")
    draw.rectangle((image.width - edge, 0, image.width, image.height), fill="white")

    # Crop tightly to text bounding box
    clean_gray = image.convert("L")
    text_mask = clean_gray.point(lambda p: 255 if p < 240 else 0, mode="1")
    bbox = text_mask.getbbox()
    if bbox and bbox[2] > bbox[0] and bbox[3] > bbox[1]:
        pad_x = round(scale * 3.0)
        text_width = bbox[2] - bbox[0]
        text_mid = (bbox[0] + bbox[2]) / 2.0
        half_w = (text_width / 2.0) + pad_x
        crop_x0 = max(0, int(round(text_mid - half_w)))
        actual_left_pad = bbox[0] - crop_x0
        crop_x1 = min(image.width, bbox[2] + actual_left_pad)
        image = image.crop((crop_x0, 0, crop_x1, image.height))

    return image


def main() -> None:
    parser = argparse.ArgumentParser(description="Khmer OCR on student names")
    parser.add_argument("--pdf", type=Path, help="Path to BacII PDF file")
    parser.add_argument("--page", type=int, help="1-based page number")
    parser.add_argument("--table-number", help="Student table number")
    parser.add_argument("--image", type=Path, help="Direct path to pre-cropped name image")
    parser.add_argument("--manifest", type=Path, help="Batch JSON manifest with list of items")
    parser.add_argument("--scale", type=float, default=3.0)
    parser.add_argument("--beam-width", type=int, default=2)
    parser.add_argument("--test", action="store_true", help="Run test check")

    args = parser.parse_args()

    recognizer = KhmerRecognizer()

    if args.test:
        print(json.dumps({"ok": True, "model": "Darayut/khmer-text-recognition"}, ensure_ascii=False))
        return

    # Direct image OCR
    if args.image:
        if not args.image.exists():
            print(json.dumps({"error": f"Image file not found: {args.image}"}), file=sys.stderr)
            sys.exit(1)
        with Image.open(args.image) as img:
            ocr_name = recognizer.predict(img.convert("RGB"), beam_width=args.beam_width)
        print(json.dumps({"ocrName": ocr_name}, ensure_ascii=False))
        return

    # Single student PDF cell OCR
    if args.pdf and args.page and args.table_number:
        if not args.pdf.exists():
            print(json.dumps({"error": f"PDF file not found: {args.pdf}"}), file=sys.stderr)
            sys.exit(1)
        doc = pymupdf.open(args.pdf)
        try:
            if args.page > doc.page_count:
                print(json.dumps({"error": "Page out of range"}), file=sys.stderr)
                sys.exit(1)
            page = doc[args.page - 1]
            img = crop_name_cell(page, args.table_number, scale=args.scale)
            if img is None:
                print(json.dumps({"error": "Could not extract name crop"}), file=sys.stderr)
                sys.exit(1)
            ocr_name = recognizer.predict(img, beam_width=args.beam_width)
            print(json.dumps({"tableNumber": args.table_number, "ocrName": ocr_name}, ensure_ascii=False))
        finally:
            doc.close()
        return

    # Batch manifest OCR
    if args.manifest:
        if not args.manifest.exists():
            print(json.dumps({"error": f"Manifest not found: {args.manifest}"}), file=sys.stderr)
            sys.exit(1)
        with args.manifest.open("r", encoding="utf-8") as f:
            items = json.load(f)

        results = []
        open_docs: dict[str, pymupdf.Document] = {}

        try:
            for item in items:
                student_id = item.get("id")
                pdf_str = item.get("pdf")
                page_num = item.get("page")
                table_num = item.get("tableNumber")
                image_path = item.get("imagePath")

                ocr_name = ""
                status = "ok"

                try:
                    # Option A: pre-rendered crop image exists
                    if image_path and Path(image_path).exists():
                        with Image.open(image_path) as img:
                            ocr_name = recognizer.predict(img.convert("RGB"), beam_width=args.beam_width)
                    # Option B: extract from PDF
                    elif pdf_str and page_num and table_num:
                        pdf_path = Path(pdf_str)
                        if pdf_str not in open_docs and pdf_path.exists():
                            open_docs[pdf_str] = pymupdf.open(pdf_path)
                        doc = open_docs.get(pdf_str)
                        if doc and 1 <= page_num <= doc.page_count:
                            page = doc[page_num - 1]
                            img = crop_name_cell(page, str(table_num), scale=args.scale)
                            if img:
                                ocr_name = recognizer.predict(img, beam_width=args.beam_width)
                            else:
                                status = "crop_failed"
                        else:
                            status = "invalid_page_or_doc"
                    else:
                        status = "missing_input"
                except Exception as ex:
                    status = f"error: {ex}"

                results.append({
                    "id": student_id,
                    "tableNumber": table_num,
                    "ocrName": ocr_name,
                    "status": status,
                })
        finally:
            for doc in open_docs.values():
                doc.close()

        print(json.dumps({"results": results}, ensure_ascii=False))
        return

    parser.print_help(file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
