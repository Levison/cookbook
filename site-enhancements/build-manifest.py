#!/usr/bin/env python3
"""Build recipes-manifest.json from Cooklang recipes via cook shopping-list.

Each recipe gets an expanded, aisle-grouped ingredient list (composed recipes
are inlined the same way as `cook shopping-list`). Used by the Plan page to
add whole recipes to the grocery cart.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

FRONTMATTER_TITLE = re.compile(r"^title:\s*(.+)$", re.MULTILINE)
SECTION = re.compile(r"^\[([^\]]+)\]\s*$")
# CookCLI pads with spaces, but long names may leave only a single space before qty.
# Quantities start with a digit or simple fraction (e.g. 1, 1/2, 4-5, 1.173).
ITEM = re.compile(r"^(.+?)\s+(\d[\d./\-]*(?:\s+.+)?)\s*$")


def read_title(cook_path: Path) -> str:
    text = cook_path.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            fm = text[3:end]
            m = FRONTMATTER_TITLE.search(fm)
            if m:
                return m.group(1).strip().strip("\"'")
    return cook_path.stem


def parse_shopping_list(stdout: str) -> list[dict]:
    aisle = "other"
    items: list[dict] = []
    for raw in stdout.splitlines():
        line = raw.rstrip()
        if not line or line.startswith("WARN") or line.startswith("Error"):
            continue
        sec = SECTION.match(line)
        if sec:
            aisle = sec.group(1).strip().lower()
            continue
        m = ITEM.match(line)
        if m:
            name = m.group(1).strip()
            qty = m.group(2).strip()
            if name:
                items.append({"name": name, "quantity": qty, "aisle": aisle})
            continue
        # Name-only line (no quantity)
        if line and not line.startswith("["):
            items.append({"name": line.strip(), "quantity": "", "aisle": aisle})
    return items


def shopping_list_for(repo: Path, rel_cook: str) -> list[dict]:
    aisle_conf = repo / "config" / "aisle.conf"
    cmd = ["cook", "shopping-list", "--base-path", "recipes", rel_cook]
    if aisle_conf.is_file():
        cmd[2:2] = ["-a", str(aisle_conf)]
    proc = subprocess.run(
        cmd,
        cwd=str(repo),
        capture_output=True,
        text=True,
        check=False,
    )
    out = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    if proc.returncode != 0:
        print(f"warn: shopping-list failed for {rel_cook}: {proc.stderr.strip()}", file=sys.stderr)
        return []
    return parse_shopping_list(proc.stdout or "")


def recipe_href(base_prefix: str, chapter: str, stem: str) -> str:
    # Matches CookCLI static output: /cookbook/recipe/mains/Name.html
    prefix = base_prefix.rstrip("/") if base_prefix else ""
    path = f"/recipe/{chapter}/{stem}.html"
    return f"{prefix}{path}" if prefix else path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--base-prefix", default="", help="Site base path e.g. /cookbook")
    args = parser.parse_args()

    recipes_root = args.repo / "recipes"
    recipes: list[dict] = []

    for cook in sorted(recipes_root.rglob("*.cook")):
        rel = cook.relative_to(recipes_root).as_posix()
        chapter = cook.parent.name
        title = read_title(cook)
        ingredients = shopping_list_for(args.repo, rel)
        recipes.append(
            {
                "id": rel,
                "title": title,
                "chapter": chapter,
                "cookPath": rel,
                "href": recipe_href(args.base_prefix, chapter, cook.stem),
                "ingredientCount": len(ingredients),
                "ingredients": ingredients,
            }
        )

    chapters = sorted({r["chapter"] for r in recipes})
    payload = {
        "generatedBy": "site-enhancements/build-manifest.py",
        "recipeCount": len(recipes),
        "chapters": chapters,
        "recipes": recipes,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.out} ({len(recipes)} recipes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
