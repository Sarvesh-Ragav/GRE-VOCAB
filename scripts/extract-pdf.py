#!/usr/bin/env python3
"""Extract Manhattan Prep GRE words from vocab.pdf → public/vocab.json"""
import json
import re
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "vocab.pdf"
OUT = ROOT / "public" / "vocab.json"


def get_stream(body: bytes) -> bytes | None:
    i = body.find(b"stream")
    if i < 0:
        return None
    header = body[:i]
    i += 6
    if body[i : i + 2] == b"\r\n":
        i += 2
    elif body[i : i + 1] == b"\n":
        i += 1
    j = body.rfind(b"endstream")
    raw = body[i:j]
    if raw.endswith(b"\r\n"):
        raw = raw[:-2]
    elif raw.endswith(b"\n"):
        raw = raw[:-1]
    return zlib.decompress(raw) if b"FlateDecode" in header else raw


def parse_tounicode(cmap_bytes: bytes) -> dict[int, str]:
    mapping: dict[int, str] = {}
    text = cmap_bytes.decode("latin-1")
    for start, end, arr in re.findall(
        r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]", text
    ):
        s, e = int(start, 16), int(end, 16)
        vals = [int(x, 16) for x in re.findall(r"<([0-9A-Fa-f]+)>", arr)]
        for i, code in enumerate(range(s, e + 1)):
            if i < len(vals):
                mapping[code] = chr(vals[i])
    for a, b, c in re.findall(
        r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", text
    ):
        if a == b:
            mapping[int(a, 16)] = chr(int(c, 16)) if int(c, 16) < 0x10000 else ""
    return mapping


def main() -> None:
    data = PDF.read_bytes()
    objs: dict[int, bytes] = {}
    for m in re.finditer(rb"(\d+)\s+0\s+obj\b", data):
        num = int(m.group(1))
        start = m.end()
        end = data.find(b"endobj", start)
        objs[num] = data[start:end]

    font_tu: dict[int, tuple[str, int]] = {}
    for num, body in objs.items():
        if b"/BaseFont/" in body and b"/ToUnicode" in body:
            m = re.search(rb"/ToUnicode\s+(\d+)\s+0\s+R", body)
            base = re.search(rb"/BaseFont/([^\s/]+)", body)
            if m and base:
                font_tu[num] = (base.group(1).decode(), int(m.group(1)))

    cmaps = {
        fobj: parse_tounicode(get_stream(objs[tu]) or b"")
        for fobj, (_, tu) in font_tu.items()
    }

    def parse_font_resources(body: bytes) -> dict[str, int]:
        m = re.search(rb"/Font\s*<<(.*?)>>", body, re.S)
        if not m:
            return {}
        return {
            n.decode(): int(r)
            for n, r in re.findall(rb"/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R", m.group(1))
        }

    def decode_hex(hs: str, cmap: dict[int, str]) -> str:
        return "".join(
            cmap.get(int(hs[i : i + 4], 16), "")
            for i in range(0, len(hs), 4)
            if i + 4 <= len(hs)
        )

    def extract(content: bytes, fonts: dict[str, int]) -> str:
        parts: list[str] = []
        cmap: dict[int, str] = {}
        sc = content.decode("latin-1", errors="ignore")
        for bt in re.finditer(r"BT(.*?)ET", sc, re.S):
            block = bt.group(1)
            for tok in re.finditer(
                r"/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|([\d.\-]+)\s+([\d.\-]+)\s+Td|<([0-9A-Fa-f]+)>\s*Tj|\[(.*?)\]\s*TJ|([\d.\-]+\s+){6}Tm",
                block,
                re.S,
            ):
                g = tok.group(0)
                if g.endswith("Tf"):
                    cmap = cmaps.get(fonts.get(tok.group(1), -1), {})
                elif tok.group(4) is not None:
                    parts.append(decode_hex(tok.group(4), cmap))
                elif tok.group(5) is not None:
                    parts.append(
                        "".join(
                            decode_hex(hs, cmap)
                            for hs in re.findall(r"<([0-9A-Fa-f]+)>", tok.group(5))
                        )
                    )
                elif g.endswith("Td") and tok.group(2) and float(tok.group(3)) < -1:
                    parts.append("\n")
                elif g.endswith("Tm"):
                    parts.append("\n")
            parts.append("\n")
        return "".join(parts)

    page_order: list[int] = []

    def walk(node: int) -> None:
        body = objs.get(node, b"")
        if re.search(rb"/Type\s*/Pages", body):
            kids = re.search(rb"/Kids\s*\[([^\]]+)\]", body)
            if kids:
                for k in re.findall(rb"(\d+)\s+0\s+R", kids.group(1)):
                    walk(int(k))
        elif re.search(rb"/Type\s*/Page\b", body):
            page_order.append(node)

    walk(79)

    text_parts: list[str] = []
    for pnum in page_order:
        body = objs[pnum]
        rm = re.search(rb"/Resources\s+(\d+)\s+0\s+R", body)
        fonts = parse_font_resources(objs[int(rm.group(1))]) if rm else {}
        cm = re.search(rb"/Contents\s*\[([^\]]+)\]", body)
        refs = (
            [int(x) for x in re.findall(rb"(\d+)\s+0\s+R", cm.group(1))] if cm else []
        )
        if not refs:
            cm = re.search(rb"/Contents\s+(\d+)\s+0\s+R", body)
            if cm:
                refs = [int(cm.group(1))]
        content = b"".join(filter(None, (get_stream(objs[c]) for c in refs)))
        text_parts.append(extract(content, fonts))

    lines = [ln.strip() for ln in "\n".join(text_parts).splitlines() if ln.strip()]
    entries: list[dict] = []
    i = 0
    while i < len(lines):
        if re.fullmatch(r"\d+\.", lines[i]):
            num = int(lines[i][:-1])
            i += 1
            if i >= len(lines):
                break
            word = lines[i]
            i += 1
            meaning_parts: list[str] = []
            while i < len(lines) and not re.fullmatch(r"\d+\.", lines[i]):
                low = lines[i].lower()
                if (
                    "quizlet" in low
                    or lines[i].startswith("Manhattan")
                    or lines[i].startswith("Study")
                ):
                    i += 1
                    continue
                meaning_parts.append(lines[i])
                i += 1
            meaning = " ".join(meaning_parts).strip()
            meaning = re.sub(r"(\w)-\s+(\w)", r"\1\2", meaning)
            meaning = re.sub(r"\s+", " ", meaning)
            entries.append({"id": num, "word": word, "meaning": meaning})
        else:
            i += 1

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} words → {OUT}")


if __name__ == "__main__":
    main()
