---
category: HUD
---

# SettingsPanelPreview

The renderer settings panel — skymap's main HUD control surface, a collapsible
translucent glass panel of foldable sections that toggle catalog layers and tune
the look of the scene. This is a self-contained, interactive preview of the real
`SettingsPanel`: every toggle, slider, dropdown, and tier chip is wired to local
state so it actually moves, without the app's data engine behind it.

## Sections (top to bottom)

1. **Galaxies** — per-catalog visibility (Famous, 2MRS, SDSS, GLADE, Milliquas,
   DESI), point size, depth fade, brightness-bias mode, absolute-magnitude limit.
2. **Stars** — Gaia star catalog master + per-catalog toggles, size, brightness,
   detail, glow, per-distance exposure, fog cap, famous-star names.
3. **Cosmic web** — diffuse volume fields + filament skeleton, with a
   Smooth / Filaments / Both style picker.
4. **Flow** — CF4 peculiar-velocity overlay (advect / streamline).
5. **Structures** — cluster / supercluster / void / group marker rings.
6. **Labels** — text-annotation categories, plus star and planet names.
7. **Display** — tone-mapping curve, with an **Earth** subgroup (atmosphere
   exposure, ambient light, ocean roughness) nested inside.

The header strip carries a **tier chip** (small / medium / large catalog size),
and the footer has a **Reset camera** button.

## Props

- `defaultOpen?: boolean` — whether the panel starts expanded (default `true`).

## Styling

The panel and every control (collapsible sections, sliders, dropdowns, segmented
switches, the tier chip) read from the design tokens. The panel chrome
(`--surface-panel`, blur, border) and the control atoms (slider tracks, checkbox
accents, focus rings) are the primary restyling surfaces — adjust the tokens for
palette-wide changes, or the section/control CSS for structural ones.
