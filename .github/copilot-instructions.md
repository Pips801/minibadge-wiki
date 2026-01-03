# Copilot / Agent guidance for minibadges-site

## Quick summary
- Purpose: A static site (GitHub Pages) that shows community-submitted "minibadges". Data comes from Google Form CSV (converted to JSON) and occasionally from PDF build guides (images + parsed text).
- Primary flows: CSV -> `formparse.py` -> `YYYY_form.json` (+ images/YYYY) -> committed by GitHub Action -> site served by GitHub Pages. PDF extraction scripts produce images and JSON that can be merged.

## Key files & components
- `index.html` + `code.js` — frontend. `code.js` loads `DATA_FILES` (ordered list of `*_form.json`) and expects HTML template `#minibadge-template`. Uses List.js for filtering/sorting.
- `formparse.py` — converts Google Form CSV to `{year}_form.json`, downloads new images, reuses existing images when possible.
  - Uses env vars: `MINIBADGE_CSV` (local CSV), `MINIBADGE_CSV_URL` / `GOOGLE_FORM_CSV_URL` (remote), `MINIBADGE_JSON` (output JSON), `MINIBADGE_IMAGES_DIR` (images path).
- `pdfparse.py`, `pdfparse22.py` — heuristics to extract badges/images from PDFs. Require PyMuPDF (`fitz`) and `pdfplumber` (see top of each script for usage notes).
- `2022_form.json`, `2023_form.json`, ... — canonical JSON artifacts the site loads. `images/<year>/` stores badge images.
- `.github/workflows/update-minibadge.yml` — cron workflow (runs every 5 minutes: `*/5 * * * *`) that runs `formparse.py`, using secret `MINIBADGE_CSV_URL`, and commits `2026_form.json` and `images` when changed.

## Conventions & patterns (important for edits)
- JSON shape: each badge is an object with keys: `title`, `author`, `frontImageUrl`, `backImageUrl`, `profilePictureUrl`, `description`, `solderingInstructions`, `solderingDifficulty`, `quantityMade`, `category`, `conferenceYear`, `boardHouse`, `howToAcquire`, `rarity`, `timestamp`.
- Matching & image reuse: `formparse.py` matches existing badges by slugified `title` + `conferenceYear` to avoid re-downloading images.
- Filenames: new badge images are saved under `images/<year>/<slug>-front.<ext>` and `...-back.<ext>`; `formparse.py` infers extensions from `Content-Type`.
- Frontend data loading: `code.js` uses `DATA_FILES` (edit this array to add new `*_form.json` files or change order). Newer years should be earlier in the list (currently 2026 -> 2022).
- Template requirements: `#minibadge-template` must exist in `index.html`; list container id is `#items-list` and inner list class `minibadge-list` (List.js config depends on these names).

## How to run & debug locally (concrete commands)
- Preview site locally: open `index.html` in a browser or run a simple server:
  - `python -m http.server 8000` and visit `http://localhost:8000`.
- Run form parser locally (network CSV):
  - `python formparse.py --csv-url "<CSV_EXPORT_URL>" --output 2026_form.json`
  - Or set env and run: `export MINIBADGE_CSV_URL="<CSV_URL>" && python formparse.py`
  - You can override: `MINIBADGE_IMAGES_DIR="images/2027" MINIBADGE_JSON="2027_form.json" python formparse.py`
- Run PDF extractors:
  - `pip install PyMuPDF pdfplumber` (and any other deps listed at top)
  - `python pdfparse.py input.pdf output.json images/` (see `pdfparse.py` header) or `python pdfparse22.py <pdf> <json>` for 2022-style extractor.
- Reproduce the GitHub Action locally: run `python formparse.py` with `MINIBADGE_CSV_URL` set to your CSV URL and verify `2026_form.json` + `images/` changes. The action uses secret `MINIBADGE_CSV_URL` and commits only when `git diff` shows changes.

## Editing guidance for agents
- When adding a new year:
  - Generate `YYYY_form.json` and save images to `images/YYYY/`.
  - Add the new `YYYY_form.json` early in `DATA_FILES` in `code.js` so it appears first.
  - Ensure image paths in JSON are relative (e.g., `images/2027/slug-front.png`).
- Avoid changing List.js value names or HTML template classes unless you update both `index.html` and `code.js` together; they are tightly coupled (e.g., `.item-title`, `.item-author`, `.item-frontImageUrl`).
- Keep `formparse.py` header mappings (`CSV_MAP`) unchanged unless the upstream form columns change; the script tolerates fuzzy header matches but logs warnings when headers are missing.
- For any change that affects generated JSON or images, test locally and ensure the workflow commit would be minimal (the Actions job commits `2026_form.json` + `images` only when there are changes).

## Notes & gotchas
- The GH Action runs frequently (cron `*/5 * * * *`); avoid pushing noisy commits while experimenting — test locally and use `workflow_dispatch` for manual runs.
- `formparse.py` will backfill missing image URLs by downloading new images only for badges not found in the existing JSON (matching by slug+year).
- The parsers use heuristic image selection (largest square-ish images). PDF pages with odd layouts may require manual inspection; `pdfparse22.py` prints unmatched pages so you can adjust logic.

---
If you'd like, I can: (1) expand any section with more examples, (2) add a short checklist template for PR reviewers (what to verify when JSON/images change), or (3) merge this content into an existing file if you prefer a different location. What would you like me to do next?