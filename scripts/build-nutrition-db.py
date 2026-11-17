#!/usr/bin/env python3
"""Build config/nutrition.json from USDA SR Legacy CSVs + ingredient map.

Downloads are not committed. Point --usda-dir at an extracted SR Legacy CSV
folder (FoodData_Central_sr_legacy_food_csv_2018-04). Full SR Legacy is ~40MB
unzipped — too large for the repo — so we ship only the curated subset.

Usage:
  python3 scripts/build-nutrition-db.py --usda-dir /path/to/FoodData_Central_sr_legacy_food_csv_2018-04
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

# Nutrient ids in USDA food_nutrient.csv
NUTRIENTS = {
    1008: "kcal",  # Energy
    1003: "protein_g",
    1004: "fat_g",
    1258: "sat_fat_g",
    1005: "carbs_g",
    1079: "fiber_g",
    2000: "sugars_g",
    1093: "sodium_mg",
}

# Measure unit ids → kitchen unit keys we understand
UNIT_IDS = {
    1000: "cup",
    1001: "tbsp",
    1002: "tsp",
    1004: "ml",
    1009: "fl_oz",
}

# Canonical foods used by this cookbook.
# aliases: recipe / aisle.conf names (lowercase match)
# fdc_id: USDA SR Legacy food
# units_override: grams per kitchen unit when USDA portions are missing/wrong
# piece_g: grams for a unitless count of 1 (egg, onion, tortilla, …)
# skip: true → zero contribution (water, optional garnish without qty)
FOODS: list[dict] = [
    # Oils & fats
    {
        "id": "olive-oil",
        "fdc_id": 171413,
        "aliases": [
            "olive oil",
            "extra-virgin olive oil",
            "extra virgin olive oil",
            "oil",
        ],
        "units_override": {"ml": 0.91, "tsp": 4.5, "tbsp": 13.5, "cup": 216},
    },
    {
        "id": "vegetable-oil",
        "fdc_id": 171411,  # soybean oil as generic vegetable oil
        "aliases": ["vegetable oil"],
        "units_override": {"ml": 0.92, "tsp": 4.5, "tbsp": 13.6, "cup": 218},
    },
    {
        "id": "canola-oil",
        "fdc_id": 172336,
        "aliases": ["canola oil"],
        "units_override": {"ml": 0.92, "tsp": 4.5, "tbsp": 14, "cup": 218},
    },
    {
        "id": "sesame-oil",
        "fdc_id": 171016,
        "aliases": ["sesame oil"],
        "units_override": {"ml": 0.92, "tsp": 4.5, "tbsp": 13.6, "cup": 218},
    },
    {
        "id": "butter",
        "fdc_id": 173430,  # unsalted
        "aliases": ["butter", "unsalted butter", "soft butter"],
        "units_override": {"tsp": 4.7, "tbsp": 14.2, "cup": 227},
    },
    {
        "id": "salted-butter",
        "fdc_id": 173410,
        "aliases": [],  # kept for completeness; recipes prefer unsalted
        "units_override": {"tsp": 4.7, "tbsp": 14.2, "cup": 227},
    },
    {
        "id": "ghee",
        "fdc_id": 173412,  # Butter oil, anhydrous ≈ ghee
        "aliases": ["ghee", "vegan butter"],  # vegan butter ≈ similar fat density; approx
        "units_override": {"tsp": 4.3, "tbsp": 12.8, "cup": 205},
        "approx_aliases": ["vegan butter"],
    },
    # Dairy
    {
        "id": "milk-whole",
        "fdc_id": 171265,
        "aliases": ["milk"],
        "units_override": {"ml": 1.03, "cup": 244, "tbsp": 15.3, "tsp": 5.1},
    },
    {
        "id": "milk-fat-free",
        "fdc_id": 171269,
        "aliases": ["fat-free milk"],
        "units_override": {"ml": 1.04, "cup": 245, "tbsp": 15.3, "tsp": 5.1},
    },
    {
        "id": "plant-milk",
        "fdc_id": 173768,  # Soymilk light unsweetened as stand-in for plant milk
        "aliases": ["unsweetened plant milk"],
        "units_override": {"ml": 1.04, "cup": 243, "tbsp": 15, "tsp": 5},
        "approx": True,
    },
    {
        "id": "heavy-cream",
        "fdc_id": 170859,
        "aliases": ["heavy cream"],
        "units_override": {"ml": 0.994, "cup": 238, "tbsp": 15, "tsp": 5},
    },
    {
        "id": "sour-cream",
        "fdc_id": 171257,
        "aliases": ["sour cream"],
        "units_override": {"cup": 230, "tbsp": 12, "tsp": 4},
    },
    {
        "id": "greek-yogurt",
        "fdc_id": 170894,  # Greek plain nonfat
        "aliases": ["Greek yogurt", "plain yogurt", "unsweetened plant yogurt"],
        "units_override": {"cup": 245, "tbsp": 15, "tsp": 5},
        "approx_aliases": ["unsweetened plant yogurt"],
    },
    {
        "id": "cheddar",
        "fdc_id": 173414,
        "aliases": ["Cheddar cheese", "sharp cheddar", "Gouda"],
        "units_override": {"cup": 113},  # shredded
        "approx_aliases": ["Gouda"],
    },
    {
        "id": "monterey-jack",
        "fdc_id": 170844,
        "aliases": ["Monterey Jack cheese", "pepper Jack cheese", "pepper jack cheese"],
    },
    {
        "id": "parmesan",
        "fdc_id": 171247,
        "aliases": ["Parmesan cheese", "parmesan"],
        "units_override": {"cup": 100, "tbsp": 5},
    },
    {
        "id": "mozzarella",
        "fdc_id": 170845,
        "aliases": [
            "mozzarella",
            "fresh mozzarella",
            "grated mozzarella",
            "mozzarella cheese",
        ],
        "units_override": {"cup": 112},
    },
    {
        "id": "goat-cheese",
        "fdc_id": 173435,  # Cheese, goat, soft type
        "aliases": ["goat cheese"],
        "units_override": {"cup": 140, "tbsp": 14},
    },
    {
        "id": "egg",
        "fdc_id": 171287,
        "aliases": ["egg", "eggs"],
        "piece_g": 50,
        "units_override": {"large": 50},
    },
    {
        "id": "egg-white",
        "fdc_id": 172183,
        "aliases": ["egg whites"],
        "piece_g": 33,
    },
    # Meat
    {
        "id": "chicken-thigh",
        "fdc_id": 173627,  # Chicken dark meat thigh, meat only, raw
        "aliases": [
            "boneless skinless chicken thighs",
            "chicken thighs",
            "chicken",
        ],
        "piece_g": 110,  # typical boneless thigh
    },
    {
        "id": "chicken-breast",
        "fdc_id": 171077,
        "aliases": [
            "boneless skinless chicken breasts",
            "chicken breasts",
        ],
        "piece_g": 170,
    },
    {
        "id": "bacon",
        "fdc_id": 168277,  # Pork, cured, bacon, unprepared
        "aliases": ["bacon"],
    },
    {
        "id": "andouille",
        "fdc_id": 171631,  # Sausage, Italian, pork, mild, raw (stand-in)
        "aliases": ["sausage", "andouille sausage", "kielbasa"],
        "approx": True,
    },
    {
        "id": "ground-turkey",
        "fdc_id": 172850,  # Turkey, ground, 93% lean, 7% fat, raw
        "aliases": ["lean ground turkey"],
    },
    {
        "id": "anchovy",
        "fdc_id": 174183,  # Fish, anchovy, european, canned in oil, drained
        "aliases": ["anchovy fillets"],
        "piece_g": 4,
    },
    # Produce
    {
        "id": "onion",
        "fdc_id": 170000,  # Onions, raw
        "aliases": ["onion", "onions", "yellow onion", "red onion", "red onions"],
        "piece_g": 110,
        "units_override": {"small": 70, "medium": 110, "large": 150, "cup": 160},
    },
    {
        "id": "scallion",
        "fdc_id": 170005,  # Onions, spring or scallions (includes tops and bulb), raw
        "aliases": ["scallions", "green onions", "spring onions"],
        "piece_g": 15,
        "units_override": {"cup": 100, "tbsp": 6, "tsp": 2},
    },
    {
        "id": "garlic",
        "fdc_id": 169230,
        "aliases": ["garlic", "garlic clove", "garlic cloves"],
        "piece_g": 3,
        "units_override": {"clove": 3, "cloves": 3, "tsp": 2.8, "tbsp": 8.4},
    },
    {
        "id": "ginger",
        "fdc_id": 169231,
        "aliases": ["ginger"],
        "units_override": {"tsp": 2, "tbsp": 6, "cup": 96},
    },
    {
        "id": "carrot",
        "fdc_id": 170393,
        "aliases": ["carrot", "carrots", "shredded carrots"],
        "units_override": {"cup": 110},
    },
    {
        "id": "celery",
        "fdc_id": 169988,
        "aliases": ["celery"],
        "units_override": {"cup": 101, "stalk": 40},
    },
    {
        "id": "spinach",
        "fdc_id": 168462,
        "aliases": ["spinach", "fresh spinach"],
        "units_override": {"cup": 30, "bag": 280},  # typical bag ~10 oz
    },
    {
        "id": "romaine",
        "fdc_id": 169247,
        "aliases": ["romaine lettuce"],
        "units_override": {"cup": 47},
    },
    {
        "id": "avocado",
        "fdc_id": 171705,
        "aliases": ["avocado", "avocados"],
        "piece_g": 136,  # Florida/California average flesh ~136g for medium
    },
    {
        "id": "tomato",
        "fdc_id": 170457,
        "aliases": ["tomato", "tomatoes", "ripe tomatoes"],
        "piece_g": 123,
        "units_override": {"medium": 123, "large": 182, "cup": 180},
    },
    {
        "id": "cherry-tomato",
        "fdc_id": 170457,
        "aliases": ["cherry tomatoes"],
        "units_override": {"cup": 149},
    },
    {
        "id": "brussels",
        "fdc_id": 170383,
        "aliases": ["Brussels sprouts"],
    },
    {
        "id": "poblano",
        "fdc_id": 170108,  # Peppers, sweet, green, raw (stand-in for poblano)
        "aliases": ["poblano peppers"],
        "piece_g": 50,
        "approx": True,
    },
    {
        "id": "bell-pepper",
        "fdc_id": 170108,
        "aliases": ["green bell pepper", "bell pepper", "bell peppers"],
        "piece_g": 119,
        "units_override": {"medium": 119, "large": 164, "cup": 149},
    },
    {
        "id": "jalapeno",
        "fdc_id": 168576,
        "aliases": ["jalapeño", "jalapeno"],
        "piece_g": 14,
        "units_override": {"small": 10},
    },
    {
        "id": "cauliflower",
        "fdc_id": 169986,
        "aliases": ["cauliflower florets", "cauliflower"],
        "units_override": {"cup": 100},
    },
    {
        "id": "potato",
        "fdc_id": 170026,  # Potatoes, flesh and skin, raw
        "aliases": ["Yukon gold potatoes", "potatoes"],
        "piece_g": 173,
        "units_override": {"medium": 173, "cup": 150},
    },
    {
        "id": "lemon",
        "fdc_id": 167746,
        "aliases": ["lemon", "lemons"],
        "piece_g": 58,  # without refuse approx juiceable fruit; USDA fruit 58g edible?
        "units_override": {"large": 84, "medium": 58},
    },
    {
        "id": "lemon-juice",
        "fdc_id": 167747,
        "aliases": ["lemon juice"],
        "units_override": {"tsp": 5, "tbsp": 15.2, "cup": 244, "ml": 1.03},
    },
    {
        "id": "lime",
        "fdc_id": 168155,
        "aliases": ["lime", "limes", "lime wedges"],
        "piece_g": 44,
        "skip_if_no_qty": True,
    },
    {
        "id": "lime-juice",
        "fdc_id": 168156,
        "aliases": ["lime juice"],
        "units_override": {"tsp": 5, "tbsp": 15.4, "cup": 246, "ml": 1.03},
    },
    {
        "id": "basil",
        "fdc_id": 172232,
        "aliases": ["fresh basil"],
        "units_override": {"cup": 24, "tbsp": 2.6, "tsp": 0.7},
    },
    {
        "id": "cilantro",
        "fdc_id": 169997,
        "aliases": ["fresh cilantro"],
        "units_override": {"cup": 16, "tbsp": 1, "tsp": 0.3},
    },
    {
        "id": "chives",
        "fdc_id": 169994,
        "aliases": ["fresh chives", "chives"],
        "units_override": {"tbsp": 3, "tsp": 1, "cup": 48},
    },
    {
        "id": "dill",
        "fdc_id": 172233,
        "aliases": ["fresh dill"],
        "units_override": {"tbsp": 1, "tsp": 0.3, "cup": 9},
    },
    {
        "id": "oregano-fresh",
        "fdc_id": 171328,  # dried oregano nutrients; fresh leaf weight override
        "aliases": ["fresh oregano"],
        "units_override": {"tbsp": 3.2, "tsp": 1},
        "approx": True,
    },
    {
        "id": "parsley",
        "fdc_id": 170416,
        "aliases": ["fresh parsley", "parsley"],
        "units_override": {"tbsp": 3.8, "tsp": 1.3, "cup": 60},
    },
    {
        "id": "thyme",
        "fdc_id": 173470,
        "aliases": ["fresh thyme"],
        "piece_g": 0.4,  # per sprig approx
        "units_override": {"sprig": 0.4, "sprigs": 0.4, "tsp": 0.8, "tbsp": 2.4},
    },
    {
        "id": "mushroom-cremini",
        "fdc_id": 168434,
        "aliases": [
            "brown mushrooms",
            "cremini mushrooms",
            "chestnut mushrooms",
            "mushrooms",
        ],
        "piece_g": 18,
        "units_override": {"cup": 87},
    },
    {
        "id": "artichoke-hearts",
        "fdc_id": 168387,  # Artichokes, (globe or french), frozen, unprepared
        "aliases": ["artichoke hearts"],
        "approx": True,
    },
    {
        "id": "berries",
        "fdc_id": 171711,  # Blueberries raw as stand-in
        "aliases": [
            "berries",
            "blueberries",
            "strawberries",
            "raspberries",
            "blackberries",
            "diced strawberries",
        ],
        "units_override": {"cup": 148},
        "approx": True,
    },
    # Canned / jarred
    {
        "id": "black-beans",
        "fdc_id": 175188,  # canned black turtle
        "aliases": ["black beans"],
        "units_override": {"cup": 240},
    },
    {
        "id": "pinto-beans",
        "fdc_id": 175201,  # Beans, pinto, mature seeds, canned
        "aliases": ["canned pinto beans"],
        "units_override": {"cup": 240},
    },
    {
        "id": "diced-tomatoes",
        "fdc_id": 170457,  # fresh tomato stand-in for canned diced (similar macros)
        "aliases": ["diced tomatoes"],
        "approx": True,
    },
    {
        "id": "san-marzano",
        "fdc_id": 170457,
        "aliases": ["whole peeled San Marzano tomatoes", "passata"],
        "units_override": {"cup": 250},
        "approx": True,
    },
    {
        "id": "tomato-paste",
        "fdc_id": 170459,
        "aliases": ["tomato paste"],
        "units_override": {"tbsp": 16, "tsp": 5.3, "cup": 262},
    },
    {
        "id": "pumpkin",
        "fdc_id": 168450,  # Pumpkin, canned, without salt
        "aliases": ["pumpkin puree"],
    },
    {
        "id": "chipotle-adobo",
        "fdc_id": 170107,  # Peppers, hot chili, red, canned (approx for chipotle in adobo)
        "aliases": ["chipotle peppers in adobo"],
        "units_override": {"tbsp": 15, "tsp": 5},
        "approx": True,
    },
    {
        "id": "chicken-broth",
        "fdc_id": 174536,  # Soup, chicken broth, ready-to-serve
        "aliases": ["chicken broth", "chicken stock"],
        "units_override": {"cup": 240, "ml": 1.0, "tbsp": 15},
    },
    {
        "id": "vegetable-broth",
        "fdc_id": 171583,  # Soup, vegetable broth, ready to serve
        "aliases": ["vegetable broth"],
        "units_override": {"cup": 240, "ml": 1.0, "tbsp": 15},
    },
    {
        "id": "coconut-milk",
        "fdc_id": 170173,  # canned coconut milk
        "aliases": ["coconut milk"],
        "units_override": {"cup": 240, "tbsp": 15, "tsp": 5, "ml": 0.97},
    },
    # Dry goods
    {
        "id": "ap-flour",
        "fdc_id": 168894,
        "aliases": ["all-purpose flour", "flour", "plain flour"],
        "units_override": {"cup": 125, "tbsp": 7.8, "tsp": 2.6},
    },
    {
        "id": "bread-flour",
        "fdc_id": 168896,  # Wheat flour, white, bread, enriched
        "aliases": ["strong bread flour"],
        "units_override": {"cup": 127},
    },
    {
        "id": "almond-flour",
        "fdc_id": 170567,  # Nuts, almonds stand-in for almond flour
        "aliases": ["almond flour"],
        "units_override": {"cup": 96},
        "approx": True,
    },
    {
        "id": "semolina",
        "fdc_id": 169715,  # Semolina, enriched
        "aliases": ["semolina"],
        "units_override": {"cup": 167, "tbsp": 10},
    },
    {
        "id": "baking-powder",
        "fdc_id": 172804,  # Leavening agents, baking powder, double-acting, straight phosphate
        "aliases": ["baking powder"],
        "units_override": {"tsp": 4.6, "tbsp": 13.8},
    },
    {
        "id": "baking-soda",
        "fdc_id": 175040,  # Leavening agents, baking soda
        "aliases": ["baking soda"],
        "units_override": {"tsp": 4.6, "tbsp": 13.8},
    },
    {
        "id": "cornstarch",
        "fdc_id": 169254,
        "aliases": ["cornstarch", "corn starch"],
        "units_override": {"tbsp": 8, "tsp": 2.7, "cup": 128},
    },
    {
        "id": "oats",
        "fdc_id": 173904,  # Cereals, oats, regular and quick, unenriched, dry
        "aliases": ["rolled oats"],
        "units_override": {"cup": 81, "tbsp": 5},
    },
    {
        "id": "chia",
        "fdc_id": 170554,  # Seeds, chia seeds, dried
        "aliases": ["chia seeds"],
        "units_override": {"tbsp": 12, "tsp": 4, "cup": 168},
    },
    {
        "id": "white-rice",
        "fdc_id": 168877,
        "aliases": ["long-grain white rice"],
        "units_override": {"cup": 185},
    },
    {
        "id": "quinoa-cooked",
        "fdc_id": 168917,  # Quinoa, cooked
        "aliases": ["cooked quinoa"],
        "units_override": {"cup": 185},
    },
    {
        "id": "lentils-dry",
        "fdc_id": 172420,
        "aliases": ["dried lentils"],
        "units_override": {"cup": 192},
    },
    {
        "id": "lentils-cooked",
        "fdc_id": 172421,
        "aliases": ["cooked lentils"],
        "units_override": {"cup": 198},
    },
    {
        "id": "pasta",
        "fdc_id": 169736,  # Pasta, dry, enriched
        "aliases": ["rotini", "fettuccine", "egg noodles"],
    },
    {
        "id": "rice-noodles",
        "fdc_id": 169742,  # Rice noodles, dry
        "aliases": ["rice noodles"],
    },
    {
        "id": "gnocchi",
        "fdc_id": 169736,  # pasta stand-in; potato gnocchi denser — approx
        "aliases": ["mini potato gnocchi"],
        "approx": True,
    },
    {
        "id": "yeast",
        "fdc_id": 175043,  # Leavening agents, yeast, baker's, active dry
        "aliases": ["dried yeast"],
        "units_override": {"tsp": 4, "tbsp": 12, "packet": 7},
    },
    {
        "id": "sugar",
        "fdc_id": 169655,
        "aliases": ["granulated sugar", "sugar", "caster sugar"],
        "units_override": {"tsp": 4.2, "tbsp": 12.5, "cup": 200},
    },
    {
        "id": "brown-sugar",
        "fdc_id": 168833,
        "aliases": ["brown sugar", "light brown sugar"],
        "units_override": {"tsp": 4.5, "tbsp": 13.8, "cup": 220},
    },
    {
        "id": "powdered-sugar",
        "fdc_id": 169656,
        "aliases": ["powdered sugar"],
        "units_override": {"cup": 120, "tbsp": 7.5},
    },
    {
        "id": "cocoa",
        "fdc_id": 169593,
        "aliases": ["unsweetened cocoa powder"],
        "units_override": {"tbsp": 5.4, "tsp": 1.8, "cup": 86},
    },
    {
        "id": "dark-chocolate",
        "fdc_id": 170273,  # Chocolate, dark, 70-85% cacao solids
        "aliases": ["dark chocolate"],
    },
    {
        "id": "vanilla",
        "fdc_id": 173471,  # Vanilla extract
        "aliases": ["vanilla extract"],
        "units_override": {"tsp": 4.2, "tbsp": 13},
    },
    {
        "id": "hazelnuts",
        "fdc_id": 170581,
        "aliases": ["hazelnuts"],
        "units_override": {"cup": 135, "tbsp": 8.4},
    },
    {
        "id": "peanuts",
        "fdc_id": 173806,  # Peanuts, all types, dry-roasted, without salt
        "aliases": ["roasted peanuts"],
        "units_override": {"cup": 146, "tbsp": 9, "tsp": 3},
    },
    {
        "id": "sesame-seeds",
        "fdc_id": 170150,
        "aliases": ["sesame seeds"],
        "units_override": {"tbsp": 9, "tsp": 3, "cup": 144},
    },
    {
        "id": "water",
        "fdc_id": 175103,  # Beverages, water, tap, municipal
        "aliases": ["water", "warm water", "pasta water"],
        "units_override": {"ml": 1.0, "cup": 240, "tbsp": 15, "tsp": 5},
        "zero_nutrition": True,  # force near-zero; still tracks mass if needed
    },
    # Spices (per tsp weights matter)
    {
        "id": "salt",
        "fdc_id": 173468,
        "aliases": ["salt", "kosher salt", "sea salt", "flaky salt"],
        "units_override": {"tsp": 6, "tbsp": 18, "pinch": 0.3},
    },
    {
        "id": "black-pepper",
        "fdc_id": 170931,
        "aliases": [
            "black pepper",
            "freshly ground black pepper",
            "cracked black pepper",
            "pepper",
        ],
        "units_override": {"tsp": 2.3, "tbsp": 6.9, "pinch": 0.2},
    },
    {
        "id": "cayenne",
        "fdc_id": 170932,
        "aliases": ["cayenne pepper"],
        "units_override": {"tsp": 1.8, "tbsp": 5.3},
    },
    {
        "id": "chili-powder",
        "fdc_id": 171319,
        "aliases": ["chili powder"],
        "units_override": {"tsp": 2.7, "tbsp": 8},
    },
    {
        "id": "paprika",
        "fdc_id": 171329,
        "aliases": ["smoked paprika", "paprika"],
        "units_override": {"tsp": 2.3, "tbsp": 6.8},
    },
    {
        "id": "garlic-powder",
        "fdc_id": 171325,
        "aliases": ["garlic powder"],
        "units_override": {"tsp": 3.1, "tbsp": 9.3},
    },
    {
        "id": "onion-powder",
        "fdc_id": 171327,
        "aliases": ["onion powder"],
        "units_override": {"tsp": 2.4, "tbsp": 7.2},
    },
    {
        "id": "cumin",
        "fdc_id": 170923,
        "aliases": ["ground cumin", "cumin seeds"],
        "units_override": {"tsp": 2.1, "tbsp": 6},
    },
    {
        "id": "coriander",
        "fdc_id": 170921,
        "aliases": ["ground coriander"],
        "units_override": {"tsp": 1.8, "tbsp": 5},
    },
    {
        "id": "nutmeg",
        "fdc_id": 171326,
        "aliases": ["ground nutmeg", "nutmeg"],
        "units_override": {"tsp": 2.2, "tbsp": 6.6},
    },
    {
        "id": "dried-oregano",
        "fdc_id": 171328,
        "aliases": ["dried oregano"],
        "units_override": {"tsp": 1, "tbsp": 3},
    },
    {
        "id": "dried-basil",
        "fdc_id": 171317,
        "aliases": ["dried basil"],
        "units_override": {"tsp": 0.7, "tbsp": 2.1},
    },
    {
        "id": "dried-thyme",
        "fdc_id": 170938,
        "aliases": ["dried thyme"],
        "units_override": {"tsp": 1, "tbsp": 2.7},
    },
    {
        "id": "parsley-flakes",
        "fdc_id": 170416,  # fresh parsley nutrients ≈ dried flakes lightly; approx
        "aliases": ["parsley flakes"],
        "units_override": {"tsp": 0.5, "tbsp": 1.5},
        "approx": True,
    },
    {
        "id": "fennel-seeds",
        "fdc_id": 171322,
        "aliases": ["fennel seeds"],
        "units_override": {"tsp": 2, "tbsp": 5.8},
    },
    {
        "id": "italian-seasoning",
        "fdc_id": 171328,  # oregano stand-in for blend
        "aliases": ["Italian seasoning"],
        "units_override": {"tsp": 1, "tbsp": 3},
        "approx": True,
    },
    {
        "id": "cajun",
        "fdc_id": 171319,  # chili powder stand-in
        "aliases": ["Cajun seasoning"],
        "units_override": {"tsp": 2.5, "tbsp": 7.5},
        "approx": True,
    },
    {
        "id": "garam-masala",
        "fdc_id": 171320,  # Curry powder stand-in
        "aliases": ["garam masala"],
        "units_override": {"tsp": 2, "tbsp": 6},
        "approx": True,
    },
    {
        "id": "curry-powder",
        "fdc_id": 171320,
        "aliases": ["yellow curry powder"],
        "units_override": {"tsp": 2, "tbsp": 6.3},
    },
    {
        "id": "fenugreek",
        "fdc_id": 171324,  # Spices, fenugreek seed
        "aliases": ["dried fenugreek leaves"],
        "units_override": {"tsp": 1.2, "tbsp": 3.7},
        "approx": True,  # leaves ≠ seeds
    },
    {
        "id": "red-pepper-flakes",
        "fdc_id": 170932,  # cayenne stand-in
        "aliases": ["red pepper flakes", "crushed red pepper flakes"],
        "units_override": {"tsp": 1.8, "tbsp": 5.3},
        "approx": True,
    },
    {
        "id": "poultry-seasoning",
        "fdc_id": 171331,
        "aliases": ["poultry seasoning"],
        "units_override": {"tsp": 1.5, "tbsp": 4.5},
    },
    # Condiments
    {
        "id": "dijon",
        "fdc_id": 172234,  # Mustard, prepared, yellow (stand-in)
        "aliases": ["Dijon mustard"],
        "units_override": {"tsp": 5, "tbsp": 15},
        "approx": True,
    },
    {
        "id": "mayo",
        "fdc_id": 171009,  # may need fix
        "aliases": ["mayonnaise"],
        "units_override": {"tsp": 4.6, "tbsp": 13.8, "cup": 220},
    },
    {
        "id": "honey",
        "fdc_id": 169640,
        "aliases": ["honey"],
        "units_override": {"tsp": 7, "tbsp": 21, "cup": 339},
    },
    {
        "id": "soy-sauce",
        "fdc_id": 174277,
        "aliases": ["soy sauce"],
        "units_override": {"tsp": 5.3, "tbsp": 16, "cup": 255, "ml": 1.15},
    },
    {
        "id": "worcestershire",
        "fdc_id": 171610,
        "aliases": ["Worcestershire sauce"],
        "units_override": {"tsp": 5.7, "tbsp": 17},
    },
    {
        "id": "balsamic",
        "fdc_id": 172241,  # Vinegar, balsamic
        "aliases": ["balsamic vinegar"],
        "units_override": {"tsp": 5.3, "tbsp": 16, "cup": 255, "ml": 1.04},
    },
    {
        "id": "ketchup",
        "fdc_id": 168556,  # Catsup
        "aliases": ["ketchup"],
        "units_override": {"tsp": 5.7, "tbsp": 17, "cup": 273},
    },
    {
        "id": "peanut-butter",
        "fdc_id": 172470,
        "aliases": ["creamy peanut butter"],
        "units_override": {"tsp": 5.3, "tbsp": 16, "cup": 258},
    },
    {
        "id": "chili-paste",
        "fdc_id": 174527,  # Sauce, ready-to-serve, pepper or hot
        "aliases": ["chili paste"],
        "units_override": {"tsp": 5, "tbsp": 15},
        "approx": True,
    },
    {
        "id": "pico",
        "fdc_id": 170457,  # tomato stand-in for pico de gallo
        "aliases": ["pico de gallo"],
        "units_override": {"cup": 180, "tbsp": 15},
        "approx": True,
    },
    # Wine / spirits
    {
        "id": "marsala",
        "fdc_id": 173190,  # red table wine stand-in for Marsala
        "aliases": ["dry Marsala wine"],
        "units_override": {"ml": 0.99, "cup": 237, "tbsp": 15},
        "approx": True,
    },
    {
        "id": "white-wine",
        "fdc_id": 174837,  # Alcoholic beverage, wine, table, white
        "aliases": ["white wine", "dry white wine"],
        "units_override": {"ml": 0.99, "cup": 237, "tbsp": 15},
    },
    {
        "id": "red-wine",
        "fdc_id": 173190,
        "aliases": ["dry red wine"],
        "units_override": {"ml": 0.99, "cup": 237, "tbsp": 15},
    },
    {
        "id": "cognac",
        "fdc_id": 174815,  # distilled spirits 80 proof stand-in for Cognac
        "aliases": ["Cognac"],
        "units_override": {"ml": 0.94, "cup": 224, "tbsp": 14},
        "approx": True,
    },
    # Frozen / bakery
    {
        "id": "frozen-peas",
        "fdc_id": 170016,
        "aliases": ["frozen peas"],
        "units_override": {"cup": 134},
    },
    {
        "id": "frozen-onions",
        "fdc_id": 170000,
        "aliases": ["frozen small whole onions"],
        "approx": True,
    },
    {
        "id": "hamburger-bun",
        "fdc_id": 167923,  # Wonder Hamburger Rolls
        "aliases": ["hamburger buns"],
        "piece_g": 43,
        "approx": True,
    },
    {
        "id": "naan",
        "fdc_id": 171845,  # Bread, naan, plain, commercially prepared, refrigerated
        "aliases": ["naan"],
        "piece_g": 90,
    },
    {
        "id": "flour-tortilla",
        "fdc_id": 175037,  # Tortillas, flour, refrigerated
        "aliases": ["flour tortillas", "tortillas"],
        "piece_g": 49,
    },
    {
        "id": "breadcrumbs",
        "fdc_id": 174928,
        "aliases": ["bread crumbs", "breadcrumbs"],
        "units_override": {"cup": 108, "tbsp": 6.8},
    },
]


def load_foods(usda: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with (usda / "food.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["fdc_id"]] = row["description"]
    return out


def load_nutrients(usda: Path, fdc_ids: set[str]) -> dict[str, dict[str, float]]:
    wanted = set(NUTRIENTS)
    out: dict[str, dict[str, float]] = {fid: {} for fid in fdc_ids}
    with (usda / "food_nutrient.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            fid = row["fdc_id"]
            if fid not in fdc_ids:
                continue
            nid = int(row["nutrient_id"])
            if nid not in wanted:
                continue
            key = NUTRIENTS[nid]
            try:
                amount = float(row["amount"]) if row["amount"] else 0.0
            except ValueError:
                amount = 0.0
            out[fid][key] = amount
    return out


def load_portions(usda: Path, fdc_ids: set[str]) -> dict[str, dict[str, float]]:
    """Return grams-per-1-unit for cup/tbsp/tsp/ml/fl_oz when available."""
    out: dict[str, dict[str, float]] = {fid: {} for fid in fdc_ids}
    with (usda / "food_portion.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            fid = row["fdc_id"]
            if fid not in fdc_ids:
                continue
            try:
                unit_id = int(row["measure_unit_id"])
            except ValueError:
                continue
            unit = UNIT_IDS.get(unit_id)
            if not unit:
                continue
            try:
                amount = float(row["amount"] or "1") or 1.0
                grams = float(row["gram_weight"])
            except ValueError:
                continue
            if amount <= 0 or grams <= 0:
                continue
            per = grams / amount
            # Prefer first / keep denser consistency; don't overwrite if set
            out[fid].setdefault(unit, round(per, 4))
    return out


def normalize_alias(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--usda-dir",
        type=Path,
        required=True,
        help="Extracted FoodData_Central_sr_legacy_food_csv_2018-04 directory",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "config" / "nutrition.json",
    )
    args = parser.parse_args()

    if not (args.usda_dir / "food.csv").is_file():
        print(f"error: food.csv not found in {args.usda_dir}", file=sys.stderr)
        return 1

    fdc_ids = {str(f["fdc_id"]) for f in FOODS}
    descriptions = load_foods(args.usda_dir)
    missing = sorted(fid for fid in fdc_ids if fid not in descriptions)
    if missing:
        print(f"error: unknown fdc_ids: {missing}", file=sys.stderr)
        return 1

    nutrients = load_nutrients(args.usda_dir, fdc_ids)
    portions = load_portions(args.usda_dir, fdc_ids)

    foods_out: dict[str, dict] = {}
    alias_index: dict[str, str] = {}
    approx_aliases: set[str] = set()

    for entry in FOODS:
        fid = str(entry["fdc_id"])
        per = {k: 0.0 for k in ("kcal", "protein_g", "fat_g", "sat_fat_g", "carbs_g", "fiber_g", "sugars_g", "sodium_mg")}
        per.update(nutrients.get(fid, {}))
        if entry.get("zero_nutrition"):
            per = {k: 0.0 for k in per}

        units: dict[str, float] = {
            "g": 1.0,
            "gram": 1.0,
            "grams": 1.0,
            "kg": 1000.0,
            "oz": 28.3495,
            "ounce": 28.3495,
            "ounces": 28.3495,
            "lb": 453.592,
            "pound": 453.592,
            "pounds": 453.592,
        }
        # USDA portions first
        for ukey, grams in portions.get(fid, {}).items():
            units[ukey] = grams
            if ukey == "tbsp":
                units["tablespoon"] = grams
                units["tablespoons"] = grams
            elif ukey == "tsp":
                units["teaspoon"] = grams
                units["teaspoons"] = grams
            elif ukey == "fl_oz":
                units["fl oz"] = grams
                units["fluid ounce"] = grams
        # Overrides win
        for ukey, grams in (entry.get("units_override") or {}).items():
            units[ukey] = float(grams)
            if ukey == "tbsp":
                units["tablespoon"] = float(grams)
                units["tablespoons"] = float(grams)
            elif ukey == "tsp":
                units["teaspoon"] = float(grams)
                units["teaspoons"] = float(grams)
            elif ukey == "ml":
                units["milliliter"] = float(grams)
                units["milliliters"] = float(grams)
                units["millilitre"] = float(grams)

        if "ml" in units and "cup" not in units:
            units["cup"] = units["ml"] * 240.0
        if "piece_g" in entry:
            units[""] = float(entry["piece_g"])
            units["piece"] = float(entry["piece_g"])
            units["pieces"] = float(entry["piece_g"])

        food = {
            "id": entry["id"],
            "fdcId": int(fid),
            "description": descriptions[fid],
            "aliases": entry["aliases"],
            "per100g": {k: round(float(per.get(k, 0.0) or 0.0), 3) for k in per},
            "gramsPerUnit": {k: round(float(v), 4) for k, v in sorted(units.items(), key=lambda x: x[0])},
        }
        if entry.get("approx"):
            food["approx"] = True
        if entry.get("approx_aliases"):
            food["approxAliases"] = entry["approx_aliases"]
            for a in entry["approx_aliases"]:
                approx_aliases.add(normalize_alias(a))
        foods_out[entry["id"]] = food

        for alias in entry["aliases"]:
            key = normalize_alias(alias)
            if key in alias_index and alias_index[key] != entry["id"]:
                print(f"warn: duplicate alias {alias!r}", file=sys.stderr)
            alias_index[key] = entry["id"]

    payload = {
        "meta": {
            "source": "USDA FoodData Central, SR Legacy (April 2018)",
            "citation": "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, https://fdc.nal.usda.gov/",
            "nutrientsPer": "100g",
            "note": (
                "Curated offline subset for this cookbook only. Full SR Legacy is ~40MB "
                "unzipped — regenerate with scripts/build-nutrition-db.py instead of vendoring USDA."
            ),
            "foodCount": len(foods_out),
            "aliasCount": len(alias_index),
        },
        "aliasToFood": alias_index,
        "approxAliases": sorted(approx_aliases),
        "foods": foods_out,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    size_kb = args.out.stat().st_size / 1024
    print(f"Wrote {args.out} ({len(foods_out)} foods, {len(alias_index)} aliases, {size_kb:.1f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
