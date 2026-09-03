#!/usr/bin/env python3
"""Query the locally generated BacII 2026 archive."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("table_number", type=int)
    parser.add_argument("--province", help="Exact or partial province name")
    parser.add_argument("--center", help="Partial raw exam-center text")
    parser.add_argument("--track", help="Partial raw track text")
    parser.add_argument("--database", type=Path, default=Path("data/bacii-2026/bacii-2026.sqlite"))
    args = parser.parse_args()

    clauses = ["s.table_number = ?"]
    values: list[object] = [args.table_number]
    for column, value in (
        ("s.province", args.province),
        ("s.exam_center_raw", args.center),
        ("s.track_raw", args.track),
    ):
        if value:
            clauses.append(f"{column} LIKE ?")
            values.append(f"%{value}%")

    database = sqlite3.connect(args.database)
    database.row_factory = sqlite3.Row
    rows = database.execute(
        f"""
        SELECT s.province, s.exam_center_raw, s.track_raw, s.table_number,
               s.name_raw, s.gender_raw, s.school_raw, s.birth_date_raw,
               s.subject_headers_json, s.subject_1, s.subject_2, s.subject_3,
               s.subject_4, s.subject_5, s.subject_6, s.subject_7,
               s.result_raw, s.grade_raw, s.notes_raw, s.page_number,
               d.local_path AS pdf_path, d.pdf_url
        FROM students s
        JOIN documents d ON d.id = s.document_id
        WHERE {' AND '.join(clauses)}
        ORDER BY d.ordinal, s.page_number
        """,
        values,
    ).fetchall()
    database.close()
    print(json.dumps([dict(row) for row in rows], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
