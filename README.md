# Cookbook

A static, git-backed cookbook in [Cooklang](https://cooklang.org/). Recipes live as plain `.cook` files; use CookCLI for shopping lists and a phone-friendly site on GitHub Pages.

## Setup

Install [CookCLI](https://github.com/cooklang/cookcli):

```bash
brew install cookcli
# or download a release binary from GitHub
```

## Recipes

| Recipe | Source |
| --- | --- |
| [Easy Creamy Chicken Marsala](recipes/Creamy%20Chicken%20Marsala.cook) | [Cafe Delites](https://cafedelites.com/creamy-chicken-marsala/) |
| [Chicken in White Wine Sauce](recipes/Chicken%20in%20White%20Wine%20Sauce.cook) (fake Marsala) | [Kitchen Sanctuary](https://www.kitchensanctuary.com/chicken-with-creamy-white-wine-garlic-sauce/) |
| [Chipotle Chicken Quinoa Burrito Bowl](recipes/Chipotle%20Chicken%20Quinoa%20Burrito%20Bowl.cook) | [EatingWell](https://www.eatingwell.com/recipe/254609/chipotle-chicken-quinoa-burrito-bowl/) |
| [Coq au Vin](recipes/Coq%20au%20Vin.cook) | [Ina Garten / Food Network](https://www.foodnetwork.com/recipes/ina-garten/coq-au-vin-recipe4-2011654) |
| [Skillet Lemon Dill Chicken Thighs](recipes/Skillet%20Lemon%20Dill%20Chicken%20Thighs.cook) | [Damn Delicious](https://damndelicious.net/2019/09/24/skillet-lemon-dill-chicken-thighs/) |
| [Vegetarian Shepherd's Pie](recipes/Vegetarian%20Shepherds%20Pie.cook) | [Feasting At Home](https://www.feastingathome.com/vegetarian-shepherds-pie/) |
| [Macarons au Chocolat](recipes/Macarons%20au%20Chocolat.cook) | Personal cookbook photo (fills with ganache) |
| [Ganaches au Chocolat](recipes/Ganaches%20au%20Chocolat.cook) | Personal cookbook photo |
| [Pizza Sauce](recipes/Pizza%20Sauce.cook) | [Food Wishes](https://foodwishes.blogspot.com/2012/02/pizza-sauce-lets-play-hide-little-fish.html) |
| [Perfect Pizza (Margherita)](recipes/Perfect%20Pizza%20Margherita.cook) | [Gennaro Contaldo / Food Tube](https://youtu.be/1-SJGQ2HLp8) |
| [Olive Garden Chicken Gnocchi Soup](recipes/Olive%20Garden%20Chicken%20Gnocchi%20Soup.cook) | [Tornadough Alli](https://tornadoughalli.com/olive-garden-chicken-gnocchi-soup/) |
| [One Pan Jambalaya](recipes/One%20Pan%20Jambalaya.cook) | [Tastes Better From Scratch](https://tastesbetterfromscratch.com/one-pan-jambalaya/) |
| [Roasted Chile Rellenos with Black Beans](recipes/Roasted%20Chile%20Rellenos%20with%20Black%20Beans.cook) | [Feasting At Home](https://www.feastingathome.com/roasted-chile-rellenos-with-black-beans/) |
| [Tomato Basil Chicken Fettuccine](recipes/Tomato%20Basil%20Chicken%20Fettuccine.cook) | [Damn Delicious](https://damndelicious.net/2016/02/02/tomato-basil-chicken-fettuccine/) |
| [Overnight Oats](recipes/Overnight%20Oats.cook) | [Feel Good Foodie](https://feelgoodfoodie.net/recipe/overnight-oats/) |
| [Pumpkin Mac and Cheese with Roasted Veggies](recipes/Pumpkin%20Mac%20and%20Cheese%20with%20Roasted%20Veggies.cook) | [Skinnytaste](https://www.skinnytaste.com/pumpkin-mac-and-cheese-with-roasted-veggies/) |
| [Fluffy Pancakes](recipes/Fluffy%20Pancakes.cook) | [Laura Fuentes](https://www.laurafuentes.com/fluffy-pancakes-recipe/) |
| [Turkey Burgers](recipes/Turkey%20Burgers.cook) | [Tastes Better From Scratch](https://tastesbetterfromscratch.com/turkey-burgers/) |
| [Thai Peanut Noodles](recipes/Thai%20Peanut%20Noodles.cook) | [Tornadough Alli](https://tornadoughalli.com/thai-peanut-noodles/) |
| [Artichoke Dip](recipes/Artichoke%20Dip.cook) | Personal |
| [Pumpkin Pizza](recipes/Pumpkin%20Pizza.cook) | Runner's World Vegetarian Cookbook (annotated) — [transcription review](transcription-reviews/pumpkin-pizza.md) |

## Shopping list

### On the phone (GitHub Pages)

The published site adds checkboxes next to each recipe’s ingredients and an **Export to grocery** button. Uncheck pantry staples, export, then open **Grocery** in the nav (or `/grocery.html`) to check items off while shopping. Share/copy uses the phone share sheet when available; the list is stored in the browser (`localStorage`).

This is layered on after `cook build web` via `site-enhancements/inject.sh` (wired into the Pages workflow).

### From the CLI

Run from `recipes/` (needed so recipe-to-recipe references resolve), or pass `--base-path`:

```bash
cd recipes && cook shopping-list "Creamy Chicken Marsala.cook"
cook shopping-list --base-path recipes "Macarons au Chocolat.cook"
cook shopping-list --base-path recipes *.cook
```

## Compose recipes

Reference another recipe like an ingredient. Paths are relative to the recipes root, without the `.cook` extension:

```cook
Sandwich pairs with @./Ganaches au Chocolat{}.
```

Shopping lists expand referenced recipes into their ingredients (e.g. macarons pull in ganache chocolate + cream).

## View on phone (recommended)

Skip the GitHub file browser — `.cook` files are plain text there. This repo builds a real recipe website with `cook build web` and publishes it free on **GitHub Pages**.

Once Pages is on, open:

**https://levison.github.io/cookbook/**

Bookmark that on a phone. Search works in the browser; no app install.

### One-time GitHub Pages setup

1. Merge this workflow (`.github/workflows/publish.yml`).
2. Repo **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
3. Push to the default branch (or run the **Publish Recipes** workflow manually under Actions).
4. After the workflow is green, the site is live at the URL above.

Every later recipe push rebuilds the site automatically.

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
