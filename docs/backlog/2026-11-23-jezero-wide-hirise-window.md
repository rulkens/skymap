# Jezero: bake the full HiRISE mosaic, not a 3 km window

**Raised:** 2026-11-23, by the owner during the terrain-shadow spike. Backlogged by the owner.

## Current state

- The Jezero rover window is a 3 km square (`MARS_SITE_WINDOW_M = 3000` in
  `tools/textures/surfaceBodies/marsSurfaceBake.ts`), with a 500 m feather into Viking/MOLA. Gale,
  Gusev and Endeavour get the same window.
- The source behind it is much larger: USGS MSR HiRISE mosaic v003 (doi:10.5066/P13CPYYU), 1 m DTM and
  0.25 m ortho over 77.058–77.381 E, 18.136–18.588 N, about 19 × 27 km. It covers the delta and much
  of the crater floor. Registry keys `hirise.jezero.dtm` / `.ortho` in `tools/utils/io/rawDataRegistry.ts`.
- Only `data/raw/hirise/jezero/README.md` is on disk now. The GeoTIFFs need re-extracting from the
  release zip, which is several GB (the ortho alone is about 8 gigapixels).

## Options

1. Grow the window to the whole mosaic. About 50× the z10–17 tiles for this site; measure the R2 and
   bake-time cost before deciding.
2. Add a middle band from the Mars 2020 TRN CTX DTM mosaic (about 20 m, the reference this HiRISE was
   controlled to). It covers the whole 45 km crater and its rim, and fills Mars's empty z8–9 levels.
3. Independent of both: a blended HRSC + MOLA global DEM (about 200 m) instead of MOLA's 463 m.

The terrain-shadow spike found that Jezero's own shadows at Sun elevations of 3° and up come from
within about 2 km. Option 2 would mainly matter for the view from the crater floor and the rim.
