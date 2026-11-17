"""Offline nutrition aggregation for Cooklang recipes.

Looks up ingredient macros in config/nutrition.json (USDA SR Legacy subset),
converts kitchen units to grams, and sums whole-dish / per-serving totals.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

FRONTMATTER_SERVINGS = re.compile(r"^servings:\s*(.+)$", re.MULTILINE)
# @name{qty%unit} or @name{qty} or @name{} — optional note in () after
INGREDIENT = re.compile(
    r"@(?P<name>(?:\./)?[^@{\n]+?)"
    r"\{(?P<body>[^}]*)\}"
    r"(?:\([^)]*\))?"
)
FRACTION = re.compile(
    r"^(?P<a>\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)"
    r"(?:\s*-\s*(?P<b>\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?))?"
    r"(?:\s*(?P<unit>.+))?$"
)

NUTRIENT_KEYS = (
    "kcal",
    "protein_g",
    "fat_g",
    "sat_fat_g",
    "carbs_g",
    "fiber_g",
    "sugars_g",
    "sodium_mg",
)

UNIT_ALIASES = {
    "c": "cup",
    "cups": "cup",
    "t": "tsp",
    "tsp": "tsp",
    "teaspoon": "tsp",
    "teaspoons": "tsp",
    "tbsp": "tbsp",
    "tablespoon": "tbsp",
    "tablespoons": "tbsp",
    "T": "tbsp",
    "g": "g",
    "gram": "g",
    "grams": "g",
    "kg": "kg",
    "oz": "oz",
    "ounce": "oz",
    "ounces": "oz",
    "lb": "lb",
    "lbs": "lb",
    "pound": "lb",
    "pounds": "lb",
    "ml": "ml",
    "milliliter": "ml",
    "milliliters": "ml",
    "millilitre": "ml",
    "cl": "cl",
    "centiliter": "cl",
    "centiliters": "cl",
    "centilitre": "cl",
    "l": "liter",
    "liter": "liter",
    "litre": "liter",
    "clove": "clove",
    "cloves": "clove",
    "sprig": "sprig",
    "sprigs": "sprig",
    "stalk": "stalk",
    "stalks": "stalk",
    "rib": "stalk",
    "ribs": "stalk",
    "pinch": "pinch",
    "pinches": "pinch",
    "small": "small",
    "medium": "medium",
    "large": "large",
    "bag": "bag",
    "packet": "packet",
}


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def parse_number(token: str) -> float | None:
    s = (token or "").strip()
    if not s:
        return None
    mixed = re.match(r"^(\d+)\s+(\d+)/(\d+)$", s)
    if mixed:
        return int(mixed.group(1)) + int(mixed.group(2)) / int(mixed.group(3))
    frac = re.match(r"^(\d+)/(\d+)$", s)
    if frac:
        return int(frac.group(1)) / int(frac.group(2))
    try:
        return float(s)
    except ValueError:
        return None


def parse_quantity_body(body: str) -> tuple[float | None, str]:
    """Return (amount, unit). Amount may be midpoint of a range. Unit may be ''."""
    body = (body or "").strip()
    if not body:
        return None, ""
    # Cooklang uses % between amount and unit: 1/2%cup
    body = body.replace("%", " ", 1)
    body = re.sub(r"\s+", " ", body).strip()
    m = FRACTION.match(body)
    if not m:
        return None, body.lower()
    a = parse_number(m.group("a"))
    b = parse_number(m.group("b")) if m.group("b") else None
    if a is None:
        return None, (m.group("unit") or "").strip().lower()
    amount = (a + b) / 2.0 if b is not None else a
    unit = (m.group("unit") or "").strip().lower()
    return amount, unit


def canonicalize_unit(unit: str) -> str:
    unit = (unit or "").strip().lower()
    if not unit:
        return ""
    return UNIT_ALIASES.get(unit, unit)


def load_nutrition_db(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_servings(cook_text: str) -> float:
    if not cook_text.startswith("---"):
        return 1.0
    end = cook_text.find("\n---", 3)
    if end == -1:
        return 1.0
    fm = cook_text[3:end]
    m = FRONTMATTER_SERVINGS.search(fm)
    if not m:
        return 1.0
    raw = m.group(1).strip().strip("\"'")
    num = re.match(r"(\d+(?:\.\d+)?)", raw)
    if not num:
        return 1.0
    try:
        return float(num.group(1))
    except ValueError:
        return 1.0


def extract_ingredients(cook_text: str) -> list[dict[str, Any]]:
    """Parse @ingredient{qty} occurrences from a .cook body (after frontmatter)."""
    body = cook_text
    if body.startswith("---"):
        end = body.find("\n---", 3)
        if end != -1:
            body = body[end + 4 :]
    items: list[dict[str, Any]] = []
    for m in INGREDIENT.finditer(body):
        name = m.group("name").strip()
        amount, unit = parse_quantity_body(m.group("body"))
        items.append(
            {
                "name": name,
                "amount": amount,
                "unit": canonicalize_unit(unit),
                "raw": m.group(0),
            }
        )
    return items


def resolve_recipe_ref(name: str, recipes_root: Path, from_file: Path) -> Path | None:
    if not name.startswith("./"):
        return None
    # Paths in recipes are relative to recipes root (Cooklang convention in this repo)
    rel = name[2:]
    cand = (recipes_root / f"{rel}.cook").resolve()
    if cand.is_file():
        return cand
    # Also try relative to the current recipe's directory
    cand2 = (from_file.parent / f"{rel}.cook").resolve()
    if cand2.is_file():
        return cand2
    return None


def grams_for(food: dict[str, Any], amount: float | None, unit: str) -> tuple[float | None, str | None]:
    """Convert amount+unit to grams. Returns (grams, error)."""
    units: dict[str, float] = food.get("gramsPerUnit") or {}
    if amount is None:
        # Unitless / no quantity: only count if we have a piece weight
        if "" in units:
            return float(units[""]), None
        return None, "missing_quantity"
    u = canonicalize_unit(unit)
    if u == "liter":
        ml = units.get("ml")
        if ml is not None:
            return amount * 1000.0 * float(ml), None
        return None, "unsupported_unit:liter"
    if u == "cl":
        ml = units.get("ml")
        if ml is not None:
            return amount * 10.0 * float(ml), None
        # Assume ~1 g/ml for cream/wine-like liquids when ml density missing
        return amount * 10.0, None
    if u in units:
        return amount * float(units[u]), None
    # Unitless count with piece weight stored under ""
    if not u and "" in units:
        return amount * float(units[""]), None
    if not u:
        return None, "missing_unit"
    return None, f"unsupported_unit:{u}"


def scale_nutrients(per100g: dict[str, float], grams: float) -> dict[str, float]:
    factor = grams / 100.0
    return {k: float(per100g.get(k, 0.0) or 0.0) * factor for k in NUTRIENT_KEYS}


def empty_nutrients() -> dict[str, float]:
    return {k: 0.0 for k in NUTRIENT_KEYS}


def add_nutrients(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {k: float(a.get(k, 0.0)) + float(b.get(k, 0.0)) for k in NUTRIENT_KEYS}


def round_nutrients(n: dict[str, float]) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in n.items():
        if k == "kcal":
            out[k] = round(v)
        elif k == "sodium_mg":
            out[k] = round(v)
        else:
            out[k] = round(v, 1)
    return out


class NutritionIndex:
    def __init__(self, db: dict[str, Any]):
        self.db = db
        self.alias_to_food: dict[str, str] = {
            normalize_name(k): v for k, v in (db.get("aliasToFood") or {}).items()
        }
        self.foods: dict[str, dict] = db.get("foods") or {}
        self.approx_aliases = {normalize_name(a) for a in (db.get("approxAliases") or [])}

    @classmethod
    def from_path(cls, path: Path) -> "NutritionIndex":
        return cls(load_nutrition_db(path))

    def lookup(self, name: str) -> tuple[dict[str, Any] | None, bool]:
        key = normalize_name(name)
        food_id = self.alias_to_food.get(key)
        if not food_id:
            return None, False
        food = self.foods.get(food_id)
        if not food:
            return None, False
        approx = bool(food.get("approx")) or key in self.approx_aliases
        if key in {normalize_name(a) for a in (food.get("approxAliases") or [])}:
            approx = True
        return food, approx


def compute_recipe_nutrition(
    cook_path: Path,
    recipes_root: Path,
    index: NutritionIndex,
    *,
    _stack: frozenset[Path] | None = None,
) -> dict[str, Any]:
    """Return nutrition summary for one recipe (composed refs expanded)."""
    cook_path = cook_path.resolve()
    stack = _stack or frozenset()
    if cook_path in stack:
        return {
            "total": empty_nutrients(),
            "perServing": empty_nutrients(),
            "servings": 1,
            "coverage": {
                "ingredientMentions": 0,
                "matched": 0,
                "unmatched": [],
                "skipped": [],
                "approx": False,
            },
            "lines": [],
        }

    text = cook_path.read_text(encoding="utf-8")
    servings = read_servings(text) or 1.0
    ingredients = extract_ingredients(text)

    total = empty_nutrients()
    lines: list[dict[str, Any]] = []
    unmatched: list[str] = []
    skipped: list[dict[str, str]] = []
    matched = 0
    mentions = 0
    any_approx = False

    for ing in ingredients:
        name = ing["name"]
        mentions += 1

        ref = resolve_recipe_ref(name, recipes_root, cook_path)
        if ref is not None:
            child = compute_recipe_nutrition(
                ref, recipes_root, index, _stack=stack | {cook_path}
            )
            total = add_nutrients(total, child["total"])
            matched += child["coverage"]["matched"]
            mentions += max(0, child["coverage"]["ingredientMentions"] - 1)
            unmatched.extend(child["coverage"].get("unmatched") or [])
            skipped.extend(child["coverage"].get("skipped") or [])
            any_approx = any_approx or bool(child["coverage"].get("approx"))
            lines.append(
                {
                    "name": name,
                    "kind": "recipe",
                    "kcal": child["total"].get("kcal", 0),
                }
            )
            continue

        food, approx = index.lookup(name)
        if food is None:
            unmatched.append(name)
            skipped.append({"name": name, "reason": "unmatched"})
            continue

        grams, err = grams_for(food, ing["amount"], ing["unit"])
        if grams is None or grams <= 0:
            reason = err or "unconvertible"
            skipped.append({"name": name, "reason": reason})
            # Still count as matched food identity, but not toward totals
            continue

        nutrients = scale_nutrients(food.get("per100g") or {}, grams)
        total = add_nutrients(total, nutrients)
        matched += 1
        if approx:
            any_approx = True
        lines.append(
            {
                "name": name,
                "foodId": food.get("id"),
                "grams": round(grams, 1),
                "kcal": round(nutrients["kcal"]),
                "approx": approx,
            }
        )

    per_serving = empty_nutrients()
    if servings > 0:
        per_serving = {k: total[k] / servings for k in NUTRIENT_KEYS}

    return {
        "total": round_nutrients(total),
        "perServing": round_nutrients(per_serving),
        "servings": servings if servings == int(servings) else servings,
        "coverage": {
            "ingredientMentions": mentions,
            "matched": matched,
            "unmatched": sorted(set(unmatched), key=str.lower),
            "skipped": skipped,
            "approx": any_approx,
            "complete": len(unmatched) == 0
            and not any(s.get("reason") == "unmatched" for s in skipped),
        },
        "lines": lines,
        "source": index.db.get("meta", {}).get("source", "USDA"),
    }
