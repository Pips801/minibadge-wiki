#!/usr/bin/env python3
import argparse
import json
import re
import shutil
import html
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# -------------------------
# Configuration / Heuristics
# -------------------------

# Separators we will treat as "multiple authors"
# (We normalize all to the chosen join token)
# Include HTML-encoded '&amp;' as a separator to handle inputs pasted from HTML.
SPLIT_RE = re.compile(r"""
    \s*(?:,|/|\||\+|;|\band\b|\&|\u0026|&amp;)\s*
""", re.IGNORECASE | re.VERBOSE)

# Some strings should remain intact (not split), even if they contain '&' etc.
# Add more exceptions here as you find them.
PROTECTED_PATTERNS = [
    re.compile(r"\bmr\.?\s*&\s*mrs\.?\b", re.IGNORECASE),   # Mr. & Mrs.
    re.compile(r"\bmr\.?\s+and\s+mrs\.?\b", re.IGNORECASE), # Mr and Mrs
    re.compile(r"\bPB&J\b", re.IGNORECASE), # PB&J (must be exactly PB&J, no spaces)
]

# Author tokens that are effectively empty / garbage after cleaning
EMPTY_TOKENS = {"", "@", "n/a", "na", "none", "unknown"}


# -------------------------
# Normalization helpers
# -------------------------

def strip_leading_at(name: str) -> str:
    name = name.strip()
    # remove one or more leading @
    name = re.sub(r"^@+", "", name).strip()
    return name

def collapse_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def is_all_lower(s: str) -> bool:
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all(c.islower() for c in letters)

def has_upper(s: str) -> bool:
    return any(c.isupper() for c in s)

def canonical_key(s: str) -> str:
    # Case-insensitive key + trim spaces
    return collapse_spaces(s).casefold()

def is_protected_author_string(author_field: str) -> bool:
    a = author_field.strip()
    for pat in PROTECTED_PATTERNS:
        if pat.search(a):
            return True
    return False

def split_authors(author_field: str) -> Tuple[List[str], List[str]]:
    """
    Split into tokens. Returns (tokens, warnings)
    If protected, returns [original] and warning.
    """
    warnings = []
    raw = collapse_spaces(author_field)

    # Normalize common HTML-encoded entities (e.g. &amp;) so separators are detected.
    raw = html.unescape(raw)

    if not raw:
        return [], warnings

    if is_protected_author_string(raw):
        # Do not split; keep as-is
        warnings.append(f"Protected pattern matched; leaving author string intact: {raw!r}")
        return [raw], warnings

    # Split
    parts = SPLIT_RE.split(raw)
    cleaned = []
    for p in parts:
        p2 = collapse_spaces(strip_leading_at(p))
        if canonical_key(p2) in EMPTY_TOKENS or p2 == "":
            continue
        cleaned.append(p2)

    # Warn on suspicious cases
    if any(sym in raw for sym in ["&", "/", "|", "+", ",", ";"]) and len(cleaned) <= 1:
        warnings.append(f"Contains separator(s) but parsed as <=1 author; check manually: {raw!r}")

    return cleaned, warnings

def join_authors(tokens: List[str], join_token: str) -> str:
    if not tokens:
        return ""
    if len(tokens) == 1:
        return tokens[0]
    return join_token.join(tokens)


# -------------------------
# Canonical capitalization chooser
# -------------------------

def capitalization_score(s: str) -> int:
    """
    Higher is 'better' canonical.
    Rules (roughly matching your request):
    - Prefer tokens that contain uppercase letters over all-lowercase.
    - Otherwise, keep first-seen of the best group.
    """
    s = s.strip()
    if not s:
        return -1
    if is_all_lower(s):
        return 0
    if has_upper(s):
        return 2
    return 1

def choose_canonical_variants(observed_variants: Counter) -> str:
    """
    observed_variants: Counter of variants for one key
    Returns the best canonical string.
    Priority:
      1) highest capitalization_score
      2) highest frequency
      3) longest (as weak tie-break)
      4) stable lexicographic
    """
    candidates = list(observed_variants.items())  # (variant, count)
    candidates.sort(
        key=lambda vc: (
            capitalization_score(vc[0]),
            vc[1],
            len(vc[0]),
            vc[0],
        ),
        reverse=True
    )
    return candidates[0][0]


# -------------------------
# Main processing
# -------------------------

def load_json(path: Path) -> List[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path}: JSON root must be a list")
    # ensure dict entries
    for i, obj in enumerate(data):
        if not isinstance(obj, dict):
            raise ValueError(f"{path}: element {i} is not an object")
    return data

def build_global_canonical_map(files_data: Dict[Path, List[dict]]) -> Dict[str, str]:
    """
    Walk all files, split authors, remove @, gather variants by casefold key.
    """
    variants_by_key: Dict[str, Counter] = defaultdict(Counter)

    for path, items in files_data.items():
        for obj in items:
            raw = obj.get("author", "") or ""
            tokens, _warnings = split_authors(raw)
            for t in tokens:
                k = canonical_key(t)
                if k and k not in EMPTY_TOKENS:
                    variants_by_key[k][t] += 1

    canonical_map: Dict[str, str] = {}
    for k, counter in variants_by_key.items():
        canonical_map[k] = choose_canonical_variants(counter)

    return canonical_map

def process_files(
    files_data: Dict[Path, List[dict]],
    join_token: str,
    canonical_map: Dict[str, str],
    verbose: bool = True
) -> Tuple[Dict[Path, List[dict]], List[str], int]:
    """
    Return (updated_data, logs, change_count)
    Does NOT write to disk.
    """
    logs: List[str] = []
    change_count = 0

    for path, items in files_data.items():
        for idx, obj in enumerate(items):
            old_author = (obj.get("author", "") or "").strip()
            title = (obj.get("title", "") or "").strip()

            tokens, warnings = split_authors(old_author)

            # If empty author field, keep it empty
            if not old_author and not tokens:
                continue

            # Canonicalize tokens
            new_tokens = []
            token_changes = []
            for t in tokens:
                t_clean = collapse_spaces(strip_leading_at(t))
                k = canonical_key(t_clean)
                canon = canonical_map.get(k, t_clean)

                if t_clean != canon:
                    token_changes.append(f"{t_clean!r} -> {canon!r}")
                new_tokens.append(canon)

            # De-dupe tokens (case-insensitive)
            seen = set()
            deduped = []
            for t in new_tokens:
                k = canonical_key(t)
                if k in seen:
                    continue
                seen.add(k)
                deduped.append(t)

            # Canonicalize multi-author GROUP ordering so "A + B" == "B + A"
            # Sort by case-insensitive key, then by the display string for stability.
            if len(deduped) > 1:
                deduped = sorted(deduped, key=lambda s: (canonical_key(s), s))

            new_author = join_authors(deduped, join_token).strip()


            # Keep protected strings exactly as-is, except remove leading @ if the whole thing started with it
            # (split_authors() returns [raw] for protected; we keep it.
            if is_protected_author_string(old_author.strip()):
                protected = collapse_spaces(strip_leading_at(old_author))
                new_author = protected
                if protected != old_author.strip():
                    # Log this small cleanup
                    token_changes.append(f"Protected cleanup: {old_author.strip()!r} -> {protected!r}")

            # Warnings/oddities
            for w in warnings:
                logs.append(f"[ODDITY] {path.name} | {title or f'item#{idx}'} | {w}")

            if old_author != new_author:
                change_count += 1
                if verbose:
                    logs.append(
                        f"[CHANGE] {path.name} | {title or f'item#{idx}'}\n"
                        f"  old: {old_author!r}\n"
                        f"  new: {new_author!r}"
                    )
                    if token_changes:
                        logs.append("  token fixes: " + "; ".join(token_changes))

                obj["author"] = new_author

    return files_data, logs, change_count


def write_files_with_backup(files_data: Dict[Path, List[dict]]) -> None:
    for path, items in files_data.items():
        bak = path.with_suffix(path.suffix + ".bak")
        shutil.copy2(path, bak)
        path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Normalize minibadge author fields across multiple JSON files (case-dedupe, @ removal, multi-author join token)."
    )
    ap.add_argument("json_files", nargs="+", help="List of JSON files to process (e.g. 2022.json 2023.json 2024.json)")
    ap.add_argument("--join", required=True, help="Join token for multiple authors, e.g. ' + ' or ' | ' or ' & '")
    ap.add_argument("--quiet", action="store_true", help="Less verbose output (still prints summary + oddities)")
    args = ap.parse_args()

    join_token = args.join
    verbose = not args.quiet

    paths = [Path(p).expanduser().resolve() for p in args.json_files]
    for p in paths:
        if not p.exists():
            raise FileNotFoundError(f"Not found: {p}")

    # Load all
    files_data: Dict[Path, List[dict]] = {p: load_json(p) for p in paths}

    # Build canonical map across ALL files
    canonical_map = build_global_canonical_map(files_data)

    # Apply normalization in-memory
    updated_data, logs, change_count = process_files(files_data, join_token, canonical_map, verbose=verbose)

    # Print logs
    for line in logs:
        print(line)

    # Summary
    print("\n--- Summary ---")
    print(f"Files: {len(paths)}")
    print(f"Author fields changed: {change_count}")
    print(f"Canonical author keys known: {len(canonical_map)}")
    print(f"Join token: {join_token!r}")

    # Prompt
    if change_count == 0:
        print("\nNo changes to apply.")
        return 0

    resp = input("\nApply these changes to ALL files? (y/N): ").strip().lower()
    if resp not in ("y", "yes"):
        print("Aborted. No files written.")
        return 0

    # Write with backups
    write_files_with_backup(updated_data)
    print("\nDone. Wrote updated JSON and created .bak backups for each file.")

    # Ask whether to delete the .bak backup files
    resp2 = input("\nDelete .bak backup files? (y/N): ").strip().lower()
    if resp2 in ("y", "yes"):
        deleted = 0
        for p in paths:
            bak = p.with_suffix(p.suffix + ".bak")
            try:
                if bak.exists():
                    bak.unlink()
                    deleted += 1
            except Exception as e:
                print(f"[WARN] Failed to delete backup {bak}: {e}")
        print(f"Deleted {deleted} backup file{'' if deleted == 1 else 's'}.")
    else:
        print("Keeping .bak backup files.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
