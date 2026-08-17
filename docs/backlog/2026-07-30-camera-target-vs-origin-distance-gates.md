# Foreground gates are derived as camera-to-origin bounds and read as camera-to-target

`needs-design` · Rendering · filed 2026-07-30, out of the S-star-orbits far-plane analysis

## What it is

`FOREGROUND_MAX_DISTANCE_MPC` and `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` are both
**derived** from distances measured from the render origin, and both are **read**
against `ctx.cam.distance`, which is the camera's distance from its orbit
_target_. The two quantities coincide only when the camera happens to orbit the
origin.

## Evidence

Derivation — origin-relative:

- `foregroundMaxDistance.ts:89-94` maps every body and star through
  `distanceMpc(RENDER_ORIGIN_MPC, …)`; `:99` takes the max; `:126` multiplies by
  `MARGIN = 100`.
- `solarSystemLabelMaxDistance.ts:47` is that same extent × 4.

Consumption — target-relative:

- `assembleOrbitCamera.ts:57` derives `position = target + distance · dir`, so
  `cam.distance` is a camera-to-target radius.
- Every NEAR0 layer gates on it: `atmosphereDrawList.ts:59`,
  `bodyGlintsLayer.ts:126,149`, `cloudShellLayer.ts:120`, `earthLayer.ts:83`,
  `foregroundLabelsLayer.ts:395-396`, `orbitTrailsLayer.ts:148`,
  `planetsLayer.ts:90,110`, `ringsLayer.ts:135`, `starPointsLayer.ts:108`,
  `starSpheresLayer.ts:89`, `texturedBodiesLayer.ts:111`.
- `bodyGlintsLayer.ts:112,369` reads the label gate the same way.

One consumer is origin-keyed and therefore consistent with the derivation:
`SCALE_FADE_BANDS.surveyDeepZoom.fullAt` (`scaleFadeBands.ts:66`), which is a band
edge compared against `hypot(camPos)`.

## Why it is benign today

All NEAR0 content sits within a few kpc of the origin, so any focus target the
user can pick is also near the origin, and `cam.distance ≈ hypot(camPos)` to
within the ×100 margin. Nothing observable is wrong.

## When it stops being benign

Once NEAR0 content exists far from the origin — Sgr A\* and the S-stars are the
first case — a user can orbit-focus a body 8 kpc away. `cam.distance` then reports
a parsec-scale radius while `hypot(camPos)` reports 8 kpc, and the two gates
answer different questions. Today the _permissive_ reading wins (the foreground
stays enabled at the Galactic Centre, which is what we want), so the S-star work
depends on the current semantics rather than fixing them. That is worth deciding
deliberately rather than inheriting.

## The decision to make

Either:

1. **Keep the target semantics and say so.** Rename the constants to name a
   _focus-relative_ scale, and re-word the derivations' docblocks, which currently
   argue enclosure-from-the-origin. Cheapest, and matches what the code does.
2. **Split the two questions.** A scale gate (compared against `cam.distance`) and
   a locality gate (compared against `hypot(camPos)`, or against
   `regionRelativeDistanceMpc`) are different predicates that happen to share one
   number. Only worth it if a case appears where the permissive reading is wrong.

Option 1 is the likely answer; the item exists so the choice is recorded rather
than assumed.

## Related

- `docs/superpowers/specs/completed/2026-07-30-s-star-orbits-design.md` — the
  far-plane section that surfaced this, and which deliberately does not fix it.
- [`2026-07-31-milky-way-approach-fade-keyed-on-the-sun`](2026-07-31-milky-way-approach-fade-keyed-on-the-sun.md)
  — the same family, filed separately because it is a live visual bug rather
  than a decision to record: that band is derived AND read consistently against
  origin distance, so it has none of the mismatch this item is about; it just
  asks the wrong question. This item's "when it stops being benign" section
  predicted the Galactic Centre; that one is what actually arrived. Worth
  settling both in one sweep of the origin-keyed gates.
