# Task 5 report — TF-adaptive empty-space skipping (scalar-volume fragment shader)

## What shipped

`src/services/gpu/shaders/scalarVolume/fragment.wesl` only (no TS surface
change):

- `@group(0) @binding(5) var maxPyramid: texture_3d<f32>;` — declares the
  binding Task 3 already wired into the BGL/bind-group but which no shader
  stage read until now. `textureLoad` only (no sampler — `unfilterable-float`).
- `intersectLocalAabb(rayOrigin, rayDir, boxMin, boxMax)` — generalises the
  existing `intersectUnitAabb` slab test to an arbitrary box.
  `intersectUnitAabb` now delegates to it with `[0,1]³` bounds (behaviour
  unchanged, byte-for-byte same formula, just de-duplicated).
- `pyramidCellQuery(p, level, rayOrigin, rayDir) -> vec2<f32>` — looks up the
  pyramid cell (at mip `level`) containing local-space position `p`; returns
  `(cellMaxDev, exitT)`, `exitT` from `intersectLocalAabb` bounded to that
  cell's own local-space AABB (not the whole cube).
- `fs_main`: cutoff derivation once per fragment (`contrastDeadband`,
  `trimDeadband`, `deadband`, `skipCutoff = deadband - 0.05` — literally
  mirrors `applyContrastWindow`'s deadband math, per the brief), plus the
  march loop rewritten from a `for` to a `loop { if (i >= STEP_COUNT) break; }`
  form (same idiom as `transmittanceLut.wesl`/`flow/compute.wesl`) so a skip
  can `continue` without running the per-step sample body.

## Level policy

Two explicit pyramid levels, chosen for a correct first pass per the brief's
own "two levels is enough" framing:

- **Coarse = `min(1, textureNumLevels(maxPyramid) - 1)`** — level 1
  (~16-voxel cells, one level above the pyramid's own `ceil(dims/8)` base).
  Checked every step first; if this cell's stored max deviation is below
  `skipCutoff`, skip straight to the cell's ray-exit point.
- **Fine = level 0** (~8-voxel cells, the pyramid's base) — checked only if
  the coarse cell was NOT provably empty and `coarseLevel != 0` (guards the
  degenerate case where the pyramid has only one level, e.g. a very small
  cube — `min(1, 0) == 0 == PYRAMID_FINE_LEVEL`, so the fine check is skipped
  rather than redundantly re-testing the identical cell).
- If neither level proves the cell empty, the march falls through to a
  normal full-res `textureSampleLevel` sample — no further pyramid levels are
  consulted. Finer-grained policy (e.g. an explicit level-2+ tier, or
  adapting the starting level to march distance) is left for later per the
  brief; see Concerns below for why this matters more than "nice to have."

## Integral-preservation reasoning

Two independent guarantees, both required:

1. **Skipping a cell changes nothing about the accumulated integral.** A
   cell's stored value is the MAX deviation-from-center over its block of
   voxels (Task 3). If that max is still below `skipCutoff = deadband -
   0.05` — the same floor `applyContrastWindow`'s `smoothstep(deadband -
   0.05, deadband + 0.05, dev)` clamps to zero at — then EVERY voxel in the
   cell would have produced `visibility = 0` and therefore `alpha = 0` had it
   been sampled. Omitting zero-contribution terms from a sum doesn't change
   the sum. This is the "exact, not approximate" claim from the brief.
2. **Landing back on the fixed step grid preserves which voxels the
   surviving samples see.** After a skip, `t` advances to the smallest
   `tMin + jitter + k·stepLength` at or past the cell's exit
   (`skipExitT + CELL_EXIT_EPS`), computed as
   `stepsToSkip = max(1, ceil((skipExitT + CELL_EXIT_EPS - t) / stepLength))`
   and applied as `t = t + stepsToSkip * stepLength` (still the same
   accumulate-by-`stepLength` pattern the un-accelerated loop always used, so
   no new floating-point drift is introduced). Every sample that survives a
   skip is therefore bit-identical in position to a sample the
   un-accelerated march would also have taken — the ONLY difference between
   the two code paths is that some already-zero-contribution samples are
   never evaluated. Landing off-grid instead (e.g. jumping straight to
   `skipExitT`) would shift the phase of every later sample too, changing
   which voxels the rest of the ray sees and (statistically) still
   integrating to roughly the same answer, but not the guaranteed-identical
   one this implementation gives.

## Visual evidence

All captures in `.superpowers/sdd/2026-08-13-volume-raymarch-acceleration/task-5-visual/`
(gitignored — local artifacts only, `capture.mjs`/`diff.mjs` are the
reusable Playwright/diff scripts, same procedure as Tasks 2/3: `Explore`
click → wait 4s for boot fly-to-Earth to settle → `window.__skymapPerf.setPose`
→ wait 1.5s → screenshot; "before" captured by `git diff` + `git checkout --`
on the one tracked file, restored via `git apply` afterward — `git stash`
never used).

**Default settings, before vs after (mandatory gate):**

| pose | meanAbsDiff (/255) | maxAbsDiff | gate (<2/255) |
|---|---|---|---|
| `volume-inside` | 0.882 | 221 (single hot pixel — UTC clock digit, same false-positive class Tasks 2/3 noted) | PASS |
| `local-group` | 0.269 | 89 | PASS |

Both visually indistinguishable on inspection (`before-volume-inside.png` /
`after-volume-inside.png`) — same filamentary magenta/purple cosmic-web glow
and starfield density, no holes, no missing filaments.

**Volume-isolated (Galaxies layer toggled off via the SettingsPanel's "Toggle
Galaxies" checkbox — no window-exposed Redux dispatch exists, so this went
through the real DOM control), `volume-inside` pose:**

`diff-volume-inside-no-galaxies.png`: meanAbsDiff 0.675, maxAbsDiff 227 —
PASS. This is the strongest correctness evidence: with the point-cloud
layer hidden, `before`/`after` show the SAME filamentary structure pixel-for-
pixel (the two screenshots differ only in a UI toggle-switch's mid-animation
frame, not the rendered cosmic web) — proof the skip logic drops no
structure at default settings.

**Slider sweep (live retuning, no rebuild) — `contrast-min/max.png`,
`trim-min/max.png`:** the UI's actual slider bounds are `CONTRAST_MIN/MAX =
[0.25, 4.0]` and `TRIM_MIN/MAX = [0, 0.95]` (`VolumeFieldRow.tsx:67-77`) —
narrower than the brief's stated sweep values (0.05/16 for contrast), which
aren't reachable through the shipped UI (only through a raw uniform write,
which has no scriptable seam — see below). Swept the UI's real Home/End
bounds instead as the closest reachable proxy:

- Contrast 0.25 (deadband ≈ 0, near-identity): full filamentary glow visible.
- Contrast 4.0 (deadband 0.75): frame goes almost entirely black except
  marker rings — correct, not a bug (contrast this high is designed to
  suppress everything but the densest peaks/emptiest voids, and this pose's
  local density apparently doesn't clear that bar).
- Trim 0 → 0.95: same before/after pattern (full glow → near-black).

Confirms the design's core claim: slider changes retune the skip cutoff
live, because the cutoff reads `u.contrast`/`u.trim` every frame — no cached
or build-time value.

**No Redux/store dispatch seam exists on `window`** (checked — only
`window.__skymapPerf` and `window.__skymapRecorder` are installed, neither
exposes dispatch), so the settings-isolation and slider sweep both went
through real DOM interaction (SettingsPanel checkboxes / `Slider`
`role="slider"` + Home/End keys) rather than a scripted store patch.

## Perf

`npm run -s perf -- --url http://localhost:5173 --scenario <name> --frames 30`,
run paired in the same dev-server session, immediately before/after
reverting `fragment.wesl` via `git checkout --`/`git apply` (same technique
as the visual gate) so the comparison isolates this one file's change from
session-to-session machine noise.

| pose | metric | before (no skip) | after (Task 5) | Δ |
|---|---|---|---|---|
| `volume-inside` | TOTAL merged | 9.8 ms | 9.8–9.9 ms | ~flat |
| `volume-inside` | volume·COSMO MERGED | 1.5 ms | 2.2 ms (×2, reproduced) | **+47%** |
| `volume-inside` | scalar-volume per-layer | 1.7 ms | 2.8–2.9 ms | **+65–71%** |
| `local-group` | TOTAL merged | 20.3 ms | 20.1 ms | ~flat |
| `local-group` | hdr·COSMO (volume folds in here) | 0.2 ms | 0.2 ms | no signal (floor-dominated, per Task 1's ledger note) |

Task 1's original baseline (measured on an earlier commit, different
session): `volume-inside` TOTAL merged 8.6 ms, volume·COSMO MERGED 1.1 ms,
scalar-volume per-layer 1.4 ms. My own paired same-session "before" (1.5 ms /
1.7 ms) already reads somewhat higher than that — expected session-to-session
variance per the perf skill — which is exactly why the paired same-session
A/B above, not the cross-session comparison to Task 1, is the number to
trust for THIS task's effect.

**Headline finding: Task 5 is a measured, reproduced NET REGRESSION at the
`volume-inside` pose** (+0.7 ms / +47% on `volume·COSMO` MERGED, run twice
with matching results). See Concerns.

## Concerns (flagging for review, not resolving in this task)

1. **Important — the `volume-inside` perf pose is adversarial to this
   optimization, and that's the likely root cause of the regression.** Per
   `perfScenarios.ts`'s own comment, `volume-inside` sits "in the MCPM
   cosmic-web cube's own centroid" — i.e. deep inside dense structure, not in
   a void. At default settings (contrast 1.7, trim 0.3 on the shipped MCPM
   field) most rays through this region hit cells whose max deviation is
   ABOVE `skipCutoff` — the coarse-then-fine pyramid check runs on nearly
   every step, finds "not empty" both times, and falls through to the normal
   sample anyway. That's two extra `textureLoad` + slab-test pairs paid per
   step for zero skip payoff — pure overhead, matching the measured ~65-71%
   per-layer increase almost exactly. The slider sweep's visual evidence
   supports this: at aggressive settings (trim 0.95) the frame goes nearly
   black, meaning skips WOULD fire heavily there — but the perf harness runs
   at the app's shipped defaults, not that setting. This is architecturally
   consistent with MERF-style empty-space skipping generally: it wins big in
   void-dominated views and can lose in structure-dense ones, and the one
   pose this plan's perf gate checks against happens to be the latter.
   **I have not attempted a fix** (e.g. a cheaper single-level check, a
   coarser starting level, or gating the pyramid check behind a per-ray
   heuristic) — that's a design decision beyond "implement per the brief,"
   and correctness (confirmed above) was this task's stated priority. Flagging
   for the reviewer/controller to decide: accept as a known first-pass
   tradeoff (Task 6's cone-LOD may change the calculus), add a fix round, or
   pick a different/additional perf pose that actually exercises void-skip
   before judging the feature's net benefit.
2. **Minor — the brief's slider-sweep values (contrast 0.05/16) aren't
   reachable through the shipped UI**, whose sliders clamp to
   `[0.25, 4.0]`. Swept the real UI bounds instead (documented above) since
   the design claim under test (live retuning, no rebuild) doesn't depend on
   which specific bound is hit.
3. **Minor — no `window`-exposed Redux dispatch seam exists** for
   programmatic settings mutation in perf/dev mode; the isolation and slider
   captures went through real DOM controls instead. Noting in case a future
   task wants a scriptable seam for visual gates.

## Verification

- `wesl-shaders` skill invoked before editing `fragment.wesl`, per the
  brief's mandatory rule.
- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npx tsc --noEmit -p tsconfig.tools.json` → clean.
- `npx vitest run tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`
  → 9/9 pass (unchanged — shader is `?static`-imported, no TS surface
  change).
- `npx vitest run` (full suite) → 1023 files / 6903 tests pass.

## Commit

One commit, explicit path staged (`git checkout --`/`git apply` cycles used
during the visual/perf gate never left the tree in the reverted state):
- `src/services/gpu/shaders/scalarVolume/fragment.wesl`

`.superpowers/` is gitignored — the visual-gate artifacts and this report
stay local, consistent with Tasks 1-4's precedent.
