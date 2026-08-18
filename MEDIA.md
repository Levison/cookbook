# Recipe images

Plan for adding pictures without turning the cookbook into a CMS, and without filling the GitHub Pages **1 GB** budget with originals.

## Goals

- Keep recipes as git-backed `.cook` files (agent-friendly, granular diffs).
- Keep large binaries out of git long-term (pixels ≠ source of truth).
- Stay compatible with CookCLI / Cooklang conventions.
- If a CMS ever appears, it should only be an upload UI over the same contract—not a new home for recipe text.

## Phase 1 — compressed images in the repo (now)

Use Cooklang’s sidecar convention: a supported image next to the recipe with the **same base name**.

```text
recipes/Creamy Chicken Marsala.cook
recipes/Creamy Chicken Marsala.jpg   # or .webp / .png / …
```

CookCLI copies matching images into the static site on `cook build web`, so they show up on GitHub Pages with no extra config.

**Rules for this phase:**

- Commit only **compressed** recipe images (aim small enough for phone viewing; rough target **≲ 200 KB** per hero).
- Do **not** commit phone originals, RAW, or Drive dumps.
- Prefer one hero image per recipe for now.
- Stay on this phase until media size becomes a problem (see Phase 2 trigger below).

Today the repo already has two sidecars (`Macarons au Chocolat.jpg`, `Ganaches au Chocolat.jpg`). Those are source-page scans, not plated heroes—treat that as historical; new images should be deliberate recipe photos unless we decide otherwise (open decision).

## Phase 2 — Cloudflare R2 + frontmatter URLs (when space gets tight)

When in-repo / Pages media is no longer comfortable, stop shipping image bytes through git and Pages:

1. Upload optimized images to **Cloudflare R2** (public URL or CDN in front).
2. Point each recipe at its hero with Cooklang metadata:

```yaml
---
title: Easy Creamy Chicken Marsala
image: https://media.example.com/cookbook/creamy-chicken-marsala/hero.webp
---
```

3. Optionally remove old sidecar files from git so `_site` stays tiny.
4. Keep using the same stable path scheme in the bucket so agents (and a future CMS) can predict URLs:

```text
cookbook/<slug>/hero.webp
cookbook/<slug>/step-1.webp   # later, if needed
```

Cooklang also accepts `images`, `picture`, and `pictures` for URLs; prefer **`image:`** as the single canonical hero field unless we need galleries.

**Suggested switch trigger:** leave Phase 1 when total recipe image weight in the repo (or in `_site`) is getting awkward—not only at the hard 1 GB Pages ceiling. Exact budget is an open decision.

## CMS stance

No CMS for now. The agent + git flow is the product.

Preparation for a possible later CMS is just this contract:

| Concern | Stays in git | Lives outside git |
| --- | --- | --- |
| Recipe text / metadata | `.cook` files | — |
| Hero (and later step) pixels | Phase 1 only, compressed | Phase 2: R2 |
| Image pointer | Phase 2: `image:` URL in frontmatter | — |

A future CMS would write the same `image:` URLs (and maybe help upload to R2). It would not own the recipes.

## Agent / human workflow

**Phase 1**

1. Compress a hero image.
2. Save it beside the `.cook` file with a matching stem.
3. Commit; Pages rebuild picks it up.

**Phase 2**

1. Upload to R2 at `cookbook/<slug>/hero.webp`.
2. Set `image:` in the recipe frontmatter.
3. Commit the `.cook` change only (no binary).

## Open decisions

Answer these when convenient; until then the provisional defaults in parentheses apply.

1. **Phase 2 trigger** — When do we move to R2? (Provisional: when total committed recipe images exceed ~20 MB, or sooner if Pages deploys feel heavy.)
2. **Source scans vs heroes** — What should we do with cookbook-page photos used for transcription? (Provisional: do not use them as public heroes going forward; keep transcription assets out of the site or clearly separate.)
3. **Frontmatter in Phase 1** — Should we start setting `image:` even while files are still sidecars? (Provisional: no—rely on sidecars until R2.)
4. **Slug for R2 paths** — Derive `<slug>` from the `.cook` filename stem (lowercased, spaces → hyphens), or add an explicit `slug:` in frontmatter? (Provisional: derive from filename.)
5. **Preferred format** — WebP, JPEG, or either if small enough? (Provisional: either; prefer WebP when easy.)
