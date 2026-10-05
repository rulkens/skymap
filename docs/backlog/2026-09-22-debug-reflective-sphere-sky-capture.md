# Debug reflective sphere to eye-check the sky cubemap capture

`ready` · DebugPanel · filed 2026-09-22, out of the starCatalog Layer PR 2

## What it is

`skyCubemapBlitPass.ts` bakes the capture roster (stars, the Milky Way band,
aggregates) into a cubemap, and `sgrAStarLensingRenderer.ts` is its ONLY
consumer today — the lensed view through Sgr A*'s gravitational lens. Eye-
checking a capture regression (a missing source, a wrong exposure, a stale
face) means flying all the way to the Galactic Centre and reading it back
through the lens's own distortion, which confounds "is the capture wrong"
with "is the lens wrong".

## The ask

A debug-only mirror sphere, parked in Earth orbit (or any near-field spot a
DebugPanel toggle can park it at), whose material samples the same sky
cubemap undistorted — a second, direct consumer. Eye-checking the capture
roster then takes one toggle near Earth instead of a trip to Sgr A* through
the lens.
