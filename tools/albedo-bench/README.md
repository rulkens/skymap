# Albedo Bench

Local-only Vite dev tool for tuning the Mars de-shading recipe: it removes
the sun shading baked into the Viking MDIM 2.1 colour mosaic, compresses
blown crater rims while keeping the polar ice bright, and grades the colour,
so the Mars tiles carry albedo that the renderer's own lighting shades once.
Run with `npm run albedo-bench` from the repo root; opens on
http://localhost:5700 (see `tools/utils/io/devPorts.ts`).

Spec: `docs/superpowers/specs/2026-09-17-albedo-bench-design.md`.

The bench and the bake run one implementation: what is tuned here is what
Mars is baked with (via `albedoRecipeImagerySource`, wired into
`marsSurfaceBake` separately). Save writes the committed recipe straight to
[`tools/textures/surfaceBodies/marsAlbedoRecipe.json`](../textures/surfaceBodies/marsAlbedoRecipe.json)
— the file the bake reads.

## Using it

- Navigate by lon/lat/span, or jump to a preset (Gale, the south polar cap
  edge, a Viking mosaic strip seam — pick one at the eye check and retarget
  that preset's placeholder coordinates in `ui/viewPresets.ts`).
- Compare original vs adjusted as a wipe, side by side, or flip.
- The arrow overlay draws the fitted shading-direction field (length ∝
  strength, opacity ∝ confidence); the fitted/manual toggle swaps in a
  single hand-picked sun direction for comparison (manual sun is bench-only,
  never saved).
- The lighting-preview toggle relights `adjusted` with an Oren–Nayar
  approximation of the renderer's own tile shading, so a grade change reads
  correctly under a directional sun, not just under flat ambient light.
- Every `AlbedoRecipe` field has a slider. Save validates and writes the
  recipe; reloading the page restores every slider from the committed file.

## Known limit

The shading field comes from 463 m MOLA slopes, so craters smaller than
about 1 km keep their baked-in shading — there's no elevation signal fine
enough to de-shade them. A HiRISE-resolution pass is out of scope for this
bench (design §12).
