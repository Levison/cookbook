# Cookbook

A static, git-backed cookbook in [Cooklang](https://cooklang.org/). Recipes live as plain `.cook` files; use CookCLI for shopping lists and a phone-friendly site on GitHub Pages.

**Images:** compressed sidecars in-repo for now; migrate to R2 + frontmatter URLs when space gets tight. See [MEDIA.md](MEDIA.md).

## Setup

Install [CookCLI](https://github.com/cooklang/cookcli):

```bash
brew install cookcli
# or download a release binary from GitHub
```

## Recipe chapters

Recipes live under `recipes/` in book-style folders. Paths in recipe-to-recipe references are relative to `recipes/` (no `.cook` extension):

| Folder | Role |
| --- | --- |
| `breakfast/` | Morning staples |
| `appetizers/` | Dips and starters |
| `soups/` | Soups |
| `mains/` | Weeknight and dinner mains |
| `pizza/` | Dough-topped meals |
| `basics/` | Shared components (sauces, fillings) |
| `desserts/` | Sweets |

### Taxonomy

Keep frontmatter consistent so search, shopping, and a future printed book stay sane:

| Key | Canonical values / notes |
| --- | --- |
| `course` | `breakfast`, `appetizer`, `soup`, `main`, `sauce`, `component`, `dessert` |
| `cuisine` | Primary cuisine string (e.g. `Italian`, `French`, `American`) |
| `tags` | Free-form; prefer lowercase. Use for protein, method, diet (`vegetarian`, `gluten-free`), season (`fall`), workflow (`transcription-review`), and `scaling` when the recipe is safe to scale linearly with CookCLI (`cook recipe "….cook:N"`) |
| `source` / `author` / `changes` | See [Attribution and changes](#attribution-and-changes) |

Prefer `course: main` over `dinner`. Put reusable building blocks in `basics/` (`sauce` or `component`).

### Prose and clarity

Recipe step wording follows [WRITING.md](WRITING.md) — step order, heat levels, doneness cues, headnotes vs `changes`, and Cooklang inline-ingredient conventions.

## Recipes

| Recipe | Source |
| --- | --- |
| [Easy Creamy Chicken Marsala](recipes/mains/Creamy%20Chicken%20Marsala.cook) | [Cafe Delites](https://cafedelites.com/creamy-chicken-marsala/) |
| [Chicken in White Wine Sauce](recipes/mains/Chicken%20in%20White%20Wine%20Sauce.cook) (fake Marsala) | [Kitchen Sanctuary](https://www.kitchensanctuary.com/chicken-with-creamy-white-wine-garlic-sauce/) |
| [Chipotle Chicken Quinoa Burrito Bowl](recipes/mains/Chipotle%20Chicken%20Quinoa%20Burrito%20Bowl.cook) | [EatingWell](https://www.eatingwell.com/recipe/254609/chipotle-chicken-quinoa-burrito-bowl/) |
| [Coq au Vin](recipes/mains/Coq%20au%20Vin.cook) | [Ina Garten / Food Network](https://www.foodnetwork.com/recipes/ina-garten/coq-au-vin-recipe4-2011654) |
| [Skillet Lemon Dill Chicken Thighs](recipes/mains/Skillet%20Lemon%20Dill%20Chicken%20Thighs.cook) | [Damn Delicious](https://damndelicious.net/2019/09/24/skillet-lemon-dill-chicken-thighs/) |
| [Vegetarian Shepherd's Pie](recipes/mains/Vegetarian%20Shepherds%20Pie.cook) | [Feasting At Home](https://www.feastingathome.com/vegetarian-shepherds-pie/) |
| [Vegan Shepherd's Pie](recipes/mains/Vegan%20Shepherds%20Pie.cook) | [Feasting At Home](https://www.feastingathome.com/vegetarian-shepherds-pie/) (dairy-free) |
| [Macarons au Chocolat](recipes/desserts/Macarons%20au%20Chocolat.cook) | Personal cookbook photo (fills with ganache) |
| [Ganaches au Chocolat](recipes/basics/Ganaches%20au%20Chocolat.cook) | Personal cookbook photo |
| [Pizza Sauce](recipes/basics/Pizza%20Sauce.cook) | [Food Wishes](https://foodwishes.blogspot.com/2012/02/pizza-sauce-lets-play-hide-little-fish.html) |
| [Perfect Pizza (Margherita)](recipes/pizza/Perfect%20Pizza%20Margherita.cook) | [Gennaro Contaldo / Food Tube](https://youtu.be/1-SJGQ2HLp8) |
| [Olive Garden Chicken Gnocchi Soup](recipes/soups/Olive%20Garden%20Chicken%20Gnocchi%20Soup.cook) | [Tornadough Alli](https://tornadoughalli.com/olive-garden-chicken-gnocchi-soup/) |
| [One Pan Jambalaya](recipes/mains/One%20Pan%20Jambalaya.cook) | [Tastes Better From Scratch](https://tastesbetterfromscratch.com/one-pan-jambalaya/) |
| [Roasted Chile Rellenos with Black Beans](recipes/mains/Roasted%20Chile%20Rellenos%20with%20Black%20Beans.cook) | [Feasting At Home](https://www.feastingathome.com/roasted-chile-rellenos-with-black-beans/) |
| [Tomato Basil Chicken Fettuccine](recipes/mains/Tomato%20Basil%20Chicken%20Fettuccine.cook) | [Damn Delicious](https://damndelicious.net/2016/02/02/tomato-basil-chicken-fettuccine/) |
| [Overnight Oats](recipes/breakfast/Overnight%20Oats.cook) | [Feel Good Foodie](https://feelgoodfoodie.net/recipe/overnight-oats/) |
| [Pumpkin Mac and Cheese with Roasted Veggies](recipes/mains/Pumpkin%20Mac%20and%20Cheese%20with%20Roasted%20Veggies.cook) | [Skinnytaste](https://www.skinnytaste.com/pumpkin-mac-and-cheese-with-roasted-veggies/) |
| [Fluffy Pancakes](recipes/breakfast/Fluffy%20Pancakes.cook) | [Laura Fuentes](https://www.laurafuentes.com/fluffy-pancakes-recipe/) |
| [Turkey Burgers](recipes/mains/Turkey%20Burgers.cook) | [Tastes Better From Scratch](https://tastesbetterfromscratch.com/turkey-burgers/) |
| [Thai Peanut Noodles](recipes/mains/Thai%20Peanut%20Noodles.cook) | [Tornadough Alli](https://tornadoughalli.com/thai-peanut-noodles/) |
| [Artichoke Dip](recipes/appetizers/Artichoke%20Dip.cook) | Personal |
| [Black Bean Quesadillas](recipes/mains/Black%20Bean%20Quesadillas.cook) | Gourmet Today, pages 299–300 |
| [Pumpkin Pizza](recipes/pizza/Pumpkin%20Pizza.cook) | Runner's World Vegetarian Cookbook (annotated) — [transcription review #12](https://github.com/Levison/cookbook/issues/12) |

## Attribution and changes

Credit and diffs live in each recipe’s YAML frontmatter (machine-readable; rendering can come later).

| Key | Meaning |
| --- | --- |
| `source` | Where the recipe came from — URL, book title, or `personal` |
| `author` | Original author or site credit (omit only when unknown) |
| `origin_title` | Optional. Printed/source title when our `title` differs |
| `changes` | Optional YAML list of short strings describing how this file differs from the source |

Semantics for `changes`:

- **Key omitted** — not yet reviewed against the source (do not invent diffs).
- **`changes: []`** — original/personal, or reviewed with no material deltas.
- **Non-empty list** — known deltas only (ingredient swaps, method preferences, renames). Cooking tips that are not source diffs stay in the body, not here.

Example:

```yaml
source: https://example.com/recipe
author: Jane Doe
origin_title: Smoky Squash Flatbread
changes:
  - Renamed for household use
  - Prefer skillet over printed oven method
```

Deep provenance checklists (book photos, handwriting) belong in a GitHub Issue tagged via the recipe’s `transcription-review` tag; the `.cook` frontmatter remains the canonical credit + change list.

## Shopping list

### On the phone (GitHub Pages)

**Plan a week of meals:** open **Plan** in the nav (or `/plan.html`), select whole recipes, then **Add to grocery**. Ingredients expand from composed recipes (the same way as the CLI shopping list) and land on **Grocery** grouped by store aisle when `config/aisle.conf` is present.

**From one recipe:** each recipe page has **Add recipe to grocery**. Uncheck pantry staples first if you only want part of the list. Recipes tagged `scaling` also show a **Servings** control that multiplies ingredient quantities (and cooking-mode amounts); grocery export uses the scaled amounts. Share a scaled view with `?servings=N` on the recipe URL.

On **Grocery**, check items off while shopping, remove a whole recipe with the chips at the top, or tap **Share list** to send a link (opens the phone share sheet, or copies the link). Opening that link loads the list on another phone. The list is also stored locally in the browser (`localStorage`).

This is layered on after `cook build web` via `site-enhancements/inject.sh` (wired into the Pages workflow), which also builds `static/data/recipes-manifest.json`.

### From the CLI

CookCLI loads `config/aisle.conf` automatically when you run from the repo root (or pass `-a config/aisle.conf`). Lists group ingredients by store section.

```bash
cook shopping-list --base-path recipes "mains/Creamy Chicken Marsala.cook"
cook shopping-list --base-path recipes "desserts/Macarons au Chocolat.cook"
cook shopping-list --base-path recipes recipes/mains/*.cook
```

After adding recipes, check for uncategorized ingredients:

```bash
cook doctor aisle --base-path "$(pwd)/recipes"
```

Use an absolute `--base-path` for `doctor aisle` when recipes are nested (a CookCLI quirk with `-b .`). Section names and aliases in `aisle.conf` should be tuned to your usual store; the checked-in file is a working default.

## Compose recipes

Reference another recipe like an ingredient. Paths are relative to the recipes root, without the `.cook` extension:

```cook
Sandwich pairs with @./basics/Ganaches au Chocolat{}.
```

Shopping lists expand referenced recipes into their ingredients (e.g. macarons pull in ganache chocolate + cream).

## Doctor (CI)

GitHub Actions runs `cook doctor validate --strict` on pushes and pull requests (see `.github/workflows/doctor.yml`). Locally:

```bash
cook doctor validate --strict --base-path "$(pwd)/recipes"
cook doctor aisle --base-path "$(pwd)/recipes"
```

## View on phone (recommended)

Skip the GitHub file browser — `.cook` files are plain text there. This repo builds a real recipe website with `cook build web` and publishes it free on **GitHub Pages**.

Once Pages is on, open:

**https://levison.github.io/cookbook/**

Bookmark that on a phone. Search works in the browser; no app install.

### One-time GitHub Pages setup

1. Merge this workflow (`.github/workflows/publish.yml`).
2. Repo **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions** (not “Deploy from a branch”).
3. Push to the default branch (or run the **Publish Recipes** workflow manually under Actions).
4. After the workflow is green, the site is live at the URL above.

Every later recipe push rebuilds the site automatically.

If the URL shows this README (Jekyll) instead of recipe cards, or `/plan.html` / `/grocery.html` 404, Pages is still on **Deploy from a branch**. Switch Source to **GitHub Actions**, then re-run **Publish Recipes**. No recipe rollback is needed — the Cooklang site is already built by that workflow.

### Local preview

```bash
cook build web --base-path recipes
bash site-enhancements/inject.sh ./_site
# open ./_site/index.html in a browser (or serve the folder)
```

For day-of cooking on your own machine (scaling, interactive shopping list):

```bash
cook server --path recipes
```

### Why not a wiki?

A GitHub wiki is still markdown/plain text — it will not render Cooklang ingredients, timers, or steps nicely. Pages with `cook build web` is the free, git-hosted option that matches this format.

### No-setup alternative

Because the repo is public, you can also paste it into [gitcook.ing](https://gitcook.ing/) for a quick web viewer. Prefer GitHub Pages for a stable link your household can bookmark.
