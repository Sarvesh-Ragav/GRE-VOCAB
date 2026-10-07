#!/usr/bin/env python3
"""Import GRE_Verbal_Vocabulary (1).xlsx into public/vocab.json as set=book."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "GRE_Verbal_Vocabulary (1).xlsx"
VOCAB = ROOT / "public" / "vocab.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def cell_text(c: ET.Element) -> str:
    t = c.get("t")
    if t == "inlineStr":
        return "".join((x.text or "") for x in c.findall(".//m:t", NS)).strip()
    v = c.find("m:v", NS)
    return (v.text or "").strip() if v is not None else ""


def col_of(ref: str | None) -> str:
    m = re.match(r"([A-Z]+)", ref or "")
    return m.group(1) if m else ""


def main() -> None:
    with zipfile.ZipFile(XLSX) as z:
        root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows = root.findall("m:sheetData/m:row", NS)

    book_words: list[tuple[str, str, str, str, str, int]] = []
    for i, row in enumerate(rows):
        if i == 0:
            continue
        data = {col_of(c.get("r")): cell_text(c) for c in row.findall("m:c", NS)}
        word = (data.get("B") or "").strip()
        meaning = (data.get("D") or "").strip()
        mnemonic = (data.get("E") or "").strip()
        example = (data.get("F") or "").strip()
        pos = (data.get("C") or "").strip()
        try:
            times_seen = int(float(data.get("G") or "0"))
        except ValueError:
            times_seen = 0
        if not word or not meaning:
            continue
        book_words.append((word, meaning, mnemonic, example, pos, times_seen))

    # Highest frequency first so Book 1 = most-seen words
    book_words.sort(key=lambda t: (-t[5], t[0].lower()))

    vocab = [w for w in json.loads(VOCAB.read_text()) if w.get("set") != "book"]
    start = max(w["id"] for w in vocab) + 1
    new = []
    for i, (word, meaning, mnemonic, example, pos, times_seen) in enumerate(book_words):
        item: dict = {
            "id": start + i,
            "word": word,
            "meaning": meaning,
            "set": "book",
            "timesSeen": times_seen,
        }
        if mnemonic:
            item["mnemonic"] = mnemonic
        if example:
            item["example"] = example
        if pos:
            item["pos"] = pos
        new.append(item)

    VOCAB.write_text(json.dumps(vocab + new, indent=2, ensure_ascii=False) + "\n")
    freqs = [t[5] for t in book_words]
    print(
        f"Imported {len(new)} book words → {VOCAB} "
        f"(timesSeen {max(freqs)}→{min(freqs)})"
    )


if __name__ == "__main__":
    main()
