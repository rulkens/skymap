# Constellation interactivity (fly-to + highlight)

**Status:** deferred (from the constellations feature, grill Q8 —
`docs/grill-sessions/constellations-2026-07-22.md`)

## The idea

The constellations layer ships as pure annotation (no hover/click/InfoCard).
Two follow-on candidates once it exists:

- **Fly to a constellation**: search-palette entries ("Orion") that fly the
  camera to an Earth-ish vantage framing the figure. Composes via the existing
  search/selection + camera-tween machinery — no line picking needed. Needs a
  per-constellation camera pose derivation (look direction = label anchor
  direction from the Sun; distance chosen so the figure fills the view).
- **Hover/selected highlight**: brighten one figure's lines. The renderer
  already draws per-constellation contiguous instance ranges, so a highlight
  is a per-draw range + brightness multiplier — the hard part is the *trigger*
  (thin quads are terrible pick targets; a screen-space "nearest label"
  hover proxy or search-selection is more plausible than pixel picking).

## Why deferred

Q8 decision: v1 keeps the pick system untouched (5-bit source codes are
append-only budget); the famous stars inside the figures are already the
interactive objects, and "fly to Orion" is better served by search than by
clicking a 1.5 px line.

## Prerequisites

- Constellations layer shipped (artifact provides names, anchors, and instance
  ranges).
