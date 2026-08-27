# Recipe writing style guide

How we write recipe prose in this cookbook. Recipes are [Cooklang](https://cooklang.org/) `.cook` files: plain-text steps with lightweight markup for ingredients, cookware, and timers. Frontmatter taxonomy lives in the [README](README.md).

## Recipe structure

Every recipe has four layers:

1. **YAML frontmatter** — title, times, servings, tags, and attribution (`source`, `author`, `changes`). See README for canonical keys.
2. **Headnote** — one or more lines starting with `>`. Context, serving ideas, substitutions, and “read this first” tips. Not cooking steps.
3. **Sections** (optional) — `== Name ==` for distinct parts (sauce, dough, assembly). Use when a recipe has multiple phases.
4. **Steps** — blank-line-separated paragraphs. Each paragraph is one cooking step.

Cooklang does **not** use a separate ingredient list. Ingredients appear inline in the order each step uses them.

## Headnotes, steps, and `changes`

| Content | Where it goes |
| --- | --- |
| Source credit (`source`, `author`) | YAML frontmatter — shown on recipe pages; do not repeat in a headnote |
| Substitutions, serving suggestions, storage | Headnote (`>`) at the **top**, when the cook needs context before starting |
| Extra provenance (book edition, transcription issue) | Trailing note (`>`) **after** the last step — footnote-style |
| What to look for while cooking | Step body (with a timer when timing matters) |
| How this file differs from the source | Frontmatter `changes` list |
| Tips that are not source diffs | Step body or headnote — never `changes` |

**Skip the headnote** when everything worth saying is already in the steps or frontmatter. Do not open with “Adapted from…” — that duplicates `source` / `author`.

Do not repeat a step in the headnote. If a technique appears in the steps, the headnote should add context only (why, when optional, what to serve with).

Omit `changes` until a recipe has been reviewed against its source. Use `changes: []` when reviewed with no material deltas.

## Writing steps

### Order

Write steps in the order a cook should perform them.

- Preheat the oven, start water, or heat a pan **before** prep that waits on it.
- If a component must finish first (sauce before assembly), put that section or those steps first.
- Ask: what happens first, second, third?

### One action per paragraph

Each step should cover one clear action or one continuous phase (e.g. “sauté aromatics until soft,” “simmer until reduced by half”). Split when a step mixes unrelated tasks or buries a critical cue.

Bad (two actions, tip in the middle):

```cook
Knead the dough for ~{3%minutes}. Coat your hands in flour first — you should also flour the work surface.
```

Better:

```cook
Sprinkle flour on the work surface and coat your hands. Knead the dough for ~{3%minutes}.
```

### Heat levels

Always say the heat when stovetop or oven temperature matters:

- `over medium-high heat`, `over low heat`, `in a 350°F oven`
- When heat changes mid-step, say so: “Bring to a boil over high heat, then reduce to a simmer over medium-low.”

### Time and doneness

Pair approximate times with a sensory or temperature cue. Timers use Cooklang markup: `~{10-15%minutes}`.

- Good: `Simmer until reduced by half, about ~{10-15%minutes}.`
- Good: `Cook until golden brown and an instant-read thermometer reads 165°F, about ~{5%minutes} per side.`
- Weak: `Cook for ~{5%minutes}.` (add what “done” looks like)

Timers do not replace doneness tests for meat, bread, or reductions.

### Concision

Steps are instructions, not essays. Technique tangents, brand anecdotes, and optional variations belong in the headnote unless they are essential to execute the step.

## Ingredients in prose

### Markup

- `@ingredient{quantity%unit}` — structured quantity
- `@ingredient{}` — no fixed amount (salt to taste, optional garnish)
- `@ingredient{qty}(preparation)` — prep shorthand after the braces

Example:

```cook
Add @garlic{3%cloves}(minced) and cook until fragrant, about ~{1%minute}.
```

### Prep order in text

Prep words describe what the cook should do **before** using the ingredient:

- `@walnuts{1%cup}(chopped)` — measure, then chop
- `@mushrooms{1%cup}(sliced)` — slice before or after measuring depending on recipe; be consistent within a file

When prep order matters, say so in the headnote or step.

### Order of use

Within a step, mention ingredients in the order they go into the pan or bowl. Across the recipe, the first appearance of each ingredient should match the order a cook reaches for them while reading top to bottom.

### Divided and repeated ingredients

When the same ingredient appears in more than one step, say **remaining** for later additions:

```cook
Heat @olive oil{1%tbsp} in a #skillet{} over medium-high heat.

Repeat with the remaining @olive oil{1%tbsp} and the remaining chicken thighs.
```

## Cookware and equipment

Mark pots, pans, and tools with `#`:

```cook
Heat @oil{1%tbsp} in a #12-inch skillet{} over medium-high heat.
```

Prefer specific sizes when they affect the result (`#12-inch skillet`, `#Dutch oven`, `#9x13 baking dish`). Generic terms are fine for bowls and spoons.

### Primary method vs alternatives

CookCLI lists **every** `#cookware{}` mention in the recipe's Cookware sidebar. Cooklang has no built-in “OR” grouping — tagging both `#grill{}` and `#nonstick skillet{}` implies you need both.

When a recipe offers pick-one methods (grill, skillet, oven, etc.):

1. Tag `#cookware{}` only on the **primary** (household-default) method.
2. Put that method in the main step flow or in a section labeled preferred (e.g. `== Assemble & cook (preferred) ==`).
3. Put alternates in their own sections (`== Grill (alternative) ==`, `== Oven option ==`). Write alternate cookware in **plain text** — no `#`.

Example (skillet primary):

```cook
Heat a thin film of oil or cooking spray in a #nonstick skillet{} over medium-high heat. Cook the patties ~{4-5%minutes} per side until cooked through and an instant-read thermometer reads 160°F.

== Grill (alternative) ==

Clean and grease grill grates. Heat to medium-high. Grill the patties a few minutes per side until cooked through and an instant-read thermometer reads 160°F.
```

### Inline alternatives

When two items are interchangeable in a **single** step, tag the preferred one and name the other in prose:

```cook
In a #large Dutch oven{} or stock pot, melt @butter{4%tbsp}.

Heat a #nonstick griddle{} or large pan over medium heat.
```

Do not tag both unless the recipe truly requires both at once.

## Finishing

End with serving, resting, or storage when it helps:

- “Serve immediately.”
- “Rest covered for ~{10%minutes} before fluffing with a fork.”
- Storage shelf life belongs in the headnote unless it is a critical step (e.g. “Refrigerate at least ~{2%hours} before eating.”).

## Consistency across the book

- Use generic ingredient names, not brands, unless the brand matters (`@naan` not “Trader Joe's naan” in steps — put store notes in the headnote).
- Pick one term per ingredient within a recipe (`scallions` or `green onions`, not both).
- Use `@kosher salt{}` and `@black pepper{}` (or `@freshly ground black pepper{}`) for “season to taste” unless the recipe specifies otherwise.
- Keep `course`, `tags`, and folder placement aligned with README taxonomy.

## Quick checklist

Before merging a prose edit:

- [ ] Steps are in logical cook order; oven/water/pan heat starts early enough.
- [ ] One clear action per paragraph.
- [ ] Heat levels stated wherever temperature matters.
- [ ] Times paired with doneness cues; meat has temperature or clear visual test.
- [ ] Ingredients inline with `@` markup; prep in `(parentheses)`.
- [ ] “Remaining” used for split ingredients.
- [ ] Headnote omitted or adds context only — no attribution, no repeated steps.
- [ ] Cookware marked with `#` on the primary method only; alternates in plain text (see [Cookware and equipment](#cookware-and-equipment)).
- [ ] Final step or headnote covers serve/rest/store when useful.
