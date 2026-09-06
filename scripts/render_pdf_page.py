#!/usr/bin/env python3
"""Render a single page from an official BacII PDF as an image."""
from __future__ import annotations

import argparse
from pathlib import Path
import pymupdf


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--page", type=int, required=True, help="One-based PDF page number")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()

    if args.page < 1:
        raise SystemExit("Invalid page number.")
    doc = pymupdf.open(args.pdf)
    if args.page > doc.page_count:
        raise SystemExit(f"Page {args.page} out of range (1-{doc.page_count}).")
    page = doc[args.page - 1]
    pix = page.get_pixmap(dpi=args.dpi)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(args.output))


if __name__ == "__main__":
    main()
