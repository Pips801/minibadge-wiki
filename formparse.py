#!/usr/bin/env python3
import argparse
import csv
import io
import json
import os
from datetime import datetime
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse, parse_qs

# --------- Config --------------------------------------------------------

DEFAULT_INPUT_CSV_PATH = os.environ.get("MINIBADGE_CSV", "data/google-form-responses.csv")
DEFAULT_OUTPUT_JSON    = os.environ.get("MINIBADGE_JSON", "data/minibadges_from_form.json")
IMAGES_DIR             = os.environ.get("MINIBADGE_IMAGES_DIR", "images")

# Your current Form → JSON mapping
CSV_MAP = { 
    "title":                 "Title of your badge",
    "author":                "Your handle/name",
    "category":              "Type of badge",
    # conferenceYear is derived from timestamp year
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
    "timestamp":             "Timestamp",  # default Google Form timestamp
}

# --------- Helpers -------------------------------------------------------


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
    """
    Convert a badge title into a filesystem-safe slug.
    "Scratch and Sniff!" -> "scratch-and-sniff"
    """
    import re
    t = (title or "").strip().lower()
    t = re.sub(r"['’]", "", t)          # remove apostrophes
    t = re.sub(r"[^a-z0-9]+", "-", t)   # non-alphanum -> dash
    t = re.sub(r"-+", "-", t).strip("-")
    return t or "badge"


def load_csv_reader(csv_url=None, csv_path=None):
    """
    Return a csv.DictReader from either a URL or a local path.
    """
    if csv_url:
        print(f"Fetching CSV from URL: {csv_url}")
        try:
            resp = urlopen(csv_url)
            charset = resp.headers.get_content_charset() or "utf-8"
            text = resp.read().decode(charset, errors="replace")
        except (HTTPError, URLError) as e:
            raise SystemExit(f"Failed to fetch CSV from URL: {e}") from e

        return csv.DictReader(io.StringIO(text))

    csv_path = csv_path or DEFAULT_INPUT_CSV_PATH
    if not os.path.exists(csv_path):
        raise SystemExit(f"CSV file not found: {csv_path}")

    print(f"Reading CSV from file: {csv_path}")
    f = open(csv_path, newline="", encoding="utf-8")
    return csv.DictReader(f)


def derive_year_from_timestamp(ts_raw: str) -> str:
    """
    Derive the conferenceYear from the timestamp string.
    Assumes Google Forms-style "MM/DD/YYYY HH:MM:SS" but
    tries a couple of common variants.
    Returns a string like "2025" or "" if parsing fails.
    """
    ts_raw = (ts_raw or "").strip()
    if not ts_raw:
        return ""

    formats = [
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%m/%d/%Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(ts_raw, fmt)
            return str(dt.year)
        except ValueError:
            continue

    return ""


def google_drive_to_direct(url: str) -> str:
    """
    Convert various Google Drive share URLs into a direct download URL.
    e.g.
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

    # Fallback: return original
    return url


def infer_extension_from_content_type(content_type: str, default="jpg") -> str:
    """
    Map content-type to an extension.
    """
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
    Download an image at image_url into IMAGES_DIR with filename base_name + proper extension.
    Returns a relative path (e.g. 'images/foo-front.jpg') on success,
    or '' on failure.
    """
    if not image_url:
        return ""

    # If it's already a non-http path (e.g. we've already processed it), just return it.
    if not image_url.startswith("http://") and not image_url.startswith("https://"):
        return image_url

    url = google_drive_to_direct(image_url)

    try:
        resp = urlopen(url)
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read()
    except (HTTPError, URLError) as e:
        print(f"[WARN] Failed to download image {image_url}: {e}")
        return ""

    ext = infer_extension_from_content_type(content_type, default="jpg")
    os.makedirs(IMAGES_DIR, exist_ok=True)

    filename = f"{base_name}.{ext}"
    file_path = os.path.join(IMAGES_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(data)

    rel_path = f"{IMAGES_DIR}/{filename}".replace("\\", "/")
    print(f"[INFO] Saved image {image_url} -> {rel_path}")
    return rel_path


# --------- Main ---------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Convert Google Form CSV to minibadges JSON (with images)")
    parser.add_argument(
        "--csv-url",
        help="URL of the CSV export (e.g. Google Form/Sheet 'export?format=csv'). "
             "If omitted, uses MINIBADGE_CSV_URL or GOOGLE_FORM_CSV_URL env, "
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

    reader = load_csv_reader(csv_url=csv_url, csv_path=csv_path)

    badges = []

    for row in reader:
        # Skip rows without a title
        title = _get(row, CSV_MAP["title"])
        if not title:
            continue

        slug = slugify(title)

        # Quantity
        qty_str = _get(row, CSV_MAP["quantityMade"])
        qty = _parse_int(qty_str, default=0)

        # Timestamp + derive year from it
        timestamp_raw = _get(row, CSV_MAP["timestamp"])
        timestamp = timestamp_raw
        conference_year = derive_year_from_timestamp(timestamp_raw)

        # Raw URLs from the form
        raw_profile_url = _get(row, CSV_MAP["profilePictureUrl"])
        raw_front_url   = _get(row, CSV_MAP["frontImageUrl"])
        raw_back_url    = _get(row, CSV_MAP["backImageUrl"])

        # Download images and rewrite URLs
        # Profile picture: optional; if you want local copies, uncomment this:
        profile_url = download_image_to_repo(raw_profile_url, f"{slug}-profile") or raw_profile_url
        # profile_url = raw_profile_url  # leave remote for now, or change to local as above

        front_url = download_image_to_repo(raw_front_url, f"{slug}-front") or raw_front_url
        back_url  = download_image_to_repo(raw_back_url,  f"{slug}-back")  or raw_back_url

        badge = {
            "title":               title,
            "author":              _get(row, CSV_MAP["author"]),
            "profilePictureUrl":   profile_url,
            "frontImageUrl":       front_url,
            "backImageUrl":        back_url,
            "description":         _get(row, CSV_MAP["description"]),
            "specialInstructions": _get(row, CSV_MAP["specialInstructions"]),
            "solderingInstructions": _get(row, CSV_MAP["solderingInstructions"]),
            "solderingDifficulty": _get(row, CSV_MAP["solderingDifficulty"]),
            "quantityMade":        qty,
            "category":            _get(row, CSV_MAP["category"]),
            "conferenceYear":      conference_year,
            "boardHouse":          _get(row, CSV_MAP["boardHouse"]),
            "howToAcquire":        _get(row, CSV_MAP["howToAcquire"]),
            "rarity":              _get(row, CSV_MAP["rarity"]),
            "timestamp":           timestamp,
        }

        badges.append(badge)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(badges, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(badges)} badges to {out_path}")


if __name__ == "__main__":
    main()
