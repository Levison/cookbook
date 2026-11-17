#!/usr/bin/env python3
"""Quick checks for nutritionlib quantity parsing and aggregation."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from nutritionlib import (  # noqa: E402
    NutritionIndex,
    compute_recipe_nutrition,
    grams_for,
    parse_quantity_body,
)


class ParseQuantityTests(unittest.TestCase):
    def test_fraction_cup(self):
        amount, unit = parse_quantity_body("1/2%cup")
        self.assertAlmostEqual(amount, 0.5)
        self.assertEqual(unit, "cup")

    def test_range_midpoint(self):
        amount, unit = parse_quantity_body("4-5%cloves")
        self.assertAlmostEqual(amount, 4.5)
        self.assertEqual(unit, "cloves")

    def test_cl(self):
        amount, unit = parse_quantity_body("10%cl")
        self.assertAlmostEqual(amount, 10.0)
        self.assertEqual(unit, "cl")


class NutritionDbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ROOT / "config" / "nutrition.json"
        cls.index = NutritionIndex.from_path(path)

    def test_olive_oil_tbsp(self):
        food, _ = self.index.lookup("olive oil")
        self.assertIsNotNone(food)
        grams, err = grams_for(food, 1.0, "tbsp")
        self.assertIsNone(err)
        self.assertGreater(grams, 10)

    def test_overnight_oats_has_calories(self):
        cook = ROOT / "recipes" / "breakfast" / "Overnight Oats.cook"
        nut = compute_recipe_nutrition(cook, ROOT / "recipes", self.index)
        self.assertGreater(nut["perServing"]["kcal"], 100)
        self.assertEqual(nut["coverage"]["unmatched"], [])

    def test_composed_macarons_include_ganache(self):
        cook = ROOT / "recipes" / "desserts" / "Macarons au Chocolat.cook"
        nut = compute_recipe_nutrition(cook, ROOT / "recipes", self.index)
        food_ids = {line.get("foodId") for line in nut["lines"] if line.get("foodId")}
        # Either dark chocolate from ganache expansion or recipe line present
        self.assertTrue(
            "dark-chocolate" in food_ids
            or any(line.get("kind") == "recipe" for line in nut["lines"])
        )

    def test_thai_green_curry_coverage(self):
        cook = ROOT / "recipes" / "mains" / "Chicken Thai Green Curry.cook"
        nut = compute_recipe_nutrition(cook, ROOT / "recipes", self.index)
        self.assertEqual(nut["coverage"]["unmatched"], [])
        self.assertGreater(nut["perServing"]["kcal"], 200)
        # Coconut milk measured in cans should convert
        self.assertFalse(
            any(s.get("reason") == "unsupported_unit:cans" for s in nut["coverage"]["skipped"])
        )


if __name__ == "__main__":
    raise SystemExit(unittest.main())
