#!/usr/bin/env bash
# Inject mobile grocery + meal-plan enhancements into a CookCLI static site build.
# Usage: ./site-enhancements/inject.sh [_site]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${1:-$ROOT/_site}"
SRC="$ROOT/site-enhancements"

if [[ ! -d "$SITE" ]]; then
  echo "Site directory not found: $SITE" >&2
  exit 1
fi

mkdir -p "$SITE/static/js" "$SITE/static/css" "$SITE/static/data"
cp "$SRC/grocery.js" "$SITE/static/js/grocery.js"
cp "$SRC/grocery.css" "$SITE/static/css/grocery.css"

# Detect site base path from a generated stylesheet link, e.g. /cookbook or ""
sample="$(find "$SITE" -name 'index.html' -print -quit)"
if [[ -z "$sample" ]]; then
  sample="$(find "$SITE" -name '*.html' -print -quit)"
fi

BASE=""
if [[ -n "$sample" ]]; then
  href="$(grep -oE 'href="[^"]*static/css/output\.css"' "$sample" | head -1 || true)"
  if [[ -n "$href" ]]; then
    path="${href#href=\"}"
    path="${path%\"}"
    # Strip trailing /static/css/output.css (with or without leading slash)
    BASE="${path%static/css/output.css}"
    BASE="${BASE%/}"
  fi
fi

# Prefix used in HTML href/src attributes
if [[ -n "$BASE" && "$BASE" != "." && "$BASE" != "./" && "$BASE" != ".." && "$BASE" != "../.." ]]; then
  # Absolute site prefix (e.g. /cookbook) from --base-url builds
  if [[ "$BASE" == /* ]]; then
    PREFIX="$BASE"
  else
    # Relative ../../static/... paths from CookCLI — serve assets from site root
    PREFIX=""
  fi
else
  PREFIX=""
fi

prefix_path() {
  local rel="$1"
  if [[ -n "$PREFIX" ]]; then
    printf '%s/%s' "$PREFIX" "$rel"
  else
    printf '/%s' "$rel"
  fi
}

if ! command -v cook >/dev/null 2>&1; then
  echo "cook CLI is required to build the recipes manifest" >&2
  exit 1
fi

python3 "$SRC/build-manifest.py" \
  --repo "$ROOT" \
  --out "$SITE/static/data/recipes-manifest.json" \
  --base-prefix "$PREFIX"

# CookCLI sorts sidebar ingredients alphabetically (case-sensitive). Restore
# first-appearance order from the .cook steps before Pages deploy.
python3 "$SRC/reorder-ingredients.py" --repo "$ROOT" --site "$SITE"

CSS_HREF="$(prefix_path 'static/css/grocery.css')"
JS_SRC="$(prefix_path 'static/js/grocery.js')"
CSS_TAG="<link href=\"${CSS_HREF}\" rel=\"stylesheet\">"
JS_TAG="<script src=\"${JS_SRC}\"></script>"

sed "s|__BASE__|${PREFIX}|g" "$SRC/grocery.html" > "$SITE/grocery.html"
sed "s|__BASE__|${PREFIX}|g" "$SRC/plan.html" > "$SITE/plan.html"

inject_file() {
  local file="$1"

  if grep -q 'grocery\.js' "$file"; then
    return 0
  fi

  if grep -q 'custom-styles\.css' "$file"; then
    awk -v tag="$CSS_TAG" '
      { print }
      /custom-styles\.css/ && !done { print tag; done=1 }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  else
    awk -v tag="$CSS_TAG" '
      /<\/head>/ && !done { print tag; done=1 }
      { print }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi

  awk -v tag="$JS_TAG" '
    /<\/body>/ && !done { print tag; done=1 }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

count=0
while IFS= read -r -d '' html; do
  base="$(basename "$html")"
  if [[ "$base" == "grocery.html" || "$base" == "plan.html" ]]; then
    continue
  fi
  inject_file "$html"
  count=$((count + 1))
done < <(find "$SITE" -name '*.html' -print0)

echo "Injected grocery enhancements into ${count} pages (base=${PREFIX:-/})"
echo "Plan page: ${SITE}/plan.html"
echo "Grocery page: ${SITE}/grocery.html"
