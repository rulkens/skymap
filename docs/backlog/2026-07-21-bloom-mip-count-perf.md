# Bloom mip-count perf trim

**Readiness:** ready (measured, mechanism understood)

## Problem

The screen-space bloom pass costs ~5 ms/frame (MERGED `bloom` slot, milky-way). That drops
`solar-system` from a clean 60 fps (14.8 ms) to ~45 fps (22.7 ms) and pushes `milky-way`
further under budget (21.0 → 27.8 ms). In-budget for the feature's quality-first 3–5 ms spec,
but it costs the 60 fps ceiling on the otherwise-cheap solar-system scene.

## Why the obvious lever does NOT apply

`npm run perf -- --sweep` classifies the `bloom` pass as **overhead/CPU-bound (exp 0.21)**, not
fragment-bound — its cost barely tracks pixel count (non-monotonic across 0.5×/1×/1.5×/2×). The
mips are already tiny (`bloom0` half-res through `bloom4` at 1/32), so the ~5 ms is dominated by
the **ten sub-passes' fixed per-pass overhead** (~0.5 ms each), not fill. **Half-res bloom would
not help.**

## Options

1. **Fewer mip levels (5 → 3).** Sheds ~4 render passes (bright + 2 down + 2 up + fold = 6
   passes vs 10), ~half the cost → ~2.5 ms, likely restoring solar-system to 60 fps. Now a
   one-line change: `BLOOM_LEVELS` in `src/data/bloomConstants.ts` is the single home the
   render targets, pyramid uniform arrays, and `runBloom` pass loops all derive from. Trade-off:
   a 3-level pyramid gives a narrower glow falloff (less wide, soft bloom) — a quality/perf dial.
2. **Merge downsample/upsample passes.** Fold adjacent pyramid steps into a single pass to cut
   pass count without losing levels. More work; keeps the wide falloff.
3. **Gate bloom off below a scale threshold / on a perf-tier.** Skip bloom on the cheapest tiers
   or when the frame is already over budget.

## Suggested first step

Try option 1 (`BLOOM_LEVELS = 3`) behind a visual check — it is a one-constant experiment now
that the depth is single-sourced. If the narrower falloff reads acceptably, it is the cheapest
win. Otherwise option 2.

## Provenance

Deferred from the sun-full-bloom-pass feature (PR #473), T14 perf pass. Perf numbers + the
`--sweep` classification are recorded in the (completed) plan's Perf section.
