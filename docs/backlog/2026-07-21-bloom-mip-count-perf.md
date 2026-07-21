# Bloom fill-cost trim

**Readiness:** needs-design — the two easy levers are measured-dead (see below); the live lever
is fusing the fold into `hdr→swap`, which is a real (not one-line) change.

## Problem

The screen-space bloom pass costs ~5 ms/frame (MERGED `bloom` slot, milky-way). That drops
`solar-system` from a clean 60 fps (14.8 ms) to ~45 fps (22.7 ms) and pushes `milky-way`
further under budget (21.0 → 27.8 ms). In-budget for the feature's quality-first 3–5 ms spec,
but it costs the 60 fps ceiling on the otherwise-cheap solar-system scene.

## What the cost actually is (spikes 2026-07-22)

Two spikes localised it. The bloom pyramid runs 10 sub-passes, but only **two touch the
full-res HDR target**: the bright prefilter *reads* full-res `hdr` (→ `bloom0`), and the fold
*writes* full-res `hdr` (`runBloom.ts:140`, `openBloomPass(..., viewOf('hdr'), ...)`). Every
pass between operates on tiny mips. The ~5 ms is those two full-viewport HDR round-trips plus
fixed per-pass overhead — **not** the pyramid interior. This reconciles the `--sweep`
classification (overhead-bound, exp 0.21 — cost is two fixed DRAM round-trips, not proportional
fill) with both dead spikes below.

## Options

1. ~~**Fewer mip levels (5 → 3).**~~ **Measured dead (spike 2026-07-22).** `BLOOM_LEVELS = 3`
   saves nothing: a same-session 80-frame A/B on `solar-system` gave bloom 5.4 ms / 23.5 ms
   total in both configs; `milky-way` flat. The 4 removed passes all operate on the *smallest*
   mips (`bloom2`→`bloom3`→`bloom4`, 1/8 down to 1/32 res) — the cheapest in the pyramid. Never
   the cost.
2. ~~**Shrink the finest mips.**~~ **Measured dead (spike 2026-07-22).** `bloom0` at 1/3 res
   (`scale: 3 * 2**n` → 3/6/12/24/48) gave no change on `solar-system` (bloom 5.4 → 5.4) and
   was slightly *worse* on `milky-way` (4.7 → 5.1, likely noise/cache). Fill on the mips is not
   the cost — the bright pass reads full-res `hdr` and the fold writes full-res `hdr` regardless
   of mip size, so shrinking the mips leaves both endpoints untouched.
3. **Fuse the fold into `hdr→swap` (the live lever).** The fold is a full-viewport read-modify-
   write of the `hdr` target that adds `bloom0 * strength`. The `hdr→swap` tonemap pass already
   does a full-viewport read of `hdr`; sampling `bloom0` there and adding before tonemap deletes
   one full-viewport HDR round-trip — the single biggest bloom sub-pass, and the fold is the LAST
   bloom pass so nothing downstream reads its `hdr` write except the tonemap itself, making this
   the clean fold. Shares the tonemap pass with the sibling item
   `2026-07-21-fold-star-upsample-into-tonemap.md`, but the two are NOT symmetric: the star-
   upsample fold is gated because bloom's bright prefilter reads `hdr` and must still see the
   star glow, so star-upsample cannot simply move *past* bloom into tonemap without also feeding
   bloom's bright input. The bloom fold has no such constraint. Design the two together, land the
   bloom fold first.
4. **Merge downsample/upsample passes.** Fold adjacent pyramid steps to cut pass count. Now known
   low-value — the pyramid interior is not the cost (options 1+2). Deprioritised.
5. **Gate bloom off below a scale threshold / on a perf-tier.** Skip bloom on the cheapest tiers
   or when the frame is already over budget. The cheap escape hatch if the fold-fuse is deferred.

## Suggested first step

Options 1, 2 (the two one-liners) are measured-dead. The cost is the two full-viewport HDR
endpoints (bright read + fold write), so the real win is option 3 — fuse the fold into the
tonemap pass, unified with the star-upsample fold item. Option 5 (gate) is the cheap fallback.

## Provenance

Deferred from the sun-full-bloom-pass feature (PR #473), T14 perf pass. Perf numbers + the
`--sweep` classification are recorded in the (completed) plan's Perf section.
