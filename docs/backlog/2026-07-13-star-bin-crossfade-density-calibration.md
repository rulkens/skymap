# Star-bin ↔ MW-cloud crossfade density calibration

**Status:** manual — polish follow-up to the shipped Gaia star bin's v1 hand-tuned crossfade band.

## Context

The Gaia star bin (regime "c" — the real-data middle of the continuous
zoom, decided in the 2026-07-13 star-bin grill session; live via the
`crossfadePc` band in `starCatalogLayer.ts`) hands off to the procedural
Milky Way point cloud via a hand-tuned camera-distance crossfade band (star
bin fades out, procedural cloud fades in, over ~2→5 kpc from the Sun — same
fade-band mechanism as the MW cloud sprite, `e04ec827`).

V1 accepts a possible visible seam at the band: real Gaia density, luminosity
function, and color mix will not exactly match the procedural cloud's inner
region, so a careful eye may catch a brightness step or texture change
mid-fade.

## The follow-up

Calibrate the procedural MW cloud's inner-region parameters (stellar density,
luminosity function, color mix) against Gaia counts in the overlap shell so
the crossfade becomes near-invisible.

- Touches the galaxy-renderer tool's parameter surface, not the star bin.
- Only worth doing after the seam is visually judged on the dev server —
  the v1 band may be good enough.
- Prereq baked into v1 to keep this cheap: the band endpoints are named
  constants, not literals buried in a shader.
