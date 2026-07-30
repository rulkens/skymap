---
category: HUD
---

# InfoCard

The floating detail card skymap shows when the user hovers or selects an object
in the 3D scene. It is a fixed-position HUD overlay anchored to the top-right
corner of the viewport, rendered over the black starfield, so its surface is a
translucent dark-blue glass panel that reads against a dark scene.

## Props

- `selected: FocusableTarget | null` — the pinned object. Owns the detail card
  (full rows, Focus / Close pills). `null` shows nothing.
- `hovered: FocusableTarget | null` — the object under the cursor. When it
  differs from `selected`, it renders as a compact preview card stacked beneath
  the pinned detail.
- `selectedMemberCount?: number | null` — catalogued galaxy count, shown only on
  structure (cluster / supercluster / void / group) cards.
- `onFocus?: (target) => void` / `onClose?: () => void` — wire the Focus and
  Close (×) pills on the pinned card.

`FocusableTarget` is a tagged union; the card dispatches on `target.type` and
renders the matching variant with no per-kind branching:

- `galaxyCatalog` — a survey galaxy (SDSS, 2MRS, GLADE, Milliquas AGN, DESI
  tracer) or a curated Famous galaxy (with thumbnail + description).
- `structure` — an extended cluster / supercluster / void / group anchor.
- `milkyWay` — the Milky Way singleton.
- `body` — a scene body: the Sun and famous stars show rich physical rows
  (spectral type, mass, luminosity, age, variability); planets and moons show a
  radius row only.
- `star` — an anonymous survey (field) star, with derived distance and spectral
  class.

## Layout note

Because the root is `position: fixed`, wrap it in an element that establishes a
containing block (any non-`none` `transform`, e.g. `transform: translateZ(0)`)
when you need it laid out inside a bounded region rather than the viewport
corner. The preview cells demonstrate this over a dark backdrop.

## Styling

Every surface, color, radius, and spacing reads from the CSS custom properties
in the design tokens (`--surface-panel`, `--color-fg`, `--space-*`,
`--radius-*`, `--font-family-*`). Card chrome (glass background, top starlight
accent line, focus ring) lives in the card CSS. Restyle by adjusting the tokens
first; reach into the card CSS only for structural changes.
