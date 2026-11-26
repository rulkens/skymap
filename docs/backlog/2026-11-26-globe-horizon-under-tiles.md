# Globe horizon lookup runs under the tiles

**Raised:** 2026-11-26, final review of PR #1179 (terrain horizon shadows).

## Problem

Up close, the globe's horizon lookup (`earthPass.ts:78`, `texturedBodiesPass.ts:90` decide its rect) runs on every pixel the surface tiles later cover. Earth draws the globe before the tiles (draw order in `src/layers/body/.../layer.ts`), and the Moon/Mars globe shader writes `frag_depth` (`texturedBody/fragment.wesl`), which disables early-z. So the horizon cost roughly doubles there: on the phone, 4-8 loads for the globe plus 4-8 for the tiles.

Never timed: the phone and desktop A/Bs excluded the globe map.

## Why the obvious fix is unsafe

Skipping the globe lookup while the cut is engaged loses shadows where the globe shows through. Leaves at `baseLevel` always drop (`deepestResidentAncestor` never probes `baseLevel`). Leaves also drop while streaming, after eviction, on atlas overflow and past `MAX_LEVEL_DELTA`. In all those spots the globe is what the user sees.

## Direction

The globe has to skip only where a drawn leaf covers it, for example with a coverage mask or a depth pre-pass. Price that first.
