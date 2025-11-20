#!/usr/bin/env python3
import argparse
import csv
import io
import json
import os
from datetime import datetime
from urllib.request import urlopen
from urllib.error import URLError, HTTPError

# Default paths / settings (can be overridden by env or CLI)
DEFAULT_INPUT_CSV_PATH = os.environ.get("MINIBADGE_CSV", "./google-form-responses.csv")
DEFAULT_OUTPUT_JSON    = os.environ.get("MINIBADGE_JSON", "./minibadges_from_form.json")

# Map JSON fields -> CSV column headers from the Google Form.
# *** CHANGE THE RIGHT-HAND SIDE STRINGS TO MATCH YOUR ACTUAL CSV HEADERS ***
CSV_MAP = {
    "title":                 "Title of your badge",
    "author":                "Your handle/name",
    "category":              "Type of badge",
    # conferenceYear is now derived from timestamp year; no CSV column needed
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

    # Fallback: local file
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
      "%m/%d/%Y %H:%M",       # sometimes seconds are omitted
      "%Y-%m-%d %H:%M:%S",    # ISO-ish
      "%Y-%m-%d %H:%M",       # ISO-ish without seconds
      "%m/%d/%Y"              # date only
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(ts_raw, fmt)
            return str(dt.year)
        except ValueError:
            continue

    # Couldn’t parse; return empty and keep the raw timestamp as-is
    return ""


def main():
    parser = argparse.ArgumentParser(description="Convert Google Form CSV to minibadges JSON")
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

        # Quantity
        qty_str = _get(row, CSV_MAP["quantityMade"])
        qty = _parse_int(qty_str, default=0)

        # Timestamp + derive year from it
        timestamp_raw = _get(row, CSV_MAP["timestamp"])
        timestamp = timestamp_raw
        conference_year = derive_year_from_timestamp(timestamp_raw)

        badge = {
            "title":               title,
            "author":              _get(row, CSV_MAP["author"]),
            "profilePictureUrl":   _get(row, CSV_MAP["profilePictureUrl"]),
            "frontImageUrl":       _get(row, CSV_MAP["frontImageUrl"]),
            "backImageUrl":        _get(row, CSV_MAP["backImageUrl"]),
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
