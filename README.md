# GRE Vocab Drill

Mobile-first web app to memorize GRE vocabulary by **typing meanings** (not multiple-choice guessing).

## Run

```bash
npm install
npm run dev -- --host
```

Open the local URL on your phone (same Wi‑Fi) or laptop.

## How it works

1. Pick a group (~50 words, alphabetical).
2. See the **word only** → **Guess** (type meaning), **I don't know**, or **See options**.
3. Reveal the meaning and mark **Got it** / **Missed**.
4. Misses and option-helps stay in the drill until **2 consecutive** correct typed answers.
5. First-try correct words are confirmed once more, then **mastered**.
6. **Revise** a group to review mastered words; use **Not confident** to pull a word back into practice.

Progress is saved in this browser’s `localStorage`.

## Data

- Source: `vocab.pdf` (Manhattan Prep GRE list)
- Extracted: `public/vocab.json` (~995 words)
- Re-extract: `python3 scripts/extract-pdf.py`
