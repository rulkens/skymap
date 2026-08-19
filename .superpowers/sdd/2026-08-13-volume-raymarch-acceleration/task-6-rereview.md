# Task 6 fix round 1 — re-review

Reviewed: `ffad99458` (diff `0218c610e..ffad99458`) against `task-6-review.md`'s
three Important findings. Read-only; nothing changed in the worktree.
Test/typecheck evidence taken from `task-6-report.md`'s "Fix round 1" section
as instructed (not re-run).

## Verdicts

**Important #1 (mipmapFilter) — ADDRESSED.**
`volumeFieldRenderer.ts:132` adds `mipmapFilter: 'linear'` to the
`volumeSampler` descriptor, exactly the review's prescribed fix. The BGL
already declares binding 2 as `filtering` (unchanged), so `textureSampleLevel`
now trilinear-blends across the fractional `coneLod` instead of rounding to a
single mip.

**Important #2 (STEP_COUNT truncation) — ADDRESSED.**
`fragment.wesl:398-410`: `lodStepLength` is the original LOD-driven step;
`stepLength = max(lodStepLength, (tMax - t) / f32(STEP_COUNT - i))` is the new
per-iteration floor. Verified the scrutiny points directly:
- **No zero/negative/NaN.** `STEP_COUNT - i` is evaluated only after the loop
  guard `if (i >= STEP_COUNT || t >= tMax) { break; }` has already excluded
  `i >= STEP_COUNT`, so `remainingSteps ∈ [1, STEP_COUNT]` always — never
  zero. `tMax - t` is likewise always `> 0` at this point (same guard). No
  divide-by-zero, no NaN path.
- **Guarantees coverage.** At `i = STEP_COUNT-1`, `remainingSteps = 1`, so
  `stepLength ≥ tMax - t`, meaning `t + stepLength ≥ tMax` — the loop's next
  iteration breaks on `t >= tMax` rather than `i >= STEP_COUNT` truncating the
  ray. Kills the tier-large "far half never sampled" bug the review measured.
- **Optical-depth correctness.** `fragment.wesl:511` (`let alpha = lut.a *
  u.intensity * u.densityScale * stepLength * visibility * envelope`) and
  `:541` (`t = t + stepLength`) both use the floored `stepLength`, not
  `lodStepLength` — the actual step taken is the one weighting the sample, so
  the floor override doesn't desync alpha from the distance actually
  advanced. Correct.

**Important #3 (skip jump decorrelation) — ADDRESSED.**
`fragment.wesl:446-447`: `skipJitter = hash21Hq(jitterSeed + vec2(f32(i)*3.17,
f32(i)*5.91))`; `t = skipExitT + CELL_EXIT_EPS + skipJitter * lodStepLength`.
- **Varies per ray.** `jitterSeed` (`:373`) is `fragCoord.xy + vec2(frame*…)`
  — per-fragment and per-frame — so every ray's skip lands at a different
  offset; salting by `i` additionally prevents a single ray's successive
  skips from reusing one offset. Not a constant.
- **Doesn't bias the integral.** This is the same jittered-Riemann-sum pattern
  the file already uses for entry jitter (`:356`, "jitter averages to
  stepLength/2"): the post-skip landing point is randomized within one
  `lodStepLength`-sized cell and the following sample's `stepLength` weights
  that whole cell, so it's an unbiased stratified estimator, not a dropped
  span. (One documentation nit, not a defect: the code comment at `:444-445`
  states the omitted span was "already proven [zero]" by `skipCutoff` — that
  proof covers only up to `skipExitT`; the extra jitter range reaches into
  the next, *unverified* cell, so the real justification is the
  jittered-sampling argument above, not the skip-cutoff proof. Doesn't change
  the verdict.)

## New breakage introduced by this diff

None found. Both files typecheck-clean by inspection (no dangling
references to the renamed `stepLength`→`lodStepLength`+`stepLength` split,
`hash21Hq` already imported and used pre-diff, sampler descriptor syntax
unchanged elsewhere). Out-of-scope one-liner only: `skipJitter` scales by
`lodStepLength` rather than the floor-adjusted `stepLength`, a trivial
inconsistency near ray-end only, not a bug.
