# Cookbook

A static, git-backed cookbook in [Cooklang](https://cooklang.org/). Recipes live as plain `.cook` files; use CookCLI for shopping lists and static site builds.

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

## Shopping list

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

## Static site

```bash
cook build web --base-path recipes
# opens as ./_site — host on GitHub Pages, Netlify, or open locally
```

For day-of cooking (scaling, interactive shopping list), use:

```bash
cook server --path recipes
```
