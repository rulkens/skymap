---
name: site-composition
description: The visual grammar for composing a section of the Skymap website, in the site's own tokens - choosing a direction, hierarchy and emphasis, the type roles, the twelve-column grid, spacing, order in a row, text over renders, the page's arc. Use in site-restyle's plan step beside frontend-design, and whenever you lay out or restyle a site section.
---

# Site composition

How a section of the companion website is put together. The tokens are in
`packages/website/src/styles/site.css` (plus the app's `src/styles/tokens.css`); the grid and
rhythm classes are in `packages/website/src/styles/layout.module.css`. Where `ui-ux.md` already
states a rule, it is not repeated here.

## Choosing a direction (site-restyle step 2)

- Sketch two or three directions that differ in **what the reader meets first and where the boldness
  goes**: a full-bleed render, an oversized heading, an asymmetric split, a pinned sequence. Two that
  differ only in colour or ornament are one direction.
- **Fix the criteria before comparing them**, from the page's job and the rulings. Each criterion
  must be able to fail a direction ("the render is the first thing seen at 1440 and at 400"; "no two
  neighbouring sections share a layout"). "Feels premium" can fail nothing.
- Pick one. **Never graft parts of the losers onto it**; a blend nobody argued for leads on nothing.
  Write one line per loser in the plan: what it tried, what it lost on.

## Hierarchy and emphasis

- Four levels: primary (the h2 or the render), secondary (the lead, the section's picture),
  tertiary (body, captions), quaternary (labels, credits).
- Reach for the cheapest tool first: position, then space, then colour token, then weight, then size.
- Adjacent levels differ clearly. `--text-h3` (1.5rem) is only 1.2× `--text-body`, so an h3 is set
  apart by its face and colour, never by size alone.
- **One emphasis per section, one boldest place per page.** Something stands out only when its
  neighbours are alike; make it differ in more than hue (size, position, weight) so it survives
  greyscale. Every extra highlight weakens the one that matters.

## Type roles

| Role | Tokens |
| --- | --- |
| Section title | h2, `--text-h2`, display face, `--leading-display` |
| Lead | `--text-lead`, `--measure-lead`, `--site-text-muted` |
| Body | `--text-body`, `--weight-body`, `--leading-body`, `--measure` |
| Caption, label | `--text-small`, `--weight-small`, `--site-text-dim` or `--site-text-faint` |

- 44ch holds about 50 characters of Jost: right for a landing page, short for reading. Keep body
  copy between 45 and 75 characters; captions stay shorter than the body.
- A wider measure needs more leading. Large headings take slightly negative tracking (set
  globally); all-caps labels take 0.05–0.12em.

## Grid and edges

- Every side-by-side part is a `.grid` with spans (`.halves`, `.thirds`, `.quarters`, or `--cols`),
  so a column edge in one section is a line the sections above and below also use.
- An asymmetric split (7/5, 8/4) reads as designed; 6/6 with equal weight on both sides reads as
  undecided.
- A grid break (a render going full-bleed or into the gutter) is deliberate: one per section at
  most, and the text stays on the grid.
- Shared left edges make the grid visible without drawn lines. An edge that is off by a few pixels
  reads as a mistake, not a choice.

## Space

- Between sections: `--section-space`. Inside a section nothing exceeds half of it; prose stacks on
  `--stack`, columns on `--col-gap`.
- Proximity sets the groups: the gap inside a group is smaller than the gap between groups. A heading
  sits closer to its own text than to the section above it.
- Use the weakest container that works: space, then one rule, then a background, then a border.

## Order in a row

- The first and last items in a row are remembered best and the middle least. Put the strongest at
  the ends; an item that must sit in the middle needs something visibly its own.
- Three to five items per row; past that, group them.
- Items of one kind look identical: same radius, caption style, link treatment. An unintended
  difference reads as a different kind of thing, so treat it as a bug.

## Text and renders

- Where the render leads, it is the figure. Text sits beside it by default, not on it.
- Text goes on a render only over a calm region. Measure against the brightest pixel behind it, and
  add an edge gradient built from token colours when it fails. A text shadow alone is not enough.
- The crop keeps the subject clear of the frame edge and the caption. At 400 px choose another crop
  (art direction) rather than shrinking the same one.
- On black, a dark render's edge can vanish. A hairline at low contrast is allowed then and only then.

## Dark surfaces

- The ground is `--color-bg` (black). A raised surface is lighter than what is under it, because
  shadows don't show on black. Text is never pure white, and large bright areas are rare and earned.

## The page's arc

- A page is remembered by its strongest moment and by its end. Put the boldness (and most of the
  motion) at the peak. Give the last section before the footer the same care as the opening, ending
  on an action. A page that ends on a bare link list or a credits block is a finding.
- No uniform everything: vary section length and density with the content. A section with one thing
  to say can be one line.

## Credit

Adapted from MC Dean's Designer Skills Pack (github.com/Owl-Listener/designer-skills): `ui-design/skills/`
visual-hierarchy, typography-scale, readable-measure, layout-grid, spacing-system, dark-mode-design,
aesthetic-usability, von-restorff-effect, law-of-proximity, law-of-common-region, law-of-similarity,
law-of-continuity, law-of-closure, law-of-figure-ground; `interaction-design/skills/` serial-position-effect,
peak-end-rule; `prototyping-testing/skills/` parallel-concepts, concept-selection.
Copyright (c) 2026 MC Dean, MIT License; full text in `.claude/skills/LICENSE-designer-skills.txt`.
