import pdfplumber
import fitz  # PyMuPDF
import json
import re
import os
import sys

# === CONFIG ===
INPUT_PDF = "Pips Build Guide 2025 v3 (1).pdf"
OUTPUT_JSON = "minibadges_2025_from_pdf.json"
IMAGES_DIR = "images"
CONFERENCE_YEAR = "2025"


def page_to_category(page_num: int) -> str:
    """
    Map 1-based page number to category.
    Sponsor minibadges:  6–24
    Official:            25–27
    Community:           28–47
    Event:               48–53
    Contest:             54–66
    Award:               67–69
    Personal:            70–265
    Accessory:           266–267
    Other:               268–277
    """
    if 6 <= page_num <= 24:
        return "Sponsor"
    if 25 <= page_num <= 27:
        return "Official"
    if 28 <= page_num <= 47:
        return "Community"
    if 48 <= page_num <= 53:
        return "Event"
    if 54 <= page_num <= 66:
        return "Contest"
    if 67 <= page_num <= 69:
        return "Award"
    if 70 <= page_num <= 265:
        return "Personal"
    if 266 <= page_num <= 267:
        return "Accessory"
    if 268 <= page_num <= 277:
        return "Other"
    # Outside ranges (cover pages, index, etc.)
    return ""


def clean_lines(page):
    """
    Extract text lines from a pdfplumber page and strip out layout/decor noise.
    """
    text = page.extract_text() or ""
    raw_lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    def is_decor(ln: str) -> bool:
        # Lines that are just digits + spaces (e.g. "7 7 7 7 7")
        if ln and all((ch.isdigit() or ch.isspace()) for ch in ln):
            return True
        # Single uppercase letters (vertical "FRONT"/"BACK" artifacts)
        if len(ln) == 1 and ln.isalpha() and ln.isupper():
            return True
        # Merged FRONT/BACK artifacts
        if ln.replace(" ", "") in ("FRONT", "BACK", "TNORF", "KCAB"):
            return True
        # Short page numbers
        if ln.isdigit() and len(ln) <= 2:
            return True
        return False

    filtered = [ln for ln in raw_lines if not is_decor(ln)]

    cleaned = []
    for ln in filtered:
        # Fix artifacts like "C -MagicSmoke(...)" -> "-MagicSmoke(...)"
        m = re.match(r"^([A-Z])\s+(-.*)$", ln)
        if m:
            ln = m.group(2)
        cleaned.append(ln)

    return cleaned


def split_page_blocks(lines):
    """
    Split a page's cleaned lines into badge blocks.
    Each badge ends at a line containing "BOARD/LED TYPE".
    For the Pips PDF, this yields one block per minibadge page.
    """
    blocks = []
    start = 0
    for i, ln in enumerate(lines):
        if "BOARD/LED TYPE" in ln:
            block = lines[start : i + 1]
            if block:
                blocks.append(block)
            start = i + 1
    return blocks


def parse_badge_core(lines):
    """
    Given cleaned lines for ONE minibadge block, extract:
    title, author, description,
    solderingDifficulty, rarity, howToAcquire, solderingInstructions.
    """
    core = {
        "title": "",
        "author": "",
        "description": "",
        "solderingDifficulty": "",
        "rarity": "",
        "howToAcquire": "",
        "solderingInstructions": "",
    }

    if not lines:
        return None

    # Title is first real line in the block
    core["title"] = lines[0].strip()

    # "Designed By: Pips"
    author_idx = next((i for i, l in enumerate(lines) if "Designed By:" in l), None)
    if author_idx is not None:
        core["author"] = lines[author_idx].split("Designed By:", 1)[1].strip()

    # Headers within the block
    diff_header_idx = next(
        (i for i, l in enumerate(lines) if "DIFFICULTY:" in l and "HOW DO I GET ONE?" in l),
        None,
    )
    rarity_header_idx = next(
        (i for i, l in enumerate(lines) if l.strip().startswith("RARITY:")),
        None,
    )
    asm_header_idx = next(
        (i for i, l in enumerate(lines) if l.strip().startswith("ASSEMBLY INSTRUCTIONS:")),
        None,
    )

    # Description: between author line and the difficulty header
    start_desc = (author_idx + 1) if author_idx is not None else 1
    end_desc = diff_header_idx if diff_header_idx is not None else len(lines)
    desc_lines = [l for l in lines[start_desc:end_desc] if l.strip()]
    core["description"] = "\n".join(desc_lines).strip()

    # Difficulty + "How do I get one?" (line immediately after diff header)
    if diff_header_idx is not None and diff_header_idx + 1 < len(lines):
        line = lines[diff_header_idx + 1]
        tokens = line.split()
        if tokens:
            core["solderingDifficulty"] = tokens[0].capitalize()  # e.g. BEGINNER -> Beginner
            core["howToAcquire"] = " ".join(tokens[1:]).strip()

    # Rarity: line after "RARITY:"
    if rarity_header_idx is not None and rarity_header_idx + 1 < len(lines):
        core["rarity"] = lines[rarity_header_idx + 1].strip().capitalize()

    # Assembly / soldering instructions: lines after header until "BOARD/LED TYPE"
    if asm_header_idx is not None:
        asm_lines = []
        for l in lines[asm_header_idx + 1 :]:
            if "BOARD/LED TYPE" in l:
                break
            asm_lines.append(l)
        core["solderingInstructions"] = "\n".join(asm_lines).strip()

    # If nothing meaningful, skip
    if not core["solderingDifficulty"] and not core["description"]:
        return None

    return core


def slugify(title: str) -> str:
    """
    Convert a badge title into a safe filename chunk, e.g.
    "Scratch and Sniff!" -> "scratch-and-sniff"
    """
    t = (title or "").strip().lower()
    t = re.sub(r"['’]", "", t)                  # remove apostrophes
    t = re.sub(r"[^a-z0-9]+", "-", t)           # non-alphanum -> dash
    t = re.sub(r"-+", "-", t).strip("-")        # collapse dashes
    return t or "badge"


def get_front_back_images(fitz_doc, page_index):
    """
    Heuristic to find the front/back images for a minibadge on this page:
    - Grab all images on the page.
    - Filter to those that are roughly square and reasonably large.
    - Take the two with largest area as (front, back).
    """
    page = fitz_doc[page_index]
    infos = []

    for img in page.get_images(full=True):
        xref = img[0]
        base = fitz_doc.extract_image(xref)
        w, h = base["width"], base["height"]
        aspect = w / h if h else 0
        area = w * h
        infos.append((xref, w, h, aspect, area, base["ext"], base["image"]))

    # Candidate = roughly square and large enough
    candidates = [
        i for i in infos
        if min(i[1], i[2]) > 300 and 0.7 < i[3] < 1.3
    ]
    candidates_sorted = sorted(candidates, key=lambda x: x[4], reverse=True)

    return candidates_sorted[:2]


def main(pdf_path: str, output_path: str, images_dir: str):
    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found: {pdf_path}")
        sys.exit(1)

    os.makedirs(images_dir, exist_ok=True)

    badges = []

    # pdfplumber for text
    with pdfplumber.open(pdf_path) as pdf_text:
        # PyMuPDF for images
        pdf_images = fitz.open(pdf_path)

        for page_index, page in enumerate(pdf_text.pages):
            page_num = page_index + 1  # 1-based page number
            category = page_to_category(page_num)

            lines = clean_lines(page)
            blocks = split_page_blocks(lines)
            if not blocks:
                continue

            # For this build guide: one minibadge block per page
            core = parse_badge_core(blocks[0])
            if not core:
                continue

            title = core.get("title", "")
            slug = slugify(title)

            # Extract front/back images
            candidates = get_front_back_images(pdf_images, page_index)
            front_url = ""
            back_url = ""

            if len(candidates) >= 1:
                xref, w, h, aspect, area, ext, img_bytes = candidates[0]
                front_fn = f"{slug}-front.{ext}"
                front_path = os.path.join(images_dir, front_fn)
                with open(front_path, "wb") as f:
                    f.write(img_bytes)
                front_url = f"{images_dir}/{front_fn}".replace("\\", "/")

            if len(candidates) >= 2:
                xref, w, h, aspect, area, ext, img_bytes = candidates[1]
                back_fn = f"{slug}-back.{ext}"
                back_path = os.path.join(images_dir, back_fn)
                with open(back_path, "wb") as f:
                    f.write(img_bytes)
                back_url = f"{images_dir}/{back_fn}".replace("\\", "/")

            badge = {
                "title": title,
                "author": core.get("author", ""),
                "profilePictureUrl": "",
                "frontImageUrl": front_url,
                "backImageUrl": back_url,
                "description": core.get("description", ""),
                "specialInstructions": "",
                "solderingInstructions": core.get("solderingInstructions", ""),
                "solderingDifficulty": core.get("solderingDifficulty", ""),
                "quantityMade": 0,
                "category": category,
                "conferenceYear": CONFERENCE_YEAR,
                "boardHouse": "",
                "howToAcquire": core.get("howToAcquire", ""),
                "rarity": core.get("rarity", ""),
                "timestamp": "",
            }

            badges.append(badge)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(badges, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(badges)} minibadges")
    print(f"- JSON:   {output_path}")
    print(f"- Images: {images_dir}/<slug>-front/back.ext")


if __name__ == "__main__":
    # CLI override: python pdf_to_minibadges_with_images.py input.pdf out.json images_dir
    pdf_arg = sys.argv[1] if len(sys.argv) > 1 else INPUT_PDF
    out_arg = sys.argv[2] if len(sys.argv) > 2 else OUTPUT_JSON
    img_arg = sys.argv[3] if len(sys.argv) > 3 else IMAGES_DIR
    main(pdf_arg, out_arg, img_arg)
