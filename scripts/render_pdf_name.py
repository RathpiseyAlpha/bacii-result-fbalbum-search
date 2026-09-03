#!/usr/bin/env python3
"""Render one student's name cell from an official BacII PDF."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw
from archive_bacii_2026 import normalized_page_words


def find_row(words: list[tuple], table_number: str) -> list[tuple]:
    matches = [
        word for word in words
        if 45 <= word[0] < 80
        and 45 <= word[1] < 565
        and re.fullmatch(r"\d{1,6}", word[4].strip())
        and str(int(word[4].strip())) == str(int(table_number))
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one row for table {table_number}, found {len(matches)}.")
    block_number = int(matches[0][5])
    row = [word for word in words if int(word[5]) == block_number]
    if not row:
        raise RuntimeError("The matching result row is empty.")
    return row


def longest_run(values) -> int:
    longest = current = 0
    for value in values:
        if value:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--page", type=int, required=True, help="One-based PDF page number")
    parser.add_argument("--table-number", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=4.0)
    args = parser.parse_args()

    if args.page < 1 or args.scale < 1 or args.scale > 6:
        raise SystemExit("Invalid page or render scale.")
    document = pymupdf.open(args.pdf)
    try:
        if args.page > document.page_count:
            raise RuntimeError("PDF page is out of range.")
        page = document[args.page - 1]
        row = find_row(normalized_page_words(page), args.table_number)
        name_words = [word for word in row if 80 <= word[0] < 175 and word[4].strip()]
        if not name_words:
            raise RuntimeError("The matching row has no name text.")
        y0 = max(0, min(word[1] for word in name_words) - 2.5)
        y1 = min(page.rect.height, max(word[3] for word in name_words) + 2.5)
        # The official PDFs use a stable table: x=80..175 is the student-name column.
        clip = pymupdf.Rect(81, y0, 174, y1)
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(args.scale, args.scale), clip=clip, alpha=False)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_name(f"{args.output.stem}.tmp{args.output.suffix}")
        pixmap.save(temporary)
        # Table rules sometimes land on the crop edge. Mask only the padded rim,
        # leaving the source glyph pixels untouched.
        with Image.open(temporary) as source:
            image = source.convert("RGB")
            draw = ImageDraw.Draw(image)
            edge = max(2, round(args.scale))
            draw.rectangle((0, 0, image.width, edge - 1), fill="white")
            draw.rectangle((0, image.height - edge, image.width, image.height), fill="white")
            draw.rectangle((0, 0, edge - 1, image.height), fill="white")
            draw.rectangle((image.width - edge, 0, image.width, image.height), fill="white")
            grayscale = image.convert("L")
            pixels = grayscale.load()
            horizontal_rules = [
                y for y in range(image.height)
                if longest_run(pixels[x, y] < 235 for x in range(image.width)) > image.width * .65
            ]
            vertical_rules = [
                x for x in range(image.width)
                if longest_run(pixels[x, y] < 235 for y in range(image.height)) > image.height * .65
            ]
            for y in horizontal_rules:
                draw.line((0, y, image.width, y), fill="white")
            for x in vertical_rules:
                draw.line((x, 0, x, image.height), fill="white")
            image.save(temporary, format="PNG", optimize=True)
        temporary.replace(args.output)
    finally:
        document.close()


if __name__ == "__main__":
    main()
