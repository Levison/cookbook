# Recipe images

Plan for adding pictures without turning the cookbook into a CMS, and without filling the GitHub Pages **1 GB** budget with originals.

## Goals

- Keep recipes as git-backed `.cook` files (agent-friendly, granular diffs).
- Keep large binaries out of git long-term (pixels ≠ source of truth).
- Stay compatible with CookCLI / Cooklang conventions.
- If a CMS ever appears, it should only be an upload UI over the same contract—not a new home for recipe text.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Phase 1 storage | Compressed images in git (Cooklang sidecars), roughly **≲ 200 KB** per hero; WebP or JPEG is fine |
| Phase 2 storage | **Cloudflare R2** + frontmatter `image:` URLs |
| Phase 2 trigger | Only when Pages deploys start failing or we’re **nearing the 1 GB** site cap—not an early soft MB budget |
| Frontmatter now | Set **`image:`** when a recipe has a hero, even in Phase 1 |
| Identity | Explicit **`slug:`** in frontmatter (not derived-only from the filename) |
| Source scans | Not for new public heroes; leave existing sidecars for now; **drop them later** (see [Backlog tickets](#backlog-tickets)) |
| CMS | Not now; `slug:` + `image:` is the preparation |

## Phase 1 — compressed images in the repo (now)

Use Cooklang’s sidecar convention **and** frontmatter pointers:

```text
recipes/Creamy Chicken Marsala.cook
recipes/Creamy Chicken Marsala.jpg   # or .webp / .png / …
```

```yaml
---
title: Easy Creamy Chicken Marsala
slug: creamy-chicken-marsala
image: https://raw.githubusercontent.com/Levison/cookbook/main/recipes/Creamy%20Chicken%20Marsala.jpg
---
```

- **Sidecar** — CookCLI copies matching images into `_site` on `cook build web` (local preview + Pages).
- **`image:`** — Canonical hero URL for tooling/CMS later. In Phase 1, point at the committed file’s stable public URL (raw GitHub as above, or the Pages static URL once you prefer that). Same field becomes the R2 URL in Phase 2.
- **`slug:`** — Stable id for object paths and future uploads. Choose it once; don’t rename casually.

**Rules:**

- Commit only **compressed** recipe images (phone-friendly; rough target **≲ 200 KB** per hero).
- Do **not** commit phone originals, RAW, or Drive dumps.
- Format: **either WebP or JPEG** (or other CookCLI-supported types) if small enough.
- Prefer one hero image per recipe for now.
- New images should be deliberate recipe photos—not cookbook-page / transcription scans.

## Phase 2 — Cloudflare R2 + frontmatter URLs (near the 1 GB ceiling)

When Pages is actually threatened by media size:

1. Upload optimized images to **Cloudflare R2** (public bucket URL or CDN in front).
2. Point `image:` at R2 using the recipe’s `slug:`:

```yaml
---
title: Easy Creamy Chicken Marsala
slug: creamy-chicken-marsala
image: https://media.example.com/cookbook/creamy-chicken-marsala/hero.webp
---
```

3. Remove sidecar binaries from git so `_site` stays tiny.
4. Bucket layout (agents and a future CMS both use this):

```text
cookbook/<slug>/hero.webp
cookbook/<slug>/step-1.webp   # later, if needed
```

Cooklang also accepts `images`, `picture`, and `pictures`; prefer **`image:`** as the single canonical hero field unless we need galleries.

## CMS stance

No CMS for now. The agent + git flow is the product.

| Concern | Stays in git | Lives outside git |
| --- | --- | --- |
| Recipe text / metadata | `.cook` files (`slug:`, etc.) | — |
| Hero pixels | Phase 1 only, compressed sidecars | Phase 2: R2 |
| Image pointer | `image:` URL in frontmatter (both phases) | — |

A future CMS would write the same `slug:` / `image:` fields (and maybe upload to R2). It would not own the recipes.

## Agent / human workflow

**Phase 1**

1. Pick a stable `slug:` (add to frontmatter if missing).
2. Compress a hero image (≲ ~200 KB; WebP or JPEG).
3. Save it beside the `.cook` file with a matching stem.
4. Set `image:` to that file’s public URL.
5. Commit; Pages rebuild picks up the sidecar.

**Phase 2**

1. Upload to R2 at `cookbook/<slug>/hero.webp`.
2. Update `image:` to the R2 URL.
3. Delete the sidecar from git; commit the `.cook` change.

## Backlog tickets

GitHub Issues couldn’t be created from this agent token (same limitation as other deploy-key flows). File these on the repo when convenient—or treat the items below as the tickets until then.

### Ticket: Drop source-scan hero — Macarons au Chocolat

- **Why:** `recipes/Macarons au Chocolat.jpg` is a printed-page scan, not a plated hero; CookCLI still treats it as the recipe image.
- **Do:** Remove or relocate the sidecar so it is not the public hero; keep transcription provenance in `source:` / notes as needed. Add a real hero later via Phase 1 or 2.
- **Related:** `recipes/Macarons au Chocolat.cook`

### Ticket: Drop source-scan hero — Ganaches au Chocolat

- **Why:** Same as macarons — source-page photo used as sidecar hero.
- **Do:** Remove or relocate so it isn’t the public recipe image; real hero later.
- **Related:** `recipes/Ganaches au Chocolat.cook`
