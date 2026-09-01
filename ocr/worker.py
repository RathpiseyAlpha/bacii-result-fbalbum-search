"""Targeted Khmer OCR worker for Cambodia BacII result sheets.

The ruled template is segmented deterministically. A small Khmer-specific
Hugging Face recognizer is used only for header/name line crops, while
Tesseract reads the ASCII row-number column in one batch per page.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps
from transformers import AutoModel, AutoTokenizer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


MODEL_ID = os.environ.get("KHMER_OCR_MODEL", "Darayut/khmer-text-recognition")
MODEL_REVISION = os.environ.get("KHMER_OCR_REVISION", "f8d2ef9a3d60862cd695029ec2376f618685445b")
PROVINCES = {
    "Phnom Penh": ["ភ្នំពេញ", "រាជធានីភ្នំពេញ"],
    "Banteay Meanchey": ["បន្ទាយមានជ័យ"],
    "Battambang": ["បាត់ដំបង"],
    "Kampong Cham": ["កំពង់ចាម"],
    "Kampong Chhnang": ["កំពង់ឆ្នាំង"],
    "Kampong Speu": ["កំពង់ស្ពឺ"],
    "Kampong Thom": ["កំពង់ធំ"],
    "Kampot": ["កំពត"],
    "Kandal": ["កណ្ដាល", "កណ្តាល"],
    "Kep": ["កែប"],
    "Koh Kong": ["កោះកុង"],
    "Kratie": ["ក្រចេះ"],
    "Mondulkiri": ["មណ្ឌលគិរី"],
    "Oddar Meanchey": ["ឧត្ដរមានជ័យ", "ឧត្តរមានជ័យ"],
    "Pailin": ["ប៉ៃលិន"],
    "Preah Sihanouk": ["ព្រះសីហនុ"],
    "Preah Vihear": ["ព្រះវិហារ"],
    "Prey Veng": ["ព្រៃវែង"],
    "Pursat": ["ពោធិ៍សាត់"],
    "Ratanakiri": ["រតនគិរី"],
    "Siem Reap": ["សៀមរាប"],
    "Stung Treng": ["ស្ទឹងត្រែង"],
    "Svay Rieng": ["ស្វាយរៀង"],
    "Takeo": ["តាកែវ"],
    "Tboung Khmum": ["ត្បូងឃ្មុំ"],
}


def groups(values: np.ndarray, max_gap: int = 0) -> list[tuple[int, int]]:
    indices = np.flatnonzero(values)
    if len(indices) == 0:
        return []
    result: list[tuple[int, int]] = []
    start = previous = int(indices[0])
    for value in indices[1:]:
        current = int(value)
        if current - previous > max_gap + 1:
            result.append((start, previous + 1))
            start = current
        previous = current
    result.append((start, previous + 1))
    return result


def centers(spans: list[tuple[int, int]]) -> list[int]:
    return [round((start + end - 1) / 2) for start, end in spans]


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("_", " ")).strip(" \t:-៖|")


class KhmerRecognizer:
    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Loading {MODEL_ID} on {self.device}", file=sys.stderr, flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION, trust_remote_code=True)
        self.model = AutoModel.from_pretrained(MODEL_ID, revision=MODEL_REVISION, trust_remote_code=True).to(self.device)
        self.model.eval()
        vocab = self.tokenizer.get_vocab()
        self.id_to_char = {value: key for key, value in vocab.items()}
        self.sos = vocab.get("<sos>", 1)
        self.eos = vocab.get("<eos>", 2)
        self.pad = vocab.get("<pad>", 0)
        self.unk = vocab.get("<unk>", 3)
        self.cache: dict[tuple[str, int, int], str] = {}

    def cache_key(self, source: Image.Image, beam_width: int, max_len: int) -> tuple[str, int, int]:
        image = ImageOps.autocontrast(source.convert("L"))
        width = max(8, round(32 * image.width / max(image.height, 1)))
        image = image.resize((width, 32), Image.Resampling.LANCZOS).point(lambda pixel: 255 if pixel > 175 else 0)
        return hashlib.sha1(image.tobytes()).hexdigest(), beam_width, max_len

    def preprocess(self, source: Image.Image) -> torch.Tensor:
        image = ImageOps.autocontrast(source.convert("L"))
        width = max(10, round(48 * image.width / max(image.height, 1)))
        image = image.resize((width, 48), Image.Resampling.LANCZOS)
        pixels = np.asarray(image, dtype=np.float32) / 127.5 - 1.0
        tensor = torch.from_numpy(pixels).unsqueeze(0)
        chunks: list[torch.Tensor] = []
        start = 0
        while start < width:
            chunk = tensor[:, :, start : start + 100]
            if chunk.shape[2] < 100:
                chunk = F.pad(chunk, (0, 100 - chunk.shape[2], 0, 0), value=1.0)
            chunks.append(chunk)
            start += 84
        return torch.stack(chunks).to(self.device)

    def predict(self, source: Image.Image, beam_width: int = 1, max_len: int = 180) -> str:
        cache_key = self.cache_key(source, beam_width, max_len)
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached
        chunks = self.preprocess(source)
        with torch.inference_mode():
            memory = self.model([chunks])
        token_ids = self._beam(memory, max_len, beam_width) if beam_width > 1 else self._greedy(memory, max_len)
        text = "".join(
            self.id_to_char.get(index, "")
            for index in token_ids
            if index not in {self.sos, self.eos, self.pad, self.unk}
        )
        result = normalize_text(text)
        self.cache[cache_key] = result
        return result

    def _greedy(self, memory: torch.Tensor, max_len: int) -> list[int]:
        sequence = [self.sos]
        mask = torch.zeros((1, memory.shape[1]), dtype=torch.bool, device=self.device)
        with torch.no_grad():
            for _ in range(max_len):
                target = torch.tensor([sequence], dtype=torch.long, device=self.device)
                next_token = int(torch.argmax(self.model.dec(target, memory, mask)[0, -1]).item())
                if next_token == self.eos:
                    break
                sequence.append(next_token)
        return sequence

    def _beam(self, memory: torch.Tensor, max_len: int, width: int) -> list[int]:
        memory = memory.expand(width, -1, -1)
        mask = torch.zeros((width, memory.shape[1]), dtype=torch.bool, device=self.device)
        beams: list[tuple[float, list[int]]] = [(0.0, [self.sos])]
        completed: list[tuple[float, list[int]]] = []
        with torch.no_grad():
            for _ in range(max_len):
                targets = torch.tensor([sequence for _, sequence in beams], dtype=torch.long, device=self.device)
                probabilities = F.log_softmax(self.model.dec(targets, memory[: len(beams)], mask[: len(beams)])[:, -1], dim=-1)
                candidates: list[tuple[float, list[int]]] = []
                for beam_index, (score, sequence) in enumerate(beams):
                    scores, tokens = probabilities[beam_index].topk(width)
                    candidates.extend((score + float(next_score), sequence + [int(token)]) for next_score, token in zip(scores, tokens))
                candidates.sort(key=lambda value: value[0], reverse=True)
                beams = []
                for score, sequence in candidates:
                    if sequence[-1] == self.eos:
                        completed.append((score / max(1, len(sequence) - 1), sequence))
                    elif len(beams) < width:
                        beams.append((score, sequence))
                if not beams:
                    break
        return max(completed or beams, key=lambda value: value[0])[1] if completed or beams else [self.sos]


def find_grid(image: Image.Image) -> tuple[list[int], list[int]] | None:
    pixels = np.asarray(image.convert("L"))
    dark = pixels < 145
    height, width = dark.shape
    horizontal = centers(groups(dark.sum(axis=1) > width * 0.48, max_gap=1))
    horizontal = [line for line in horizontal if 8 < line < height - 8]
    if len(horizontal) < 8:
        return None
    top, bottom = horizontal[0], horizontal[-1]
    vertical = centers(groups(dark[top : bottom + 1].sum(axis=0) > (bottom - top) * 0.68, max_gap=1))
    if len(vertical) < 3:
        return None
    return horizontal, vertical


def header_crops(image: Image.Image, table_top: int) -> list[Image.Image]:
    header = np.asarray(image.convert("L"))[: max(1, table_top - 4)]
    dark = header < 165
    height, width = dark.shape
    line_groups = groups(dark.sum(axis=1) > max(4, width * 0.0025), max_gap=4)
    crops: list[Image.Image] = []
    for y1, y2 in line_groups:
        if y2 - y1 < 4:
            continue
        profile = dark[max(0, y1 - 2) : min(height, y2 + 2)].sum(axis=0) > 0
        blocks = groups(profile, max_gap=32)
        for x1, x2 in blocks:
            if x2 - x1 < 35:
                continue
            crops.append(image.crop((max(0, x1 - 5), max(0, y1 - 4), min(width, x2 + 5), min(table_top, y2 + 4))))
    return crops


def tesseract_path() -> str | None:
    configured = os.environ.get("TESSERACT_CMD")
    if configured and Path(configured).exists():
        return configured
    found = shutil.which("tesseract")
    if found:
        return found
    windows = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
    return str(windows) if windows.exists() else None


def recognize_numbers(image: Image.Image, horizontal: list[int], vertical: list[int]) -> list[str]:
    executable = tesseract_path()
    if not executable:
        raise RuntimeError("Tesseract is required for the fast table-number column. Install Tesseract 5 or set TESSERACT_CMD.")
    row_intervals = list(zip(horizontal[1:-1], horizontal[2:]))
    x1, x2 = vertical[0], vertical[1]
    cell_height = 58
    strip = Image.new("L", (max(80, (x2 - x1) * 3), len(row_intervals) * cell_height), 255)
    for index, (y1, y2) in enumerate(row_intervals):
        crop = image.crop((x1 + 4, y1 + 3, x2 - 4, y2 - 3)).convert("L")
        crop = ImageOps.autocontrast(crop)
        crop.thumbnail((strip.width - 12, cell_height - 12), Image.Resampling.LANCZOS)
        strip.paste(crop, ((strip.width - crop.width) // 2, index * cell_height + (cell_height - crop.height) // 2))
    temporary = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    temporary.close()
    try:
        strip.save(temporary.name)
        process = subprocess.run(
            [executable, temporary.name, "stdout", "-l", "eng", "--psm", "6", "-c", "tessedit_char_whitelist=0123456789", "tsv"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=45, check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(process.stderr.strip() or "Tesseract could not read the number column.")
        values: list[list[tuple[float, str]]] = [[] for _ in row_intervals]
        lines = process.stdout.splitlines()
        for line in lines[1:]:
            columns = line.split("\t")
            if len(columns) < 12:
                continue
            text = re.sub(r"\D", "", columns[11])
            if not text:
                continue
            center_y = int(columns[7]) + int(columns[9]) / 2
            index = min(len(values) - 1, max(0, int(center_y // cell_height)))
            values[index].append((float(columns[10] or 0), text))
        raw = [max(candidates, default=(0.0, ""), key=lambda value: value[0])[1] for candidates in values]
        return repair_number_sequence(raw)
    finally:
        Path(temporary.name).unlink(missing_ok=True)


def repair_number_sequence(raw: list[str]) -> list[str]:
    """Repair dropped digits using the table's strictly increasing row order."""
    repaired: list[int] = []
    for index, value in enumerate(raw):
        number = int(value) if value.isdigit() else 0
        previous = repaired[-1] if repaired else 0
        if index == 0 and number > 0:
            repaired.append(number)
            continue
        if number > previous and number <= previous + 6:
            repaired.append(number)
            continue
        next_number = 0
        next_distance = 0
        for offset, candidate in enumerate(raw[index + 1 :], start=1):
            if candidate.isdigit() and int(candidate) > previous:
                next_number = int(candidate)
                next_distance = offset
                break
        inferred = next_number - next_distance if next_number and next_number - next_distance > previous else previous + 1
        repaired.append(inferred)
    return [str(number) for number in repaired]


def infer_province(text: str) -> str | None:
    compact = re.sub(r"\s+", "", text)
    for english, variants in PROVINCES.items():
        if any(variant in compact for variant in variants):
            return english
    chunks = [chunk for chunk in re.split(r"[\s:៖|,]+", text) if len(chunk) >= 3]
    best: tuple[float, str] = (0.0, "")
    for english, variants in PROVINCES.items():
        for variant in variants:
            for chunk in chunks:
                score = difflib.SequenceMatcher(None, chunk, variant).ratio()
                if score > best[0]:
                    best = (score, english)
    return best[1] if best[0] >= 0.72 else None


def infer_track(text: str) -> str:
    compact = re.sub(r"\s+", "", text)
    if "សង្គម" in compact:
        return "social-science"
    if "វិទ្យាសាស្ត្រ" in compact or "វិទ្យាសាស្រ្ត" in compact:
        return "science"
    return "unknown"


def infer_center(lines: list[str]) -> str | None:
    for line in lines:
        if "មណ្ឌលប្រឡង" in line:
            value = re.split(r"មណ្ឌលប្រឡង\s*[:៖-]?", line, maxsplit=1)[-1]
            return normalize_text(value) or normalize_text(line)
    return None


def process_page(entry: dict[str, object], recognizer: KhmerRecognizer, include_names: bool) -> dict[str, object]:
    photo_id = str(entry["photoId"])
    photo_index = int(entry["photoIndex"])
    try:
        image = Image.open(str(entry["path"])).convert("RGB")
        if image.width < 700 and 0.88 <= image.width / max(image.height, 1) <= 1.12:
            return {
                "photoId": photo_id, "photoIndex": photo_index, "status": "skipped", "headerText": "",
                "track": "unknown", "rows": [], "error": "No BacII result table detected (likely a cover image).",
            }
        if image.width < 700:
            return {
                "photoId": photo_id, "photoIndex": photo_index, "status": "failed", "headerText": "",
                "track": "unknown", "rows": [], "error": "Facebook supplied only a low-resolution thumbnail. Rescan the album to request the OCR-size image.",
            }
        if image.width < 1200:
            scale = 1500 / image.width
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        grid = find_grid(image)
        if not grid:
            return {
                "photoId": photo_id, "photoIndex": photo_index, "status": "skipped", "headerText": "",
                "track": "unknown", "rows": [], "error": "No BacII result table detected (likely a cover image).",
            }
        horizontal, vertical = grid
        lines = [recognizer.predict(crop, beam_width=1, max_len=160) for crop in header_crops(image, horizontal[0])]
        lines = [line for line in lines if line]
        numbers = recognize_numbers(image, horizontal, vertical)
        names: list[str] = []
        if include_names:
            row_intervals = list(zip(horizontal[1:-1], horizontal[2:]))
            for y1, y2 in row_intervals:
                crop = image.crop((vertical[1] + 4, y1 + 3, vertical[2] - 4, y2 - 3))
                names.append(recognizer.predict(crop, beam_width=1, max_len=90))
        rows = []
        for index, number in enumerate(numbers):
            name = names[index] if index < len(names) else ""
            if number or name:
                row: dict[str, str] = {"number": number}
                if name:
                    row["name"] = name
                rows.append(row)
        header_text = " | ".join(lines)
        result: dict[str, object] = {
            "photoId": photo_id, "photoIndex": photo_index, "status": "ready", "headerText": header_text,
            "track": infer_track(header_text), "rows": rows,
        }
        province = infer_province(header_text)
        center = infer_center(lines)
        if province:
            result["province"] = province
        if center:
            result["examCenter"] = center
        return result
    except Exception as error:
        return {
            "photoId": photo_id, "photoIndex": photo_index, "status": "failed", "headerText": "",
            "track": "unknown", "rows": [], "error": str(error),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--mode", choices=["targeted", "names"], default="targeted")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        print(json.dumps({"ok": True, "model": MODEL_ID}))
        return 0
    if not args.manifest:
        parser.error("--manifest is required")
    entries = json.loads(args.manifest.read_text(encoding="utf-8"))
    recognizer = KhmerRecognizer()
    for entry in entries:
        result = process_page(entry, recognizer, args.mode == "names")
        print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
