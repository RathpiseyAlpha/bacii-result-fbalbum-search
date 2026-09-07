#!/usr/bin/env python3
"""Render a single page from an official BacII PDF as an image, with optional DoB column privacy masking."""
from __future__ import annotations

import argparse
from pathlib import Path
import pymupdf


def mask_dob_column(page: pymupdf.Page) -> bool:
    """Mask the Date of Birth column data while preserving the table structure, headers, and grid lines."""
    drawings = page.get_drawings()
    rects = [d["rect"] for d in drawings if d.get("rect") and d["rect"].width < 3]
    v297 = [r for r in rects if 295 <= r.x0 <= 300]
    v351 = [r for r in rects if 349 <= r.x0 <= 354]
    if not (v297 and v351):
        return False

    min_x = min(r.x1 for r in v297)
    max_x = max(r.x0 for r in v351)
    max_y = max(r.y1 for r in v297 + v351)

    h_rects = [d["rect"] for d in drawings if d.get("rect") and d["rect"].height < 3 and 290 <= d["rect"].x0 <= 360]
    y_lines = sorted(set(round(r.y0, 1) for r in h_rects))
    if len(y_lines) < 2:
        return False

    # y_lines[0] is the top of the header, y_lines[1] is the bottom of the header / start of student rows
    row1_top = y_lines[1]

    # Fill the data column with clean off-white background matching the table
    page.draw_rect(pymupdf.Rect(min_x, row1_top, max_x, max_y), color=None, fill=(0.97, 0.97, 0.98))

    # Redraw the horizontal row grid dividers so the table layout remains seamless
    for y in y_lines[1:]:
        page.draw_line(pymupdf.Point(min_x, y), pymupdf.Point(max_x, y), color=(0.7, 0.7, 0.75), width=0.5)

    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--page", type=int, required=True, help="One-based PDF page number")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--hide-dob", action="store_true", help="Mask the Date of Birth column for privacy")
    args = parser.parse_args()

    if args.page < 1:
        raise SystemExit("Invalid page number.")
    doc = pymupdf.open(args.pdf)
    if args.page > doc.page_count:
        raise SystemExit(f"Page {args.page} out of range (1-{doc.page_count}).")
    page = doc[args.page - 1]

    if args.hide_dob:
        mask_dob_column(page)

    pix = page.get_pixmap(dpi=args.dpi)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(args.output))


if __name__ == "__main__":
    main()

