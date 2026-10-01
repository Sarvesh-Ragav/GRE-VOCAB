#!/usr/bin/env python3
"""Regenerate clue + example fields on public/vocab.json from meanings."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "public" / "vocab.json"


def clean_meaning_bits(text: str) -> str:
    text = re.sub(r"\(\s*(verb|noun|adj|adjective|adverb)\s*\)", "", text, flags=re.I)
    text = re.sub(r"\s{2,}", " ", text).strip(" ;,")
    return text


def clauses(meaning: str) -> list[str]:
    meaning = clean_meaning_bits(meaning)
    parts = []
    for chunk in meaning.split(";"):
        c = chunk.strip().strip(".")
        if c and c.lower() not in {"verb", "noun", "adj", "adjective"}:
            parts.append(c)
    return parts


def make_clue(meaning: str) -> str:
    parts = clauses(meaning)
    clue = parts[0]
    if len(parts) > 1 and len(clue) < 52 and len(clue) + len(parts[1]) < 92:
        clue = f"{clue}; {parts[1]}"
    if len(clue) > 92:
        clue = clue[:89].rstrip(",; ") + "…"
    return clue


def pos(word: str, meaning: str) -> str:
    sense = clauses(meaning)[0]
    w = word.lower()
    sl = sense.lower()
    if sl.startswith(
        (
            "a ", "an ", "the ", "person ", "one who", "someone", "deviation", "absence",
            "praise", "medicine", "burden", "confused", "summit", "practice", "dwelling",
            "gradual", "deep ", "high point", "keen,", "keen ", "fake behavior", "temporary",
            "cutting off", "side-by-side", "not caring", "of questionable",
        )
    ) or re.match(r"^[A-Z][a-z]+ion\b", sense):
        return "noun"
    if any(
        w.endswith(s)
        for s in (
            "tion", "sion", "ness", "ment", "ity", "ety", "ism", "ure", "ogy", "ance",
            "ence", "hood", "ship", "dom", "cy", "sis", "xis",
        )
    ):
        return "noun"
    if w.endswith("y") and not w.endswith(("fy", "ly", "ify")) and len(w) > 4:
        return "noun"
    if w in {
        "acumen", "zenith", "abyss", "aerie", "welter", "yoke", "zeal", "guile",
        "panache", "rhetoric", "anodyne",
    }:
        return "noun"
    if any(
        w.endswith(s)
        for s in ("ous", "ious", "eous", "ical", "ive", "able", "ible", "ful", "less", "ish")
    ):
        return "adj"
    if sl.startswith(
        (
            "uncertain", "unable", "harsh", "sour", "warm", "fake", "opposing", "abnormal",
            "rough", "very ", "extremely ", "characterized", "lacking", "not ", "slight",
            "mild", "formal", "ancient", "primitive", "passionate", "side-by-side",
            "directly ", "highly ",
        )
    ):
        return "adj"
    if w.endswith(("ent", "ant", "ary", "ory", "ic", "al", "ile", "ine")) and not w.endswith(
        ("ment", "tion", "sion", "ance", "ence")
    ):
        if not sl.startswith(
            (
                "to ", "make ", "give ", "speak ", "set ", "take ", "hold ", "formally ",
                "depart ", "agree ", "stick ", "gather ", "reduce ", "degrade ", "detest ",
                "renounce ",
            )
        ):
            return "adj"
    return "verb"


def make_example(word: str, meaning: str) -> str:
    parts = clauses(meaning)
    sense = parts[0]
    extra = parts[1] if len(parts) > 1 else ""
    kind = pos(word, meaning)
    s = sense[0].lower() + sense[1:] if sense else sense
    gloss = re.sub(r"^to\s+", "", s, flags=re.I)

    if kind == "noun":
        article = "an" if word[0].lower() in "aeiou" else "a"
        return f"In context, {article} {word} is simply {s}."
    if kind == "adj":
        detail = (extra[0].lower() + extra[1:]) if extra else s
        if len(detail) > 75:
            detail = detail[:72] + "…"
        return f"Her response was {word}: {detail}."
    return f"To {word} is to {gloss}. Example: he refused to {word} when it mattered most."


def main() -> None:
    raw = json.loads(PATH.read_text())
    enriched = [
        {
            "id": w["id"],
            "word": w["word"],
            "meaning": w["meaning"],
            "clue": make_clue(w["meaning"]),
            "example": make_example(w["word"], w["meaning"]),
        }
        for w in raw
    ]
    PATH.write_text(json.dumps(enriched, indent=2, ensure_ascii=False) + "\n")
    print(f"Enriched {len(enriched)} words → {PATH}")


if __name__ == "__main__":
    main()
