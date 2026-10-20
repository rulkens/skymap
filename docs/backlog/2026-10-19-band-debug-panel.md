# Band debug panel

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, [grill session](../grill-sessions/layer-scale-bands-2026-10-18.md) Q12.

The old `SCALE_FADE_BANDS` table doubled as a one-place overview of the descent. With Layers declaring `bands` on their visibility entries, the overview is the composed list `appVisibility.ts` builds, but nothing shows it live. A snapshot test of that list would fail on every retune and catch no bug, so the replacement is a dev panel.

Sketch: a dev-overlay panel listing every banded entry and band (`entry.band`, its items) with the value `bandValueOf` gives at the current view, plus the distance it measures (`from` or the Sun). `CameraBandBar` in the debug panel is the camera-regime strip, not a band overview, and is not the home.

Open: whether to add the cross-Layer match (Local Bubble shell and the constellation figures both leaving at `NEIGHBOURHOOD_RECEDE_KPC`) as a visible pairing, or leave it to the shared constant.
