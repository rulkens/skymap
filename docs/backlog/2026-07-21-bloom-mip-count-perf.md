# Bloom perf — instrument per-sub-pass before any more attempts

**Readiness:** blocked-on-measurement — THREE levers are now measured-dead or marginal (below).
The whole bloom pyramid is instrumented as a SINGLE `bloom` GPU-timing slot, so nobody can see
which of its ~10 sub-passes actually costs the ~5 ms. Split that slot into per-sub-pass
timestamps FIRST; optimise second. Do not attempt another blind lever.

## Problem

The screen-space bloom pass costs ~5 ms/frame (MERGED `bloom` slot, milky-way). That drops
`solar-system` from a clean 60 fps (14.8 ms) to ~45 fps (22.7 ms) and pushes `milky-way`
further under budget (21.0 → 27.8 ms). In-budget for the feature's quality-first 3–5 ms spec,
but it costs the 60 fps ceiling on the otherwise-cheap solar-system scene.

## What the cost is NOT (three spikes, 2026-07-22)

Three separate levers were spiked with the perf harness. All three failed to move the ~5 ms,
which rules out every obvious cost model:

- **Not the mip count.** `BLOOM_LEVELS = 3` (drops 4 sub-passes): bloom slot unchanged. The
  removed passes operate on the smallest mips (1/8..1/32 res), the cheapest in the pyramid.
- **Not the mip fill.** `bloom0` at 1/3 res (`scale: 3 * 2**n`): no change on `solar-system`,
  slightly worse on `milky-way`.
- **Not the fold.** The fold (`bloom0 → hdr`, a full-viewport write) was removed from `runBloom`
  and fused into the `hdr→swap` tonemap shader (compositor reads `bloom0` and adds
  `bloom0 * strength` before tone-mapping — implemented, renders correctly). The `bloom` timing
  slot stayed ~5.3 ms **with the fold gone from it** — proving the fold was never a dominant
  cost. Its ~0.7 ms mostly relocated into `hdr→swap` (which rose accordingly); net frame saving
  ~0.7 ms at best, and it does not restore 60 fps. (An earlier note here claimed bloom's cost was
  "two full-viewport HDR endpoints, bright read + fold write" — the fold spike disproves the fold
  half.)

**Caveat on the numbers:** these runs were on a contended machine (three dev servers + load);
`solar-system` totals ranged 16.7–23.9 ms across identical configs (±7 ms noise), which swamps a
sub-1 ms effect. The robust, noise-independent finding is structural: *removing the fold did not
shrink the single-slot bloom measurement.* Absolute deltas need a quiet machine.

## What's left as the suspect

The ~5 ms is the **bright prefilter** (the one remaining pass that reads the full-res rgba16float
`hdr` target) and/or fixed per-fullscreen-pass overhead across the ~9 remaining passes. These
cannot be told apart today because the single `bloom` slot brackets bright→last-upsample as one
number (`runBloom.ts`, "One timing slot spanning the whole sub-routine"). The `--sweep`
overhead-bound reading (exp 0.21) is consistent with either.

## Suggested first step — MEASURE, don't lever

1. **Split the `bloom` timing slot into per-sub-pass timestamps** (bright / each downsample /
   each upsample). This is a dev-instrumentation change to `runBloom` + the timing service, not a
   perf change. Until it exists, every optimisation is blind — three have already missed.
2. Read the per-pass breakdown on a **quiet** machine. Then, and only then, pick a lever:
   - if bright dominates → attack the full-res `hdr` read (downsample hdr once into a half-res
     source the bright pass reads, or fold bright into the star/hdr pass that last wrote hdr);
   - if it's spread evenly across passes → it's per-pass encoder/DRAM overhead → a compute-shader
     bloom (one dispatch, no per-pass render targets) is the only real fix;
   - if nothing dominates and the budget is the concern → **gate bloom** on scale/tier (the cheap
     escape hatch, always available).

## Options considered (all now down-ranked)

1. ~~Fewer mip levels (5 → 3).~~ Measured dead.
2. ~~Shrink the finest mips.~~ Measured dead.
3. ~~Fuse the fold into `hdr→swap`.~~ Measured marginal (~0.7 ms, noise-obscured, no 60 fps).
   Implemented + reverted. Still the cleanest of the small wins IF combined with the sibling
   `2026-07-21-fold-star-upsample-into-tonemap.md` (shared tonemap pass) — but not worth the
   shared-compositor complecting + HDR-path shader change + iOS verification on its own ~0.7 ms.
   Revisit only after the per-sub-pass instrumentation says the two folds are worth it together.
4. **Merge downsample/upsample passes.** Cut pass count by fusing pyramid steps. Only worth it if
   step 1 shows per-pass overhead dominates.
5. **Gate bloom off below a scale threshold / on a perf-tier.** The cheap, always-available
   fallback — skip bloom on the cheapest tiers or when the frame is already over budget.

## Provenance

Deferred from the sun-full-bloom-pass feature (PR #473), T14 perf pass. Three follow-up spikes
2026-07-22 (this session). Perf numbers + the `--sweep` classification are recorded in the
(completed) plan's Perf section.
