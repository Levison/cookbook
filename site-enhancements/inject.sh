#!/usr/bin/env bash
# Inject mobile grocery enhancements into a CookCLI static site build.
# Usage: ./site-enhancements/inject.sh [_site]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${1:-$ROOT/_site}"
SRC="$ROOT/site-enhancements"

if [[ ! -d "$SITE" ]]; then
  echo "Site directory not found: $SITE" >&2
  exit 1
fi

mkdir -p "$SITE/static/js" "$SITE/static/css"
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
if [[ -n "$BASE" ]]; then
  PREFIX="$BASE"
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

CSS_HREF="$(prefix_path 'static/css/grocery.css')"
JS_SRC="$(prefix_path 'static/js/grocery.js')"
CSS_TAG="<link href=\"${CSS_HREF}\" rel=\"stylesheet\">"
JS_TAG="<script src=\"${JS_SRC}\"></script>"

sed "s|__BASE__|${PREFIX}|g" "$SRC/grocery.html" > "$SITE/grocery.html"

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
  if [[ "$(basename "$html")" == "grocery.html" ]]; then
    continue
  fi
  inject_file "$html"
  count=$((count + 1))
done < <(find "$SITE" -name '*.html' -print0)

echo "Injected grocery enhancements into ${count} pages (base=${PREFIX:-/})"
echo "Grocery page: ${SITE}/grocery.html"
