#!/usr/bin/env python3
"""Reorder CookCLI recipe-page ingredient lists by first appearance in the .cook file.

CookCLI's static HTML sorts ingredients alphabetically (case-sensitive), so caps
float above lowercase and use-order is lost. This post-pass restores the order
from `cook recipe -f json`, which follows first appearance in the recipe steps.
Also reorders `cooking-mode-data` section ingredient arrays the same way.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

LI_RE = re.compile(r"<li\b[^>]*>[\s\S]*?</li>", re.IGNORECASE)
UL_RE = re.compile(r"(<ul\b[^>]*>)([\s\S]*?)(</ul>)", re.IGNORECASE)
NAME_RE = re.compile(
    r'class="font-medium[^"]*"[^>]*>([\s\S]*?)</(?:span|a)>',
    re.IGNORECASE,
)
COOKING_MODE_RE = re.compile(
    r'(<script\s+id="cooking-mode-data"[^>]*>)([\s\S]*?)(</script>)',
    re.IGNORECASE,
)
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def appearance_order(repo: Path, cook_path: Path) -> list[str]:
    """Return unique ingredient display names in first-appearance order."""
    proc = subprocess.run(
        ["cook", "recipe", str(cook_path), "-f", "json"],
        cwd=str(repo),
        capture_output=True,
        text=True,
        check=False,
    )
    raw = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    if proc.returncode != 0:
        raise RuntimeError(
            f"cook recipe failed for {cook_path}: {(proc.stderr or proc.stdout or '').strip()}"
        )
    start = raw.find("{")
    if start < 0:
        raise RuntimeError(f"no JSON from cook recipe for {cook_path}")
    data = json.loads(raw[start:])
    names: list[str] = []
    seen: set[str] = set()
    for ing in data.get("ingredients") or []:
        name = (ing.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def li_name(li_html: str) -> str | None:
    m = NAME_RE.search(li_html)
    if not m:
        return None
    text = TAG_RE.sub("", m.group(1))
    text = SPACE_RE.sub(" ", text).strip()
    return text or None


def sort_key(name: str | None, order_index: dict[str, int]) -> tuple[int, int]:
    if name is None:
        return (1, 10**9)
    if name in order_index:
        return (0, order_index[name])
    # Unknown names keep relative order after known ones
    return (1, 10**9)


def reorder_ul_body(body: str, order_index: dict[str, int]) -> str | None:
    items = list(LI_RE.finditer(body))
    if len(items) < 2:
        return None

    # Only reorder if this looks like an ingredient list
    parsed: list[tuple[re.Match[str], str | None]] = []
    named = 0
    for m in items:
        name = li_name(m.group(0))
        if name is not None:
            named += 1
        parsed.append((m, name))
    if named < 2:
        return None

    indexed = list(enumerate(parsed))
    indexed.sort(key=lambda pair: (*sort_key(pair[1][1], order_index), pair[0]))
    new_order = [pair[1][0] for pair in indexed]
    if [m.group(0) for m in new_order] == [m.group(0) for m, _ in parsed]:
        return None

    # Rebuild body preserving non-li text (whitespace between items)
    parts: list[str] = []
    pos = 0
    for old_m, new_m in zip(items, new_order):
        parts.append(body[pos : old_m.start()])
        parts.append(new_m.group(0))
        pos = old_m.end()
    parts.append(body[pos:])
    return "".join(parts)


def find_ingredients_region(html: str) -> tuple[int, int] | None:
    """Return [start, end) spanning Ingredients heading through Cookware (or panel end)."""
    h2_iter = list(
        re.finditer(r"<h2\b[^>]*>[\s\S]*?</h2>", html, re.IGNORECASE)
    )
    start = None
    end = None
    for i, m in enumerate(h2_iter):
        text = SPACE_RE.sub(" ", TAG_RE.sub("", m.group(0))).strip().lower()
        if start is None and "ingredient" in text:
            start = m.end()
            continue
        if start is not None and "cookware" in text:
            end = m.start()
            break
    if start is None:
        return None
    if end is None:
        # Fall back: next h2 after Ingredients, else end of file
        for m in h2_iter:
            if m.start() > start:
                end = m.start()
                break
        end = end or len(html)
    return start, end


def reorder_html_lists(html: str, order_index: dict[str, int]) -> tuple[str, int]:
    region = find_ingredients_region(html)
    if not region:
        return html, 0
    start, end = region
    chunk = html[start:end]
    changed = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal changed
        open_tag, body, close_tag = match.group(1), match.group(2), match.group(3)
        new_body = reorder_ul_body(body, order_index)
        if new_body is None:
            return match.group(0)
        changed += 1
        return f"{open_tag}{new_body}{close_tag}"

    new_chunk = UL_RE.sub(repl, chunk)
    if changed:
        html = html[:start] + new_chunk + html[end:]
    return html, changed


def reorder_cooking_mode(html: str, order_index: dict[str, int]) -> tuple[str, int]:
    m = COOKING_MODE_RE.search(html)
    if not m:
        return html, 0
    try:
        data = json.loads(m.group(2))
    except json.JSONDecodeError:
        return html, 0

    changed = 0
    for section in data.get("sections") or []:
        ings = section.get("ingredients")
        if not isinstance(ings, list) or len(ings) < 2:
            continue
        original = list(ings)

        def key(ing: dict, idx: int) -> tuple[int, int, int]:
            name = (ing.get("name") or "").strip()
            primary, secondary = sort_key(name or None, order_index)
            return (primary, secondary, idx)

        section["ingredients"] = [
            ing for _, ing in sorted(enumerate(ings), key=lambda p: key(p[1], p[0]))
        ]
        if section["ingredients"] != original:
            changed += 1

    if not changed:
        return html, 0

    new_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    html = html[: m.start()] + m.group(1) + new_json + m.group(3) + html[m.end() :]
    return html, changed


def cook_for_recipe_html(recipes_root: Path, html_path: Path, site_recipe_root: Path) -> Path | None:
    try:
        rel = html_path.relative_to(site_recipe_root)
    except ValueError:
        return None
    cook = recipes_root / rel.with_suffix(".cook")
    return cook if cook.is_file() else None


def process_page(
    repo: Path, recipes_root: Path, site_recipe_root: Path, html_path: Path
) -> tuple[bool, str]:
    cook = cook_for_recipe_html(recipes_root, html_path, site_recipe_root)
    if not cook:
        return False, "no matching .cook"
    try:
        names = appearance_order(repo, cook)
    except Exception as exc:  # noqa: BLE001 - report per-file and continue
        return False, str(exc)
    if len(names) < 2:
        return False, "fewer than 2 ingredients"

    order_index = {name: i for i, name in enumerate(names)}
    html = html_path.read_text(encoding="utf-8")
    html, list_changes = reorder_html_lists(html, order_index)
    html, mode_changes = reorder_cooking_mode(html, order_index)
    if not list_changes and not mode_changes:
        return False, "already in appearance order"

    html_path.write_text(html, encoding="utf-8")
    return True, f"lists={list_changes} cooking-mode={mode_changes}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--site", type=Path, required=True, help="CookCLI _site output directory")
    parser.add_argument(
        "--recipes",
        type=Path,
        default=None,
        help="Recipes root (default: <repo>/recipes)",
    )
    args = parser.parse_args()
    recipes_root = args.recipes or (args.repo / "recipes")
    site_recipe_root = args.site / "recipe"
    if not site_recipe_root.is_dir():
        print(f"No recipe pages under {site_recipe_root}", file=sys.stderr)
        return 1

    updated = 0
    skipped = 0
    errors = 0
    for html_path in sorted(site_recipe_root.rglob("*.html")):
        ok, detail = process_page(args.repo, recipes_root, site_recipe_root, html_path)
        rel = html_path.relative_to(args.site).as_posix()
        if ok:
            updated += 1
            print(f"reordered {rel} ({detail})")
        elif detail.startswith("cook recipe failed") or detail.startswith("no JSON"):
            errors += 1
            print(f"error {rel}: {detail}", file=sys.stderr)
        else:
            skipped += 1

    print(
        f"Ingredient appearance order: updated={updated} skipped={skipped} errors={errors}"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
