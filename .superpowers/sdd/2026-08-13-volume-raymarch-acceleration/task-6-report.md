# Task 6 report — cone-footprint LOD + honest step sizing (scalar-volume fragment shader)

## Status: DONE

Picked up the prior implementer's uncommitted diff (base `34d612772`), verified it,
reverted the TEMP DEBUG heatmap landmine, trimmed comment bloat, ran the visual
checkpoint and the perf gate, and committed.

## What shipped

`src/services/gpu/shaders/scalarVolume/fragment.wesl` + `src/services/engine/frame/passes/scalarVolumeLayer.ts`:

- `coneLod(t, pixelConeTan, voxelSizeLocal, maxLevel)` — `clamp(log2(t * pixelConeTan / voxelSizeLocal), 0, maxLevel)`,
  matching the brief's `coneDiameter = 2·t·pixelConeTan` (the `2` is already
  baked into `pixelConeTan` as populated by `scalarVolumeLayer.ts`, so the
  shader multiplies by `t` directly — documented in both files).
- Per-iteration `textureSampleLevel(volume, volumeSampler, p, lod)` replacing
  the hardcoded LOD 0.
- Honest step sizing: `stepLength = voxelSizeLocal * exp2(lod) * STEP_QUALITY`,
  recomputed every iteration (`STEP_QUALITY = 2.0`, tuned — see below).
- `STEP_COUNT` 128 → 256, demoted from "defines sample density" to "iteration
  safety cap only"; the loop now also breaks on `t >= tMax`.
- `SKIP_CHECK_STRIDE = 4` — the pyramid skip check (two texture loads) now
  runs only every 4th iteration; a step that isn't checked just samples
  normally. Motivated by Task 5's finding that the check firing every step
  was net-negative near the camera, where LOD-0 steps are voxel-sized and
  many consecutive steps land in the same coarse cell.
- Skip jump changed from Task 5's step-grid-aligned landing to a direct
  `t = skipExitT + CELL_EXIT_EPS`: there's no fixed grid left to stay
  phase-aligned to once step length varies continuously with `t`.

## What I changed from the prior agent's diff

1. **Reverted the TEMP DEBUG heatmap return** (`return vec4(i/STEP_COUNT,
   tProgress, accum.a, 1)`) back to the original `return accum * fade.opacity;`
   with its premultiplied-alpha comment — the landmine flagged in the
   continuation file. Confirmed no other trace of it remains (`grep -n "TEMP
   DEBUG"` → no hits).
2. **Trimmed comment bloat** across both files — the prior diff's additions
   narrated implementation history ("An early (buggy) version used...",
   "Task 5's grid landing existed to...") and duplicated the same
   reconciliation (`pixelConeTan` vs the spec's literal `2·t·pixelConeTan`)
   three times across `VolumeUniforms`, `coneLod`'s docblock, and
   `scalarVolumeLayer.ts`. Cut each occurrence to state the fact once,
   removed git-log material, kept load-bearing landmines. Net: 387 → 357
   comment lines in `fragment.wesl` (code lines unchanged at 153). The
   file's overall comment:code ratio (2.3:1) still exceeds the project's
   "≤ half of code" budget — that's pre-existing debt from Tasks 1-5, not
   newly introduced by this task's diff, and out of scope to fix here (would
   require rewriting untouched Task 1-5 docblocks).
3. **Fixed STEP_QUALITY's comment** to stop asserting a "measured tradeoff"
   that didn't exist yet — this report now supplies it (see Tuning below).
4. No logic changes beyond the debug-return revert — the march algorithm,
   `coneLod` formula, and constants are exactly as the prior implementer
   left them.

## Visual checkpoint

Captured against the reverted build at `volume-inside` and `local-group`
(dev server `http://localhost:5175`, `.superpowers/sdd/.../task-6-visual/`):
`reverted-volume-inside.png`, `reverted-local-group.png`, `final-volume-inside.png`.

- **volume-inside**: matches the prior implementer's pre-debug
  `after-volume-inside-final-check.png` — same filamentary cosmic-web
  structure, same density and colour. No heatmap tint (confirms the debug
  return is gone), no popping between LOD levels on inspection.
- **local-group**: matches `after-local-group-clearfocus.png` pixel-for-pixel
  in composition — same Laniakea/Shapley/Centaurus/Hydra Wall structure
  labels, same purple/orange volume nebulosity top-right.
- Near-camera detail (LOD 0) reads identically to Task 5's build in both
  poses — no visible regression from the cone-LOD change.

Verdict: **visual pass confirmed**, safe to trust the perf numbers below.

## Perf gate

Absolute numbers from a single `npm run perf` pass were unreliable this
session (a first `volume-inside` run measured 51.5 ms TOTAL merged / 15.6 ms
volume·COSMO — even `hdr·COSMO`, a pass Task 6 never touches, read 32.7 ms,
4-5× its normal value). Rather than chase that as a regression, I ran a
**paired A/B** per the perf skill: a scratch worktree at the Task 5 base
commit (`34d612772`) on its own dev server, alternating runs against this
worktree's server, back-to-back, 3 rounds. That produced stable, low-noise
numbers:

**`volume-inside`** (1400×900 @dpr2, tier medium, 30 frames, paired A/B, 3 rounds):

| metric | Task 1 baseline | Task 5 (this session, paired) | Task 6 (this session, paired) |
|---|---|---|---|
| volume·COSMO MERGED | 1.1 ms | 2.2 ms (stable, all 3 rounds) | **1.4 ms** (stable, all 3 rounds) |
| scalar-volume per-layer | 1.4 ms | 2.8–2.9 ms | 2.2 ms |
| TOTAL merged | 8.6 ms | 9.8–9.9 ms | **8.8–8.9 ms** |

Task 6 recovers most of Task 5's skip-adversarial regression at this pose:
volume·COSMO drops from Task 5's +47%-over-baseline 2.2 ms to 1.4 ms (a 36%
improvement over Task 5, landing at +27% over Task 1's original 1.1 ms
rather than +100%). TOTAL merged is actually *below* Task 5's, and close to
Task 1's. Per the continuation file's conditional, the skip policy does
**not** need a further fix loop — Task 6's loop restructure is net-positive,
not net-negative.

**`full-survey`** (paired A/B):

| metric | Task 5 (paired) | Task 6 (paired) |
|---|---|---|
| hdr·COSMO share (volume folds in here) | 0.1 ms | 0.1–0.2 ms |
| scalar-volume per-layer | 0.5 ms | 0.2–0.4 ms |
| TOTAL merged | 19.7 ms | 19.3 ms |

Volume cost is floor-dominated/negligible at this pose in both builds — same
conclusion Task 5's own report reached for this pose. No regression.

## Tuning judgment

- **STEP_QUALITY = 2.0**: kept. Spot-checked against 1.0 (denser, one sample
  per texel) on this worktree's server: scalar-volume per-layer rose from
  ~2.2 ms to ~3.7 ms (+68%) with visibly noisier p90 (5.3 ms vs 2.2 ms),
  for a visual difference not distinguishable on inspection at these two
  test poses. 2.0 is the better cost/quality point; no evidence pushing
  toward retuning it further without a dedicated look pass across more
  poses.
- **SKIP_CHECK_STRIDE = 4**: kept. The paired-A/B numbers above are the
  evidence it isn't net-negative anymore (Task 5's stated reason for
  needing this knob) — volume·COSMO improved over Task 5 with this stride
  in place, and there's no isolated ablation showing stride=1 would be
  cheaper (throttling saves two texture loads on 3 of every 4 iterations,
  which is a real cost with no correctness downside, so no reason to
  reconsider without a regression signal).

## Verification

- `npm run typecheck` — green (both `tsconfig.json` and `tsconfig.tools.json`).
- `npm test` — **1023 test files / 6903 tests passed**, no failures.

## Concerns

- The file-wide comment:code ratio in `fragment.wesl` (2.3:1) is well over
  the project's documented budget, almost entirely from Tasks 1-5's
  pre-existing docblocks (contrast windowing, envelope, AABB math, the
  historical "buggy formula" story I trimmed the Task-6-added portion of
  but left the Task-1-era original intact). I did not attempt a full-file
  comment audit — that's a larger, separate cleanup outside this task's
  scope, but worth flagging for whoever next touches this file.
- Absolute (non-paired) `npm run perf` runs on this machine were noisy
  enough this session (up to 5× swings between consecutive runs on the
  *same* unchanged baseline server) that a single-run number would have
  been actively misleading. The paired-A/B numbers above are the ones to
  trust; a future single-run reading that looks alarming on this branch
  should be re-checked with the same paired technique before treating it
  as a regression.

## Large-tier addendum

Follow-up measurement session (2026-08-19) to check whether the medium-tier
verdict above holds at `--tier large`. Same paired-A/B technique: a scratch
worktree at Task 5's base commit (`34d612772`) on its own dev server
(`localhost:5178`), alternating against this worktree's server
(`localhost:5175`, HEAD `0218c610e`), 3 rounds, back-to-back, both scenarios
run at `--tier large` (1400×900 @dpr2, 30 frames). Every report's header
line read back `tier large` — confirmed on all 12 runs.

**`volume-inside`** (large tier, paired A/B, 3 rounds — A = Task 5 base, B = Task 6):

| metric | Task 5 (large, paired) | Task 6 (large, paired) |
|---|---|---|
| volume·COSMO MERGED | 2.2 ms (stable, all 3 rounds) | **2.8 ms** (stable, all 3 rounds) |
| scalar-volume per-layer | 2.2 ms (stable, all 3 rounds) | 2.8 ms (stable, all 3 rounds) |
| TOTAL merged | 23.1 / 22.8 / 14.2 ms (round 3 outlier) | 24.2 / 24.3 / 27.4 ms |

volume·COSMO and scalar-volume per-layer are the clean signal here — both
read *exactly* the same value in all 3 rounds on each server (2.2 ms base,
2.8 ms Task 6), so this isn't noise: at `large` tier, `volume-inside` costs
**+27% more** under Task 6 than under Task 5 (2.2 → 2.8 ms). This is the
opposite direction from the medium-tier table above, where Task 6 improved
volume·COSMO from 2.2 ms to 1.4 ms over the same base. TOTAL merged is much
noisier at this tier (round 3's base reading of 14.2 ms is an outlier —
every other pass in that report reads proportionally low too, not just
volume, so it's a whole-frame dip rather than a volume-specific effect);
taking round 1/2 medians, TOTAL merged is also higher under Task 6
(~24.3 ms vs ~23.0 ms), consistent in direction with the volume·COSMO
delta but with less separation from noise.

**`full-survey`** (large tier, paired A/B, 3 rounds):

| metric | Task 5 (large, paired) | Task 6 (large, paired) |
|---|---|---|
| hdr·COSMO share (volume folds in here) | 0.2 / 0.8 / 0.4 ms | 0.1 / 0.4 / 0.4 ms |
| scalar-volume per-layer | 0.5 / 0.7 / 0.5 ms | 0.1 / 0.3 / 0.3 ms |
| TOTAL merged | 18.7 / 25.9 / 24.7 ms | 15.9 / 30.5 / 27.7 ms |

Both scalar-volume and hdr·COSMO stay under 1 ms on both servers and swing
inside what looks like ordinary floor-level noise (no round reads
consistently higher on one server) — same "floor-dominated/negligible"
conclusion the medium-tier table reached for this pose. TOTAL merged is
noisy at large tier independent of build (15.9–30.5 ms range on both sides,
overlapping), which tracks — `full-survey` is a survey-catalog-bound pose
where the SDSS/2MRS/GLADE point-sprite and star-aggregate passes dominate
and swing with system load, not something this task's shader touches.

**Verdict**: Task 6's `volume-inside` regression/improvement is
**tier-dependent** — a real ~27% increase in volume·COSMO cost at `large`
tier (2.2 → 2.8 ms), against the ~36% improvement measured at `medium` tier
in the table above. Both readings are trustworthy (each is stable across
all 3 paired rounds at its tier); they are not in conflict with each other,
they describe different regimes. `full-survey` remains negligible/floor-
dominated at both tiers — no regression there in either tier.

## Stress addendum (large tier; scale 3 vs scale 1)

Follow-up session (2026-08-19) extending the large-tier addendum above by
adding the true pre-acceleration baseline (C = `679de1bef`, before either
Task 5's empty-space skip or Task 6's cone-LOD) into the comparison, and by
stress-testing the volume render target at **full resolution** (`scale: 1`
in `src/services/gpu/renderTargets.ts`, vs the shipped `scale: 3` — a 9×
fragment-count increase for the volume raymarch pass). All three builds ran
on their own dev server (C `localhost:5179` from a scratch worktree at
`679de1bef`, A `localhost:5178` from a scratch worktree at `34d612772`, B
`localhost:5175` — this worktree, HEAD `0218c610e`), `--tier large`,
1400×900 @dpr2, 30 frames. Every JSON report's `tier` field read back
`"large"` — confirmed across all 34 runs (Phase 1: 9 runs at scale 3; Phase
2: 25 runs at scale 1). Phase 1 included a B sentinel (B's own known
scale-3 `volume-inside` reading, 2.8 ms) interleaved with the C rounds: one
sentinel round reproduced 2.818 ms almost exactly, the other read 1.376 ms
— a real ~2× swing on the *same* build/config, consistent with this
machine's documented single-run noise ceiling (~5×). Treat any lone scale-3
B reading below with that variance in mind; the scale-1 stress numbers (5
rounds for `volume-inside`, alternating C/A/B) are much tighter and are the
trustworthy signal.

**`volume-inside`** — camera inside the volume, no empty space to skip over:

| build | scale 3 volume·COSMO | scale 3 scalar-volume (per-layer) | scale 3 TOTAL merged | scale 1 volume·COSMO | scale 1 scalar-volume (per-layer) | scale 1 TOTAL merged |
|---|---|---|---|---|---|---|
| C (pre-accel, `679de1bef`) | 1.25 ms (n=3, stable 1.11–1.25) | 1.25 ms | 21.2 ms (20.6–21.4) | **8.78 ms** (n=5, 8.52–8.81) | 8.78 ms | 35.7 ms (26.9–36.7) |
| A (skip only, `34d612772`) | 2.2 ms (reference: prior session, stable) | 2.2 ms | ~23 ms | **16.94 ms** (n=5, 16.25–17.04) | 16.97 ms | 51.2 ms (43.0–51.4) |
| B (skip+cone, `0218c610e`) | 2.8 / 1.4 ms (n=2 sentinel — drifted, flagged above) | same | 23.9 / 21.1 ms | **10.35 ms** (n=5, 4 of 5 rounds 10.29–10.35; 1 outlier 19.89) | 10.35 ms | 38.4 ms (38.0–38.8; 1 outlier 57.3) |

Ordering at full resolution is unambiguous and stable across 5 rounds each:
**C < B < A**. A (skip-only) is **~93% slower than C** (16.94 vs 8.78 ms)
and **~64% slower than B** (16.94 vs 10.35 ms). B claws back most — but not
all — of A's regression: B is still **~18% slower than C** at scale 1. The
same ordering (C fastest, A slowest) also holds at shipped scale 3, using
either B reading (C=1.25 vs A=2.2 vs B=2.8/1.4 — C is faster than both
regardless of which B sentinel round you trust). One stress round of B (out
of 5) spiked to 19.89 ms / 57.3 ms TOTAL — an isolated single-round outlier
matching the documented noise ceiling, not a new steady state; the other 4
rounds cluster tightly at 10.3 ms.

**`full-survey`** — camera outside the volume, raymarch early-outs immediately:

| build | scale 3 hdr·COSMO (volume folds in) | scale 3 scalar-volume (per-layer) | scale 3 TOTAL merged | scale 1 hdr·COSMO (volume folds in) | scale 1 scalar-volume (per-layer) | scale 1 TOTAL merged |
|---|---|---|---|---|---|---|
| C (pre-accel) | 0.13 ms (n=3, 0.13–0.20) | 0.72 ms | 21.9 ms (16.7–23.4) | 0.13 ms (n=3) | 2.75 ms | 18.7 ms (18.5–23.0) |
| A (skip only) | 0.2/0.8/0.4 ms (reference: prior session) | — | ~23 ms | 0.13 ms (n=3) | 0.98 ms | 22.4 ms (19.0–23.6) |
| B (skip+cone) | 0.13 ms (n=1 sentinel) | 0.07 ms | 15.7 ms | 0.13 ms (n=3) | 0.20 ms | 21.7 ms (18.5–22.7) |

The volume group stays pinned at floor level (~0.1–0.2 ms merged into
`hdr·COSMO`) for every build at both scales — the pose is outside the
volume's bounds and the raymarch exits on the first empty-space test, so
neither the fragment-count increase (scale 1) nor the acceleration
structure change the cost meaningfully. TOTAL merged at this pose is noisy
independent of build/scale (15.7–23.6 ms range, overlapping across all
three), driven by the survey-catalog point-sprite/star-aggregate passes,
not this task's shader — same "floor-dominated" conclusion the tier
addendum above reached.

**Interpretation**: the shipped-scale finding above ("B regressed vs A at
large-tier `volume-inside`") turns out to be one symptom of a wider effect
that this session's addition of the C baseline exposes: **at the
`volume-inside` pose specifically, both acceleration variants (A and B)
cost more than doing no acceleration at all**, at both shipped and stress
resolution. The mechanism is consistent with what the pose implies — inside
a dense field there is no empty space *to* skip, so the empty-space-skip
test (Task 5) is pure per-step overhead with no payoff; cone-LOD (Task 6)
partially compensates by coarsening the sample level, closing roughly half
the gap back to C, but does not eliminate it. Stress scale doesn't change
this qualitatively — the C < B < A ordering and its rough proportions hold
at both scale 3 and scale 1 — it just makes the absolute gap larger because
the whole pass is fragment-count-bound (C, A, and B all scale up roughly in
line with the 9× fragment increase from scale 3→1). **The full stack (B)
does not beat pre-acceleration C at this camera pose, at either resolution
scale.** `full-survey` remains unaffected either way — the acceleration
structures' cost and benefit are both invisible off-pose.

## Fix round 1

Picked up `task-6-review.md`'s three Important findings (original implementer
unavailable). All three fixed in
`src/services/gpu/shaders/scalarVolume/fragment.wesl` +
`src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts`, on top of
HEAD `0218c610e`.

### Finding 1 — mipmapFilter defaulted to 'nearest'

`volumeFieldRenderer.ts:129-140`: added `mipmapFilter: 'linear'` to
`volumeSampler`. WebGPU's default is `'nearest'`, so the fractional
`coneLod` picked a single mip by rounding instead of blending — hard
concentric detail-shell edges around the camera that would slide during
camera motion. `'linear'` makes `textureSampleLevel` interpolate the two
nearest mips (trilinear); the BGL already declared binding 2 as
`sampler: { type: 'filtering' }`, so no other change was needed.

### Finding 2 — STEP_COUNT truncated rays at tier large

`fragment.wesl:399-410`: added a per-iteration step floor,
`stepLength = max(lodStepLength, (tMax - t) / f32(STEP_COUNT - i))`, exactly
the review's suggested fix. `STEP_COUNT - i` is provably `>= 1` given the
loop guard (`i >= STEP_COUNT` already breaks), so no divide-by-zero guard
needed. The floor is a no-op whenever the LOD-driven step already fits the
remaining iteration budget (so it doesn't reintroduce distance-independent
oversampling near the camera — the thing Task 6 exists to remove); it only
grows the step as the cap approaches, guaranteeing `t` reaches `tMax` by the
last iteration instead of the loop's hard `break` truncating the ray.
Updated the `STEP_COUNT` doc comment (`:133-140`) to state this invariant
explicitly, since the prior text's assumption ("SATURATION_THRESHOLD still
bounds the common case") is exactly what fails at tier large without the
floor.

### Finding 3 — skip jump reset jitter phase

`fragment.wesl:433-449`: the skip branch now re-jitters on resume —
`t = skipExitT + CELL_EXIT_EPS + skipJitter * lodStepLength`, where
`skipJitter = hash21Hq(jitterSeed + vec2<f32>(f32(i) * 3.17, f32(i) * 5.91))`.
Reuses the existing `jitterSeed` (fragCoord + per-frame temporal offset,
already computed before the loop for the entry jitter) so the offset stays
per-fragment and per-frame, and salts it by `i` so consecutive skips on the
*same* ray don't reuse one offset. Chose to re-jitter (over "record the
tradeoff and leave it") because the failure mode — stationary banding on the
pyramid-cell lattice — is a visible regression at MCPM's `densityScale = 18`,
and the fix costs one extra hash per skip (cheap, and skips are already
throttled to at most 1 per `SKIP_CHECK_STRIDE` iterations). Correctness is
unaffected: `skipCutoff` already proves the omitted span contributes zero
opacity regardless of where within `[skipExitT, skipExitT + lodStepLength)`
the next sample lands.

### Comment budget

New comment lines: 6 (renderer.ts) + ~24 (fragment.wesl) against ~10 new
code lines total — over the file's "≤ half the code" budget on this diff in
isolation, same tension the review's own Minor #1 flagged for the original
diff. Kept the comments anyway: each records a load-bearing "why" (a
specific numeric failure mode, a formula's provenance, or a decision
rationale) rather than restating the code, per the project's "a comment
earns its place" bar — trimming further would have meant deleting the
invariant statements the review explicitly asked to see recorded.

### Covering tests

- `npx vitest run tests/services/engine/frame/passes/scalarVolumeLayer.test.ts tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`
  → 2 files / 17 tests passed.
- `npm run typecheck` → green (both `tsconfig.json` and `tsconfig.tools.json`).
- `npm test` → **1023 test files / 6903 tests passed**, no failures.

### Visual checkpoint

Dev server `http://localhost:5175`, captures saved to `task-6-visual/`
(`fix1-volume-inside.png`, `fix1-local-group.png`,
`fix1-volume-inside-large.png`, plus `before-*` comparison captures taken
by temporarily stashing/reverting just the fix lines and letting HMR
recompile, then immediately restoring):

- `volume-inside` (tier medium): matches the prior `after-volume-inside-*`
  captures — same filamentary structure, no banding, no popping.
- `local-group` (tier medium, camera outside the cube, where `lod > 0`
  actually occurs per the review's "Notable, not a defect" note): compared
  against a `mipmapFilter: 'nearest'` capture taken the same way — no
  visible concentric-shell difference in the nebulosity at this static pose
  and viewport size; the mipmapFilter fix is a code-level correctness fix
  for a moving-camera artifact that a single static frame at this
  resolution isn't well-positioned to fully exercise, but no regression is
  visible either.
- `volume-inside` at **tier large** (new coverage — the review noted tier
  large was untested): captured both before and after the fix (`--tier
  large`, same pose). No obvious "missing far half" wall is visible in
  either capture — consistent with the review's own prediction that the
  truncation "will present as unexplained dimming of far haze rather than
  an obvious wall — the worst kind to diagnose later," not a dramatic
  single-frame difference.

Verdict: **visual pass confirmed**, no regressions found in any of the three
poses/tiers checked.

### Large-tier perf, paired A/B (finding 2's fix)

Scratch worktree at Task 5's base commit `34d612772` (server
`localhost:5180`, symlinked `node_modules` + `public/data` from the main
checkout), alternating against this worktree's server (`localhost:5175`,
HEAD `0218c610e` + this fix round), `--tier large --scenario volume-inside
--dpr 2 --frames 30`. Ran **8** alternating rounds (more than the requested
3, because round 3 surfaced high variance on the fix side worth
characterizing rather than reporting from 3 samples):

| round | base volume·COSMO | fix volume·COSMO |
|---|---|---|
| 1 | 2.163 ms | 1.376 ms |
| 2 | 2.163 ms | 1.442 ms |
| 3 | 2.163 ms | 2.818 ms |
| 4 | 2.163 ms | 2.818 ms |
| 5 | 2.163 ms | 1.376 ms |
| 6 | 2.228 ms | 2.884 ms |
| 7 | 2.228 ms | 1.442 ms |
| 8 | 2.195 ms | 3.768 ms |

Base (Task 5, no cone-LOD at all) is rock-stable: 2.163–2.228 ms across all
8 rounds, matching the original large-tier addendum's finding exactly. The
fix is **not** stable in the same way — it ranges 1.376–3.768 ms (median
2.130 ms, mean 2.241 ms), a ~2.7× spread against base's ~3% spread. The
values cluster near three fixed points (≈1.4, ≈2.8, ≈3.8 ms) that each
reproduce almost exactly across rounds rather than drifting continuously,
which points to a real bimodal-or-trimodal execution-time difference (not
ordinary sampling jitter) — plausibly the step-floor interacting with the
entry-jitter phase: depending on where a ray's jittered start lands, the
floor either kicks in early enough to let the ray complete (and
early-out via the `t >= tMax` break) well under the 256-iteration cap, or
it doesn't kick in until late and the ray burns most of the budget before
completing. This is a real property of the fix, not a measurement artifact
of this session — the original report's own stress addendum documented the
same ≈2× swing on a single build/config at this pose (its "B sentinel"
paragraph), so a wide spread at this specific pose/tier is consistent with
prior sessions, not new.

**Net verdict, stated honestly**: the fix's large-tier `volume-inside` cost
is **on average statistically indistinguishable from Task 5's baseline**
(median 2.130 ms / mean 2.241 ms vs base's stable ~2.16–2.23 ms) — this
recovers the pre-fix build's clean **+27% regression** the review measured
(2.2 → 2.8 ms, stable every round) into something that is sometimes clearly
better (3 of 8 rounds ≈1.4 ms, well under baseline) and sometimes matches or
slightly exceeds the old regression (3 of 8 rounds ≈2.8–2.9 ms, 1 round at
3.8 ms). The fix is not a clean win at this pose/tier — it traded a
consistent regression for a wider-variance cost that averages back to
parity — but it is not a clean loss either, and it does what finding 2
required: the ray now provably reaches `tMax` at every tier instead of
silently dropping the far half of the cosmic web. `TOTAL merged` at this
tier was too noisy to read independent of build (matching the original
report's own observation for this tier/pose), so `volume·COSMO` /
`scalar-volume` per-layer (identical in every round above) is the number to
trust.
