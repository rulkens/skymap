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

1. ~~**Fewer mip levels (5 → 3).**~~ **Measured dead (spike 2026-07-22).** `BLOOM_LEVELS = 3`
   saves nothing: a same-session 80-frame A/B on `solar-system` gave bloom 5.4 ms / 23.5 ms
   total in both configs; `milky-way` was flat too. The cost model in "Why the obvious lever
   does NOT apply" was wrong about which passes are expensive — the 4 passes that 5 → 3 removes
   all operate on the *smallest* mips (`bloom2`→`bloom3`→`bloom4`, 1/8 down to 1/32 res), the
   cheapest in the pyramid (well under 0.5 ms each). Bloom's real cost is the finest, largest
   mips (`bloom0` half-res, `bloom1` quarter-res), which a 3-level pyramid keeps. So the pass
   count is not the lever; a 3-level pyramid pays a narrower glow for zero speedup.
2. **Merge downsample/upsample passes.** Fold adjacent pyramid steps into a single pass to cut
   pass count without losing levels. More work; keeps the wide falloff. Same caveat as option 1
   applies — the removable overhead is on the cheap small mips, so measure the *large*-mip passes
   before assuming a win.
3. **Gate bloom off below a scale threshold / on a perf-tier.** Skip bloom on the cheapest tiers
   or when the frame is already over budget.
4. **Shrink the finest mips (the actual cost).** Bloom cost tracks the largest mips, so a
   `bloom0` at 1/3 or 1/4 res (instead of 1/2) is the fill lever the pass count is not.
   Trade-off: coarser near-glow. Not yet measured.

## Suggested first step

Option 1 is measured-dead (above). The cost is fill on the finest mips, so the live levers are
option 4 (shrink `bloom0`/`bloom1` scale) and option 3 (gate). Measure a `bloom0` scale bump
before committing to option 2's pass-merge work.

## Provenance

Deferred from the sun-full-bloom-pass feature (PR #473), T14 perf pass. Perf numbers + the
`--sweep` classification are recorded in the (completed) plan's Perf section.
