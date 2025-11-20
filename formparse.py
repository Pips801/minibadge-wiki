#!/usr/bin/env python3
import argparse
import csv
import io
import json
import os
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
import time

# --------- Config ---------

DEFAULT_INPUT_CSV_PATH = os.environ.get("MINIBADGE_CSV", "./form.csv")
DEFAULT_OUTPUT_JSON    = os.environ.get("MINIBADGE_JSON", "./form.json")
IMAGES_DIR             = os.environ.get("MINIBADGE_IMAGES_DIR", "images")

# Logical field -> Google Form header text
CSV_MAP = {
    "title":                 "Title of your badge",
    "author":                "Your handle/name",
    "category":              "Type of badge",
    "conferenceYear":        "Year produced",  # direct from CSV
    "solderingDifficulty":   "Soldering difficulty",
    "rarity":                "Rarity",
    "quantityMade":          "How many did you make?",
    "howToAcquire":          "How do people get one?",
    "boardHouse":            "PCB company used",
    "description":           "Description",
    "specialInstructions":   "Special instructions",
    "solderingInstructions": "Assembly and soldering instructions",
    "profilePictureUrl":     "Your profile picture",
    "frontImageUrl":         "Front image",
    "backImageUrl":          "Back image",
    "timestamp":             "Timestamp",  # Google Form timestamp
}

# --------- Helpers ---------


def _get(row, col_name, default=""):
    if not col_name:
        return default
    val = row.get(col_name, "")
    return val.strip() if isinstance(val, str) else default


def _parse_int(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def slugify(title: str) -> str:
    """Convert a badge title into a filesystem-safe slug."""
    import re
    t = (title or "").strip().lower()
    t = re.sub(r"['’]", "", t)
    t = re.sub(r"[^a-z0-9]+", "-", t)
    t = re.sub(r"-+", "-", t).strip("-")
    return t or "badge"


def badge_key(title: str, year: str):
    """Key used to match CSV rows to existing JSON badges."""
    slug = slugify(title)
    return slug, (year or "").strip()


def load_csv_reader(csv_url=None, csv_path=None):
    """Return a csv.DictReader from either a URL or a local path."""
    if csv_url:
        # Add a cache-busting param so Google doesn't serve stale CSV
        parsed = urlparse(csv_url)
        qs = parse_qs(parsed.query)
        qs["_cb"] = [str(int(time.time()))]  # changes every run
        new_query = urlencode(qs, doseq=True)
        csv_url_nocache = urlunparse(parsed._replace(query=new_query))

        print(f"[INFO] Fetching CSV from URL: {csv_url_nocache}")
        try:
            resp = urlopen(csv_url_nocache)
            charset = resp.headers.get_content_charset() or "utf-8"
            text = resp.read().decode(charset, errors="replace")
        except (HTTPError, URLError) as e:
            raise SystemExit(f"[ERROR] Failed to fetch CSV from URL: {e}") from e

        return csv.DictReader(io.StringIO(text))


def google_drive_to_direct(url: str) -> str:
    """
    Convert Google Drive share URLs to direct download URL.
      https://drive.google.com/open?id=FILEID
      https://drive.google.com/file/d/FILEID/view?usp=sharing
    -> https://drive.google.com/uc?export=download&id=FILEID
    """
    if not url or "drive.google.com" not in url:
        return url

    parsed = urlparse(url)

    # Case 1: /open?id=FILEID
    qs = parse_qs(parsed.query)
    if "id" in qs and qs["id"]:
        file_id = qs["id"][0]
        return f"https://drive.google.com/uc?export=download&id={file_id}"

    # Case 2: /file/d/FILEID/…
    parts = parsed.path.split("/")
    if "file" in parts and "d" in parts:
        try:
            d_idx = parts.index("d")
            file_id = parts[d_idx + 1]
            if file_id:
                return f"https://drive.google.com/uc?export=download&id={file_id}"
        except (ValueError, IndexError):
            pass

    return url


def infer_extension_from_content_type(content_type: str, default="jpg") -> str:
    """Map content-type to an extension."""
    if not content_type:
        return default
    ct = content_type.lower()
    if "jpeg" in ct or "jpg" in ct:
        return "jpg"
    if "png" in ct:
        return "png"
    if "gif" in ct:
        return "gif"
    if "webp" in ct:
        return "webp"
    if "bmp" in ct:
        return "bmp"
    return default


def download_image_to_repo(image_url: str, base_name: str) -> str:
    """
    Download an image into IMAGES_DIR as base_name.<ext>.
    Returns relative path (e.g. 'images/foo-front.jpg') on success,
    or the original URL if download fails.
    """
    if not image_url:
        return ""

    if not image_url.startswith(("http://", "https://")):
        # Already local
        return image_url

    url = google_drive_to_direct(image_url)

    try:
        resp = urlopen(url)
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read()
    except (HTTPError, URLError) as e:
        print(f"[WARN] Failed to download image {image_url}: {e}")
        return image_url  # fall back to remote URL

    ext = infer_extension_from_content_type(content_type, default="jpg")
    os.makedirs(IMAGES_DIR, exist_ok=True)

    filename = f"{base_name}.{ext}"
    file_path = os.path.join(IMAGES_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(data)

    rel_path = f"{IMAGES_DIR}/{filename}".replace("\\", "/")
    print(f"[INFO] Saved image {image_url} -> {rel_path}")
    return rel_path


def normalize_header(s: str) -> str:
    """lowercase, trim, collapse internal whitespace for matching."""
    return " ".join((s or "").strip().lower().split())


def resolve_headers(fieldnames, csv_map):
    """
    Build a mapping from logical field (title, author, profilePictureUrl, etc.)
    to the *actual* CSV header in this file, using fuzzy, case-insensitive matching.
    """
    norm_to_actual = {normalize_header(h): h for h in fieldnames if h}

    resolved = {}
    for logical, expected_header in csv_map.items():
        if not expected_header:
            resolved[logical] = None
            continue

        target_norm = normalize_header(expected_header)

        # Exact normalized match
        actual = norm_to_actual.get(target_norm)
        if actual:
            resolved[logical] = actual
            continue

        # Fuzzy: look for header that contains the target or vice versa
        best = None
        for h in fieldnames:
            nh = normalize_header(h)
            if not nh:
                continue
            if target_norm in nh or nh in target_norm:
                best = h
                break

        resolved[logical] = best

        if best is None:
            print(f"[WARN] Could not find CSV column for logical '{logical}' "
                  f"(expected header like '{expected_header}')")
        else:
            print(f"[INFO] Mapped logical '{logical}' -> CSV column '{best}'")

    return resolved


# --------- Main ---------


def main():
    parser = argparse.ArgumentParser(
        description="Convert Google Form CSV to minibadges JSON (update fields, reuse images)."
    )
    parser.add_argument(
        "--csv-url",
        help="URL of the CSV export (Google Sheet 'export?format=csv'). "
             "If omitted, uses MINIBADGE_CSV_URL/GOOGLE_FORM_CSV_URL env, "
             "then falls back to local CSV path.",
    )
    parser.add_argument(
        "--csv-path",
        default=DEFAULT_INPUT_CSV_PATH,
        help=f"Local CSV path fallback (default: {DEFAULT_INPUT_CSV_PATH})",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_JSON,
        help=f"Output JSON path (default: {DEFAULT_OUTPUT_JSON})",
    )

    args = parser.parse_args()

    # Determine CSV source
    csv_url_env = os.environ.get("MINIBADGE_CSV_URL") or os.environ.get("GOOGLE_FORM_CSV_URL")
    csv_url = args.csv_url or csv_url_env
    csv_path = None if csv_url else args.csv_path
    out_path = args.output

    print(f"[INFO] Output JSON will be: {out_path}")

    # Load existing JSON as badge/image cache
    existing_by_key = {}
    if os.path.exists(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                existing_badges = json.load(f) or []
            for b in existing_badges:
                k = badge_key(b.get("title"), b.get("conferenceYear", ""))
                existing_by_key[k] = b
            print(f"[INFO] Loaded {len(existing_badges)} existing badges from {out_path}")
        except Exception as e:
            print(f"[WARN] Failed to load existing JSON from {out_path}: {e}")
            existing_by_key = {}
    else:
        print(f"[INFO] No existing JSON at {out_path}, starting fresh.")

    reader = load_csv_reader(csv_url=csv_url, csv_path=csv_path)

    if not reader.fieldnames:
        raise SystemExit("[ERROR] CSV appears to have no header row (fieldnames is empty).")

    print(f"[INFO] CSV headers: {reader.fieldnames}")
    header_map = resolve_headers(reader.fieldnames, CSV_MAP)

    badges = []
    row_count = 0
    new_count = 0
    reused_count = 0

    for row in reader:
        row_count += 1
        title = _get(row, header_map["title"])
        timestamp = _get(row, header_map["timestamp"])
        year = _get(row, header_map["conferenceYear"])

        # Completely empty row?
        if not title and not timestamp and not year:
            continue

        slug = slugify(title) if title else "badge"
        key = badge_key(title, year)
        existing = existing_by_key.get(key)

        qty_str = _get(row, header_map["quantityMade"])
        qty = _parse_int(qty_str, default=0)

        raw_profile_url = _get(row, header_map["profilePictureUrl"])
        raw_front_url   = _get(row, header_map["frontImageUrl"])
        raw_back_url    = _get(row, header_map["backImageUrl"])

        if existing:
            # Reuse image URLs, update all other fields
            profile_url = existing.get("profilePictureUrl", "")
            front_url   = existing.get("frontImageUrl", "")
            back_url    = existing.get("backImageUrl", "")
            reused_count += 1
        else:
            # First time we've seen this badge-year: download images
            profile_url = download_image_to_repo(raw_profile_url, f"{slug}-profile") or raw_profile_url
            front_url   = download_image_to_repo(raw_front_url,  f"{slug}-front")   or raw_front_url
            back_url    = download_image_to_repo(raw_back_url,   f"{slug}-back")    or raw_back_url
            new_count += 1

        badge = {
            "title":               title,
            "author":              _get(row, header_map["author"]),
            "profilePictureUrl":   profile_url,
            "frontImageUrl":       front_url,
            "backImageUrl":        back_url,
            "description":         _get(row, header_map["description"]),
            "specialInstructions": _get(row, header_map["specialInstructions"]),
            "solderingInstructions": _get(row, header_map["solderingInstructions"]),
            "solderingDifficulty": _get(row, header_map["solderingDifficulty"]),
            "quantityMade":        qty,
            "category":            _get(row, header_map["category"]),
            "conferenceYear":      year,
            "boardHouse":          _get(row, header_map["boardHouse"]),
            "howToAcquire":        _get(row, header_map["howToAcquire"]),
            "rarity":              _get(row, header_map["rarity"]),
            "timestamp":           timestamp,
        }

        badges.append(badge)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(badges, f, ensure_ascii=False, indent=2)

    print(f"[INFO] Processed {row_count} CSV rows")
    print(f"[INFO] Wrote {len(badges)} badges to {out_path}")
    print(f"[INFO] New badges this run (images downloaded): {new_count}")
    print(f"[INFO] Existing badges updated (images reused): {reused_count}")
    if not badges:
        print("[WARN] No badges produced. Check your CSV headers and CSV_MAP.")


if __name__ == "__main__":
    main()
