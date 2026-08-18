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

## Shopping list

```bash
cook shopping-list "recipes/Creamy Chicken Marsala.cook"
```

Combine multiple recipes (and any recipes they reference) the same way:

```bash
cook shopping-list recipes/*.cook
```

## Compose recipes

Reference another recipe like an ingredient. Paths are relative to the recipes root, without the `.cook` extension:

```cook
Frost with @./frostings/Chocolate Buttercream{1%batch}.
```

Shopping lists expand referenced recipes into their ingredients.

## Static site

```bash
cook build web --base-path recipes
# opens as ./_site — host on GitHub Pages, Netlify, or open locally
```

For day-of cooking (scaling, interactive shopping list), use:

```bash
cook server --path recipes
```
