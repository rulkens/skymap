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
- **Not the fold — a wash.** The fold (`bloom0 → hdr`, a full-viewport write) was removed from
  `runBloom` and fused into the `hdr→swap` tonemap shader (compositor reads `bloom0` and adds
  `bloom0 * strength` before tone-mapping — implemented, renders correctly). A quiet-machine
  **interleaved paired A/B** (base ↔ fused alternated 4 rounds, `solar-system` 80 frames)
  centred on **zero**: per-round Δ(base−fused) = +1.0, −2.5, +0.2, +0.1 ms, mean ≈ −0.3 ms, well
  inside the ~4 ms round-to-round drift; the `bloom` slot was identical every round (base
  5.4/4.7/4.5/5.4 vs fused 5.3/5.3/4.5/5.4). No measurable win. Mechanism: fusing deletes one
  fullscreen fold pass but adds a `bloom0` sample to the tonemap pass, so the read-modify-write
  work relocates 1:1 rather than disappearing — the fold's cost was never removable overhead,
  it was necessary work. (An earlier note here claimed bloom's cost was "two full-viewport HDR
  endpoints, bright read + fold write" — this disproves the fold half.)

**On measurement method:** an initial batched attempt (all-baseline then all-fused) was
contaminated by intermittent background load (`solar-system` totals ranged 16.7–23.9 ms across
identical configs). Interleaving base/fused per round is what made the comparison trustworthy —
any drift then hits both states equally. Batch-then-batch A/Bs on this machine are unreliable.

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
3. ~~Fuse the fold into `hdr→swap`.~~ **Measured dead (interleaved quiet-machine A/B, no win).**
   Implemented + reverted. The work relocates 1:1 into the tonemap pass, it does not disappear.
   Do NOT revisit standalone. The only scenario that could still pay is folding BOTH this and the
   sibling `2026-07-21-fold-star-upsample-into-tonemap.md` into one tonemap pass so two fullscreen
   passes collapse into zero — and even that must be measured (interleaved) before any build,
   because this fold alone proved a wash.
4. **Merge downsample/upsample passes.** Cut pass count by fusing pyramid steps. Only worth it if
   step 1 shows per-pass overhead dominates.
5. **Gate bloom off below a scale threshold / on a perf-tier.** The cheap, always-available
   fallback — skip bloom on the cheapest tiers or when the frame is already over budget.

## Provenance

Deferred from the sun-full-bloom-pass feature (PR #473), T14 perf pass. Three follow-up spikes
2026-07-22 (this session). Perf numbers + the `--sweep` classification are recorded in the
(completed) plan's Perf section.
