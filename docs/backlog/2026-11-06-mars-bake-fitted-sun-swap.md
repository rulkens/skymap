# Mars bake: switch to the fitted-sun de-shade

**Status:** `needs-design` — ruled at the albedo bench landing (#752, 2026-09-17): "land bench,
replace later".

## Problem

Two de-shade implementations coexist. `marsSurfaceBake` de-shades Viking with
`delightedImagerySource` and `MARS_VIKING_DELIGHT` / `MARS_VIKING_GRADE` from
`tools/textures/surfaceBodies/marsAlbedoRecipe.ts`: one fixed photo sun (az 64°, el 28°) plus a
flatten step. The albedo bench tunes `albedoRecipeImagerySource`, which fits a sun field
per region from MOLA slopes, and saves to `marsAlbedoRecipe.json`, which nothing in the bake
reads. Both already share the grade (`ColourGrade` + `gradeRgbaInPlace`).

## Work

- Tune `marsAlbedoRecipe.json` in the bench (`npm run albedo-bench`). F4's values do not
  transfer: fixed sun + flatten against a fitted field with neither.
- Point `marsSurfaceBake` at `albedoRecipeImagerySource`; delete `delightedImagerySource`,
  `AlbedoDelight` and the TS recipe constants it alone uses.
- Re-bake `mars-tiles/`, eye-check against the current bake, deploy.
- Update the bench README, `docs/DATA.md` (Mars sources) and the website's Albedo bench
  section, which all say the bake does not read the bench's recipe yet.

## Bench leftovers (same effort, optional)

- Decode/lattice cache: about 44 % of a slider tick; needs `fitSunField` restructured.
- Scale `FIT_CANVAS_LEVEL` / `SLOPE_LEVEL` with the preview factor (also a `fitSunField`
  change).
- The fit does not wrap at the antimeridian (README known limit).
