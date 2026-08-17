# Per-source colour-gradient spread

**Status:** needs-design (2026-07-24)

## Ask

`DISK_TINT_SPREAD` is one shared ramp-space constant driving the warm-core /
cool-rim colour gradient for every galaxy catalog. Because the ramp-units-per-
magnitude conversion is per-source, the same constant produces a different
_physical_ colour gradient in each catalog. Derive the spread per source
instead of sharing one constant.

## Current state

- `src/services/gpu/shaders/lib/colorIndex.wesl:177,189-191` — `rampRadial(t, r)`
  calls `ramp(t + DISK_TINT_SPREAD * (0.5 - r))` with `const DISK_TINT_SPREAD =
0.2`, shared by both galaxy passes (points, procedural-disk).
- `src/data/galaxyCatalog/colourIndex.ts:66` — `pickColourIndex` remaps each
  source's raw colour onto the ramp's 0..2 range via
  `((raw - rangeMin) / (rangeMax - rangeMin)) * 2`, so one magnitude of real
  colour is worth `2 / (rangeMax - rangeMin)` ramp units, and that factor is
  fixed per source by its own `colourSpec`.
- Per-source factors, read from each `colourSpec` in `src/data/sources/*.ts`:
  2MRS 5.00 (`twomrs.ts:20`, range 0.7–1.1), the three DESI sources 2.86
  (`desiDeep.ts:47`, `desiSgw.ts:43`, `desiWedge.ts:43`, range 0.35–1.05), SDSS
  and Famous 1.33 (`sdss.ts:18`, `famous-galaxy.ts:26`, range 0.5–2.0),
  Milliquas 1.00 (`milliquas.ts:35`, range 0.0–2.0), GLADE 0.67
  (`glade.ts:20`, range 0.5–3.5, the widest).
- The 0.2 value rests on a measured centre-to-edge gradient of ≈0.15
  mag (SDSS-DR4 spiral disk gradients + early-type d(g−r)/d log r + bulge−disc
  colour offset), converted through the median per-source factor (1.33):
  0.15 × 1.33 ≈ 0.2. One shared constant applied against a per-source factor
  means the effective physical gradient this produces today ranges from
  ≈0.04 mag for 2MRS up to ≈0.30 mag for GLADE — a 7.5× spread in the actual
  colour shift a viewer sees, despite every catalog using the same knob.

## What needs decided

- Replace the shared `DISK_TINT_SPREAD` with a per-source spread, derived
  from each `colourSpec`'s own `rangeMax − rangeMin` and the measured
  gradient for that source, so the physical gradient each catalog renders is
  consistent rather than the ramp-space constant.
- The 0.15 mag figure is a g−r gradient. Applying it uniformly to 2MRS's J−K
  or SDSS's u−g is itself an approximation — a per-band measured gradient
  (where the literature has one) is the more honest input than reusing the
  single g−r figure across every band.
- Where a per-band gradient isn't available (2MRS's J−K, GLADE's B−J,
  Milliquas's B−R), decide whether to fall back to the g−r figure explicitly,
  or flag those catalogs' gradients as approximate.
