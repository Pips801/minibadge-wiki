#!/usr/bin/env python3
"""
Extract per-minibadge front/back images from the 2022 PDF and update the 2022 JSON
so each badge object has frontImageUrl/backImageUrl pointing at the saved images.

Key differences vs the earlier attempt:
- Titles come from the JSON (source of truth).
- For each PDF page, we match the page's text to one of the JSON titles.
- Filenames are slugified from the JSON title: {slug}-front.png / {slug}-back.png
- JSON is updated IN PLACE (with a .bak backup).

Usage:
  pip install pymupdf
  python extract_and_update_2022.py MiniBadges-of-2022-v2.pdf saintcon_minibadges_2022.json

Output:
  images/2022/*.png
  saintcon_minibadges_2022.json (updated)
  saintcon_minibadges_2022.json.bak (backup of original)
"""

import json
import re
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF


# ----------------- text helpers -----------------

def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = s.replace(" ", "-")
    s = re.sub(r"-{2,}", "-", s)
    s = s.strip("-")
    return s or "unknown-badge"


def norm(s: str) -> str:
    """Aggressive normalization for matching titles in PDF text."""
    s = (s or "").lower()
    s = s.replace("&", "and")
    # kill punctuation
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    # collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s


def page_text_norm(page: fitz.Page) -> str:
    # Full page text, normalized
    return norm(page.get_text("text") or "")


# ----------------- image helpers -----------------

def extract_page_images(doc: fitz.Document, page: fitz.Page) -> List[Tuple[int, int, int, bytes]]:
    """
    Return a list of (w, h, area, png_bytes) for raster images on the page,
    sorted by area descending. Dedup by xref.
    """
    images: List[Tuple[int, int, int, bytes]] = []
    seen = set()

    for info in page.get_images(full=True):
        xref = info[0]
        if xref in seen:
            continue
        seen.add(xref)

        try:
            pix = fitz.Pixmap(doc, xref)
        except Exception:
            continue

        if pix.width <= 1 or pix.height <= 1:
            continue

        # convert to RGB if needed (CMYK etc.)
        if pix.n >= 5:
            pix = fitz.Pixmap(fitz.csRGB, pix)

        png_bytes = pix.tobytes("png")
        area = pix.width * pix.height
        images.append((pix.width, pix.height, area, png_bytes))

    images.sort(key=lambda t: t[2], reverse=True)
    return images


def unique_path(out_dir: Path, filename: str) -> Path:
    """
    Ensure we don't overwrite. If exists, append -2/-3...
    (Should be rare if titles are unique, but it's safe.)
    """
    p = out_dir / filename
    if not p.exists():
        return p
    stem = p.stem
    suf = p.suffix
    i = 2
    while True:
        cand = out_dir / f"{stem}-{i}{suf}"
        if not cand.exists():
            return cand
        i += 1


# ----------------- matching logic -----------------

def build_title_index(badges: List[dict]) -> Dict[str, List[dict]]:
    """
    Build mapping from normalized title -> list of badge objects.
    Usually unique, but keep list to be safe.
    """
    idx: Dict[str, List[dict]] = {}
    for b in badges:
        t = b.get("title", "")
        k = norm(t)
        if not k:
            continue
        idx.setdefault(k, []).append(b)
    return idx


def find_matching_badge_for_page(
    page_norm_text: str,
    title_keys: List[str],
) -> Optional[str]:
    """
    Find which normalized title appears in the page text.
    Strategy:
    - Prefer longest title matches first (reduces false positives).
    - Use substring match on normalized text.

    Returns the normalized title key if found, else None.
    """
    for k in title_keys:
        if k and k in page_norm_text:
            return k
    return None


# ----------------- main -----------------

def main(pdf_path: Path, json_path: Path) -> int:
    out_dir = Path("images") / "2021"
    out_dir.mkdir(parents=True, exist_ok=True)

    badges = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(badges, list):
        raise ValueError("JSON root must be a list of minibadge objects.")

    title_index = build_title_index(badges)
    # Search longest titles first
    title_keys_sorted = sorted(title_index.keys(), key=len, reverse=True)

    doc = fitz.open(str(pdf_path))

    matched_pages = 0
    images_saved = 0
    unmatched_pages: List[int] = []

    # We'll update badge objects as we extract images
    # If a badge title shows up multiple times, we fill the first one missing images.
    for pno in range(doc.page_count):
        page = doc.load_page(pno)
        txt = page_text_norm(page)

        match_key = find_matching_badge_for_page(txt, title_keys_sorted)
        if not match_key:
            unmatched_pages.append(pno)
            continue

        # Pick a badge object to update (first one with empty frontImageUrl, else first)
        candidates = title_index[match_key]
        badge = None
        for c in candidates:
            if not (c.get("frontImageUrl") or "").strip():
                badge = c
                break
        if badge is None:
            badge = candidates[0]

        title = badge.get("title", "")
        slug = slugify(title)

        imgs = extract_page_images(doc, page)
        if not imgs:
            # matched title but no images found
            continue

        # Heuristic: 1st = front, 2nd = back (largest by area)
        front = imgs[0]
        back = imgs[1] if len(imgs) > 1 else None

        front_path = unique_path(out_dir, f"{slug}-front.png")
        front_path.write_bytes(front[3])
        badge["frontImageUrl"] = front_path.as_posix()
        images_saved += 1

        if back is not None:
            back_path = unique_path(out_dir, f"{slug}-back.png")
            back_path.write_bytes(back[3])
            badge["backImageUrl"] = back_path.as_posix()
            images_saved += 1
        else:
            # leave back empty if we didn't get a second image
            badge["backImageUrl"] = (badge.get("backImageUrl") or "").strip()

        matched_pages += 1

    # Backup original JSON then overwrite (because this is what you asked for)
    bak_path = json_path.with_suffix(json_path.suffix + ".bak")
    shutil.copy2(json_path, bak_path)
    json_path.write_text(json.dumps(badges, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[+] PDF pages: {doc.page_count}")
    print(f"[+] Matched pages to JSON titles: {matched_pages}")
    print(f"[+] Images saved: {images_saved}")
    print(f"[+] Wrote images to: {out_dir.resolve()}")
    print(f"[+] Updated JSON IN PLACE: {json_path.resolve()}")
    print(f"[+] Backup created: {bak_path.resolve()}")

    if unmatched_pages:
        # show a small summary so you can diagnose if needed
        preview = ", ".join(str(p + 1) for p in unmatched_pages[:20])
        more = "" if len(unmatched_pages) <= 20 else f" ... (+{len(unmatched_pages) - 20} more)"
        print(f"[!] Unmatched pages (1-indexed): {preview}{more}")
        print("    If these should match, the page text might not include the title verbatim.")
        print("    In that case, we can switch to a 'page-order mapping' mode.")

    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract_and_update_2022.py MiniBadges-of-2022-v2.pdf saintcon_minibadges_2022.json")
        raise SystemExit(2)

    pdf = Path(sys.argv[1]).expanduser().resolve()
    js = Path(sys.argv[2]).expanduser().resolve()

    if not pdf.exists():
        print(f"PDF not found: {pdf}")
        raise SystemExit(2)
    if not js.exists():
        print(f"JSON not found: {js}")
        raise SystemExit(2)

    raise SystemExit(main(pdf, js))
