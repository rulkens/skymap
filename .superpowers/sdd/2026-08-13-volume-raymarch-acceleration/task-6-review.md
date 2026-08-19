# Task 6 review — cone-footprint LOD + honest step sizing

Reviewed: `0218c610e` (diff `34d612772..0218c610e`), against
`task-6-brief.md` and `docs/superpowers/specs/2026-08-12-volume-raymarch-acceleration-design.md`.
Read-only review; nothing changed in the worktree. Test/typecheck evidence taken
from the implementer's report as instructed.

---

## 1. Spec compliance

| # | Brief requirement | Verdict |
|---|---|---|
| 1 | `coneDiameter = 2·t·pixelConeTan` — factor accounting correct end-to-end | ✅ verified (below) |
| 2 | `lod = clamp(log2(coneDiameter/voxelSizeLocal), 0, textureNumLevels(volume)-1)` | ✅ `fragment.wesl:302-305`, `:340` |
| 3 | `textureSampleLevel(volume, volumeSampler, p, lod)` — hardcoded `0.0` gone | ✅ `fragment.wesl:443`; palette LUT correctly keeps `0.0` (`:460`) |
| 4 | LOD is a real LOD, not a clamped no-op (volume must have a mip chain) | ✅ `volumeFieldRenderer.ts:239,257` — `mipLevelCount3d` + `generateMipChain3d(..., 'box')`, and binding 1 uses a default `createView()` so `textureNumLevels` sees the whole chain |
| 5 | `STEP_COUNT` demoted to safety cap only | ✅ semantically (`fragment.wesl:133-138`, `:394`) — but see Important #2 for what the cap now does when it fires |
| 6 | Step length = `voxelSizeLocal · exp2(lod) · STEP_QUALITY`, recomputed per step | ✅ `fragment.wesl:397` |
| 7 | Saturation early-out at `SATURATION_THRESHOLD` kept | ✅ `fragment.wesl:519` |
| 8 | Per-fragment jitter kept | ✅ `fragment.wesl:368-371` (now sized off the entry-point step) |
| 9 | Sliders never trigger a rebuild — Task 5's cutoff derivation untouched | ✅ `fragment.wesl:373-388` is byte-identical to Task 5; the new constants are compile-time `const`s; nothing bake-time added |
| 10 | Temp debug heatmap return reverted | ✅ `fragment.wesl:529` returns `accum * fade.opacity`; no `TEMP DEBUG` anywhere |
| 11 | Visual checkpoint before numbers | ✅ per report — ⚠️ **partial**: two poses, static captures, tier medium only. Motion-dependent artifacts (LOD popping, post-skip banding) and tier large are not covered by that evidence |
| 12 | Measured vs Task 1 and Task 5 baselines | ✅ paired A/B in the report and commit body |
| 13 | `npm run typecheck` green; suite green | ✅ per report (1023 files / 6903 tests) |
| 14 | Commit carries before/after numbers | ✅ commit body |
| 15 | `wesl-shaders` skill invoked before editing | ⚠️ Cannot verify from diff — done (if at all) in the first implementer's dead session; the report doesn't claim it. No WESL-level defects found (import block, `package::` paths, and struct prefix untouched), so this is a process gap only |
| 16 | Comment budget on the diff's additions | ❌ see Minor #1 |

### Factor accounting, verified (not just asserted)

- Populate site, `scalarVolumeLayer.ts:45`: `pixelConeTan = 2·tan(fovYRad/2) / vh`.
  Perspective is linear in tan-space, so half the vertical FOV spans `tan(fovY/2)`
  over `vh/2` pixels ⇒ **one full pixel's** tan-width is `2·tan(fovY/2)/vh`. That is
  `2·tan(θ_pixel)` where `θ_pixel` is the spec's pixel *half*-angle.
- Consume site, `fragment.wesl:303`: `coneDiameter = t · pixelConeTan`
  `= t · 2·tan(θ_pixel)` = the spec's `2·t·tan(θ_pixel)`. **Exact match, no double
  count, no missing 2.**
- Unit consistency: `t` is a LOCAL-space distance (`rayDirLocal` is normalised
  after `invModel` — `fragment.wesl:326`), and `voxelSizeLocal` is local, so the
  ratio is dimensionless. The comment's "local↔world factor cancels" is exactly
  right **for a uniformly-scaled cube**; see Minor #3 for the anisotropic case.
- The `vh` used for `pixelConeTan` is the volume target's own downscaled height
  (`scale: 3`, `renderTargets.ts:197`), which is the right one — the march runs at
  that resolution.

### Skip-semantics deviations from Task 5 — analysed as requested

- **SKIP_CHECK_STRIDE = 4 is correctness-neutral.** A deferred check can only
  *miss* a skip, never cause one. An un-skipped step inside a provably-empty cell
  samples it normally, and `cellMaxDev < skipCutoff = deadband − 0.05` is precisely
  the point where `applyContrastWindow`'s `smoothstep(deadband−0.05, …)` returns
  visibility 0, so the contribution is exactly `0`. Integral unchanged. ✅
- **Stride phase after a skip is bounded.** A skip does `i = i + 1`
  (`fragment.wesl:428`), so the next `i % 4 == 0` is at most 3 iterations away —
  no unbounded deferral, no phase lock-out. ✅ (It does burn budget; see Important #2.)
- **Direct jump to `skipExitT + eps` preserves the integral** in the same sense
  Task 5's grid landing did — the omitted span is proven zero-contribution.
  ✅ *at LOD 0*; see Minor #2 for the LOD>0 caveat, and Important #3 for the
  sampling-phase side effect the grid landing used to protect.
- No backward-jump / infinite-loop hazard: `skipExitT` is the exit of the cell
  containing `p`, so `≥ t`; and even a float-edge case terminates because `i`
  increments on every skip.

---

## 2. Task quality: **Changes Requested**

The core of the task is right — the formula is correct end-to-end, the LOD is a
real LOD against a real mip chain, the step sizing is honest, the skip throttle is
provably safe, and the debug landmine is gone. Two small items should land before
this merges; both are a few lines.

### Critical

None.

### Important

**#1 — `volumeSampler` has no `mipmapFilter`, so the new fractional LOD selects a
mip by rounding: hard LOD transitions, not blended ones.**
`src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts:129-135` sets
`magFilter/minFilter: 'linear'` but omits `mipmapFilter`, whose WebGPU default is
`'nearest'`. `textureSampleLevel` still honours the sampler's mip filter: with
`'nearest'`, a computed `lod` of 1.49 vs 1.51 reads two *different* mips with no
blend.
Failure scenario: `lod` varies continuously with `t` **along each ray**, so every
ray crosses `lod = 0.5, 1.5, 2.5…` at fixed distances. That paints hard-edged
concentric detail shells around the camera in the fog, and they slide as the
camera dollies — i.e. exactly the "no new popping between LOD levels" the brief
made a checkpoint item, and it is a *stationary* screen artifact, the complaint
class this whole feature exists to kill. It went unseen because the visual check
was two static captures at poses where (per the arithmetic below) `lod` is pinned
to 0 anyway.
Fix: add `mipmapFilter: 'linear'`. The BGL already declares binding 2 as
`sampler: { type: 'filtering' }` (`:159`), so nothing else changes. Then re-check
one moving pose from *outside* the cube, where `lod > 0` actually occurs.

**#2 — `STEP_COUNT` as a hard `break` can now truncate a ray mid-cube; at tier
large it does so systematically.** `fragment.wesl:394` breaks on `i >= STEP_COUNT`
with no fallback, and step length no longer adapts to the ray's remaining length.
Worked numbers (all from this repo, not hypotheticals):
- `fovY = 60°` (`cameraFraming.ts`), volume target `scale: 3`, canvas height is
  device px (`frameContext.ts` uses `canvas.height`), so at 900 css px @dpr2:
  `vh = 600` ⇒ `pixelConeTan ≈ 0.001925`.
- MCPM tier large = `MCPM_BASE_DIMS/2 = [356, 600, 364]` (`buildMcpmVolume.ts:34`)
  ⇒ `voxelSizeLocal = 1/600`, LOD-0 step `= 2/600 = 0.00333` local.
- `lod > 0` needs `t ≥ 1/(pixelConeTan · 600) ≈ 0.866` local — but 256 LOD-0 steps
  only reach `t ≈ 0.853`. So **inside the large cube, a ray that neither saturates
  nor skips hits the iteration cap before the LOD ever leaves 0**, and everything
  past ~0.85 local units (≈474 Mpc along x, out of a 937 Mpc cube) is never
  sampled. Tier medium (`max dims 300`) is marginal by the same arithmetic:
  256 × 0.00667 = 1.707 vs a 1.732 diagonal — which is why the medium-tier visual
  check saw nothing.
Failure scenario: user is inside the MCPM cube on a high-tier device; the far half
of the cosmic web is missing and the cut-off distance moves with the camera.
Saturation and empty-space skips hide it in dense/void directions, so it will
present as unexplained dimming of far haze rather than an obvious wall — the worst
kind to diagnose later. Note SKIP_CHECK_STRIDE=4 makes it slightly worse: three of
every four iterations in a void are spent stepping instead of skipping.
Fix (either): raise `STEP_COUNT` so `STEP_COUNT · voxelSizeLocal · STEP_QUALITY`
covers √3 at the largest shipped `max(dims)` (600 ⇒ needs ≥ 520), or — cheaper and
self-maintaining — floor the step by the remaining budget:
`stepLength = max(lodStep, (tMax - t) / f32(STEP_COUNT - i))`, which is a no-op
whenever the LOD step already fits and guarantees full coverage when it doesn't.
Either way, please state the chosen invariant in the `STEP_COUNT` comment; the
current text ("SATURATION_THRESHOLD still bounds the common case") is the
assumption that fails here.

**#3 — the direct skip jump discards the per-fragment jitter phase for the rest of
the ray.** `fragment.wesl:427`: `t = skipExitT + CELL_EXIT_EPS`. The comment's
reason ("no fixed step-grid left to stay phase-aligned to") is sound, but it drops
the *property* Task 5's landing preserved rather than just the mechanism: after a
skip, every ray that skipped the same pyramid cell resumes on that cell's exit
plane, and since `stepLength` varies smoothly with `t`, neighbouring pixels stay
phase-correlated from there on. That is the correlated-phase condition the jitter
block (`:342-356`) exists to prevent, and MCPM runs `densityScale = 18` where
per-step opacity is large enough to show it.
Failure scenario: a slow orbit through a void into a filament shows faint fixed
banding on the pyramid-cell lattice at void→structure boundaries, stationary in
world space (worse than the temporal grain it replaced).
Fix: re-jitter on resume — `t = skipExitT + CELL_EXIT_EPS + hash * stepLength`
(reusing the existing hash, or the same `jitterSeed` offset by `i`) restores
decorrelation for one extra hash per skip. If you'd rather not spend it, that's a
defensible call — but then the skip comment should record the tradeoff instead of
claiming the jump "changes nothing", because it does change sampling phase.

### Minor

**#1 — the diff's own comment additions are over budget.** 71 added comment lines
vs 27 added code lines in `fragment.wesl` (~2.6:1) against the project's "≤ half
the code lines". The report's framing — that the 2.3:1 file-wide ratio is
inherited Tasks 1-5 debt — is accurate for the *file* and correctly flagged, and
net comment lines did drop 387→357; but the new material itself is the heaviest
part of the diff. Concrete trims, no information lost: `STEP_COUNT` `:133-137`
(5 → 2 lines), `SKIP_CHECK_STRIDE` `:154-159` (6 → 3), `STEP_QUALITY` `:161-166`
(6 → 3), and the `pixelConeTan` reconciliation is still stated twice at full length
(`fragment.wesl:104-109` **and** `scalarVolumeLayer.ts:37-44`) — one side should be
the canonical home and the other a one-line pointer. Not a blocker; fold into
whichever of the Important items you touch.
Also `fragment.wesl:165-166` points a shipped source comment at
`task-6-report.md`, an SDD ledger file that gets archived — point at the spec, or
inline the one number that matters.

**#2 — "provably empty ⇒ zero contribution" is now only exactly true at LOD 0.**
`fragment.wesl:420-426` (and the `skipCutoff` docblock `:383-386`) reason about
full-res samples, but the march now reads mip level `lod`. A texel at `lod ≥ 3`
spans ≥ 8 base voxels — comparable to a pyramid level-0 cell (dims/8) — so a
trilinear read just inside an "empty" cell can pick up non-empty neighbours that
the un-skipped march would have integrated. Bounded and tiny in practice (`lod ≥ 3`
needs `t ≳ 7` local, i.e. the cube only a few pixels wide), and it errs toward
*less* light, never more. No code change needed; the absolute claim in the comment
should get a "at LOD 0" qualifier so nobody later builds on it.

**#3 — the LOD/step model assumes an isotropic cube; MCPM is not one.**
`buildCubeModelMatrix.ts:99-102` scales per axis by `dims[i] · voxelSize`, and MCPM
medium is `[178, 300, 182]` — a 1.68:1 box. Local space is therefore anisotropic,
so the "local↔world factor cancels" identity (`fragment.wesl:106-108`) is exact
only for cubic dims, and `voxelSizeLocal = 1/max(dims)` is the *smallest* local
voxel edge, biasing `lod` coarse by up to ~0.75 of a level in a direction-dependent
way. Pre-existing in the uniform's definition (Tasks 4-5), newly load-bearing here.
Worth one line in the `voxelSizeLocal` comment recording that it is the min-edge
approximation, so a future anisotropy bug isn't re-derived from scratch.

**#4 — last-step overshoot is unclamped.** `fragment.wesl:491,521`: per-step alpha
uses the full `stepLength` even when `tMax - t < stepLength`, so every ray
over-counts up to one step of optical depth at the exit, and grazing rays whose
whole span is shorter than one step can now be over-weighted — or, if
`tMin + jitter ≥ tMax`, dropped entirely (`:394`), which the old
`(tMax-tMin)/STEP_COUNT` sizing made structurally impossible. Masked today by
`sphericalEnvelope` fading exactly those grazing/corner rays, which is why it
didn't show. `min(stepLength, tMax - t)` in the alpha term closes it if you're in
the file anyway.

### Notable, not a defect

At the `volume-inside` pose on tier medium @dpr2, `lod` is clamped to 0 for the
whole cube (`lod > 0` needs `t ≥ 1.73` local, the cube's own diagonal). So the
measured 2.2 → 1.4 ms win at that pose comes from the step-sizing and
skip-throttle changes, **not** from mip sampling — the cone-LOD half of the task
is exercised only by outside/distant views (`local-group`). Worth knowing before
anyone attributes future numbers at that pose to the LOD.
