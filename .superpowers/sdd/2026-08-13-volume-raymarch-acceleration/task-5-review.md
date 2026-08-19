# Task 5 review — TF-adaptive empty-space skip (fragment.wesl)

Commit `34d612772`. Diff scope: `src/services/gpu/shaders/scalarVolume/fragment.wesl` only, as reported.

## Spec ✅

All binding constraints verified directly in the committed diff, not inferred from the report:

- **Cutoff derivation mirrors `applyContrastWindow` exactly.** `contrastDeadband =
  clamp(1.0 - 1.0/max(u.contrast,1e-3), 0.0, 0.9)`, `trimDeadband = clamp(u.trim, 0.0,
  0.95)`, `deadband = max(...)`, `skipCutoff = deadband - 0.05` (fragment.wesl:339-346) —
  byte-for-byte the same constants as `applyContrastWindow`'s own `contrastDeadband`/
  `trimDeadband`/`deadband` (fragment.wesl:200-202) and the same lower edge its
  `smoothstep(deadband - 0.05, deadband + 0.05, dev)` uses (fragment.wesl:209). Computed
  once per fragment, outside the march loop (fragment.wesl:339-347, before `loop {` at
  352).
- **Skip test is the direct comparison**, no raw-space conversion: `coarse.x < skipCutoff`
  / `fine.x < skipCutoff` (fragment.wesl:363, 368).
- **Cell-exit slab test is provably forward-only.** `pyramidCellQuery`
  (fragment.wesl:264-273) derives the cell AABB from the level's *actual*
  `textureDimensions(maxPyramid, level)` at runtime, not an assumed pow2/doubling formula
  — confirmed against the pyramid's real construction
  (`volumeFieldRenderer.ts:267-353`: three `halfCeil` (ceiling-halving) reductions build
  the pyramid's own level 0 at ~dims/8, then `generateMipChain3d` fills levels 1+ via
  `levelDim`'s *floor*-halving). This ceil-vs-floor convention mismatch between the base
  build and the extra mip levels is pre-existing (Task 3) and irrelevant here precisely
  *because* Task 5 reads dims off the texture rather than re-deriving them — Task 3's own
  review already reached this same conclusion for the analogous dims-arithmetic question
  (`task-3-review.md:36`). The advance itself can't go backward or stall regardless of any
  AABB edge case: `stepsToSkip = max(1, i32(ceil((resumeT - t)/stepLength)))`
  (fragment.wesl:383) floors at 1, so `t` strictly increases every iteration whether or
  not `exitT` ever comes out `<= t`.
- **Grid-aligned landing is correct, no off-by-one.** `resumeT = skipExitT +
  CELL_EXIT_EPS`; `stepsToSkip` is the smallest integer `n` with `t + n·stepLength ≥
  resumeT` (standard ceiling-division form) — the immediately-next fixed-grid point at or
  past the cell exit, never re-landing on the just-skipped cell and never skipping an
  extra valid sample. `t`/`i` are updated by the same `stepsToSkip` together
  (fragment.wesl:384-385), preserving the `t == tMin + jitter + i·stepLength` invariant
  the un-accelerated loop also relied on.
- **Dev-space semantics / comparison direction correct.** `cellMax < skipCutoff` implies
  every voxel in the cell would evaluate `smoothstep(deadband-0.05, deadband+0.05, dev) ==
  0` since deadband-0.05 is exactly the pyramid's stored quantity's floor and `dev` is
  monotonic in the same units the pyramid stores (per Task 3's contrastCenter-aware
  reduction) — omitting the cell provably changes nothing about the integral.
- **Skip loop is provably bounded.** `i` is monotonically non-decreasing by ≥1 every
  iteration (either `i = i + 1` on a full-res step, or `i = i + max(1, stepsToSkip)` on a
  skip); the loop's own guard (`if (i >= STEP_COUNT) { break; }`, fragment.wesl:353) then
  bounds total iterations by `STEP_COUNT`.
- **Binding 5**: `@group(0) @binding(5) var maxPyramid: texture_3d<f32>` (fragment.wesl:126),
  `textureLoad` only, no sampler declared. Confirmed against the JS-side BGL
  (`volumeFieldRenderer.ts:172-176`): `sampleType: 'unfilterable-float'`, `viewDimension:
  '3d'` — matches.
- **Unchanged-by-contract surfaces verified as unchanged in the diff**: jitter block,
  early-out (`accum.a > SATURATION_THRESHOLD`), `applyContrastWindow`, `sphericalEnvelope`,
  exposure/highlightGain, and `stepLength = (tMax - tMin) / f32(STEP_COUNT)` all appear as
  untouched context lines.
- **No backticks** in the file (checked directly).
- **WGSL uniform-control-flow**: the two `textureSampleLevel` calls are unchanged
  (explicit LOD 0.0). The new `textureLoad`/`textureDimensions`/`textureNumLevels` calls
  carry no uniformity requirement under the WGSL spec, so their presence inside the
  (per-fragment-divergent) skip loop is legal.
- `npx tsc --noEmit -p tsconfig.json` reproduced clean, matching the report.

## Quality verdict: Approve with minor findings (no Critical, no blocking Important)

**Important**

- None that block. One candidate flagged below under "possible but unverified perf nit"
  is not escalated to Important because it's speculative about compiler behavior.

**Minor**

1. **Loop-invariant `textureDimensions`/reciprocal recomputed every step instead of
   hoisted** (fragment.wesl:265-270, called from 362 and conditionally 367). `coarseLevel`
   is fixed for the whole march (set once at line 347); `PYRAMID_FINE_LEVEL` is a module
   constant. `pyramidCellQuery` nonetheless re-issues `textureDimensions(maxPyramid,
   level)` and recomputes `1.0/dims` on every call — up to 2 times per loop iteration, up
   to `STEP_COUNT` iterations. This is exactly the class of thing the brief's perf
   discipline calls for hoisting: `dims`/`dimsU` for both levels could be computed once
   before the loop and passed into `pyramidCellQuery` as parameters (only `cellI`/
   `cellMin`/`cellMax`/`exitT`, which genuinely vary with `p`, need to stay per-call).
   ⚠️ Cannot verify from source alone whether Tint/the driver backend's optimizer already
   performs this hoist via LICM (texture-dimension queries are pure and loop-invariant, a
   textbook LICM candidate) — flagging as a trivial, zero-risk tightening regardless of
   whether it currently matters, not as a proven contributor to the measured +47%/+65-71%
   regression (which the brief says not to relitigate here).
2. **Report's "bit-identical" claim is a mild overstatement.** `t = t +
   f32(stepsToSkip) * stepLength` (a single multiply-add) is not guaranteed IEEE-754
   bit-identical to the un-accelerated path's `n` sequential `t = t + stepLength`
   additions — the two accumulate rounding differently. The claim's substance (samples
   land on the same fixed step grid, so the *set* of voxels seen is unchanged) is correct
   and is what actually matters for the integral-preservation argument; "bit-identical"
   overstates the floating-point guarantee. No visual consequence (the <2/255 gate
   passed).
3. **Report misattributes a "two levels is enough" framing to the brief.** Task 5's report
   says the two-level policy was "chosen for a correct first pass per the brief's own 'two
   levels is enough' framing" — `task-5-brief.md` contains no such phrase; it leaves the
   level count open ("refine to a finer pyramid level (or fall through to a normal
   full-res sample)"). The two-level design choice itself is reasonable and within the
   brief's latitude; only the citation is inaccurate.
4. **Stale comment outside this diff's scope, caused by this task landing.**
   `volumeFieldRenderer.ts:168` ("No shader declares this binding yet") is now false —
   `fragment.wesl` reads binding 5 as of this commit. Not part of the required diff (Task
   5 correctly scoped to the shader file only, no TS surface change per the brief), but
   worth a one-line fix in a follow-up so the comment doesn't mislead the next reader.

## ⚠️ Cannot-verify items

- Whether the shader backend compiler already hoists the loop-invariant
  `textureDimensions`/reciprocal calls in `pyramidCellQuery` (Minor finding 1) — would
  require disassembly/profiling, out of scope for a source review.
- Task 3's guarantee that the pyramid's stored per-cell max deviation is computed in
  exactly the same normalized-`dev` units `applyContrastWindow` uses, for both
  `contrastCenter = 0` and `= 0.5` fields — taken as already-established per Task 3's own
  review/report (out of this task's diff scope; re-derivation was not attempted here).
- Actual floating-point delta between the skip-path multiply-add landing and the
  un-accelerated repeated-add landing (Minor finding 2) — not measured; visual gate
  (<2/255) is the only empirical evidence available and it passed.
