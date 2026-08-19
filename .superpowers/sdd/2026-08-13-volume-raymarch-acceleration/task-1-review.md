# Task 1 review — `volume-inside` perf scenario + baseline

## Spec ✅

- Diff touches only `tools/perf/perfScenarios.ts` (one commit, `679de1bef`, 9 insertions, 0 deletions) — no renderer changes rode this commit, matches "commit alone."
- New row matches the `PerfScenario`/`PerfPose` contract exactly: `{ name: 'volume-inside', pose: { target, distance, yaw, pitch, clearFocus: true } }`, no extra/missing fields (checked against `src/@types/perf/PerfPose.ts`).
- `clearFocus: true` present, matching the `milky-way-outside`/`galactic-centre` non-Earth-target pattern.
- No existing row was touched — diff is a pure insertion between `galactic-centre` and `local-group`; cross-commit comparability of every prior scenario preserved (verified via `git diff 1d5662b99 679de1bef -- tools/perf/perfScenarios.ts`).
- Baseline captured and recorded in `progress.md` (ledger) with MERGED and PER-LAYER numbers, matching `task-1-report.md` and `task-1-baseline.txt`.
- `npx tsc --noEmit -p tsconfig.tools.json` — reran it myself, clean, confirms the report's claim.
- Nothing extra shipped (no stray files touched; `public/data.stale-v8-root/` and `tools/volumes/renderCubeMips.ts` seen in `git status` predate this task and are untouched by the commit).

## Task quality: findings

**Important — pose's "dense filament structure filling the frame" claim is unverified, no visual check.** The brief's checklist explicitly calls for flying the camera interactively and confirming visually that dense filament structure fills the frame ("not merely near it"), plus confirming liveness against the `local-group`/`full-survey` reference. The implementer instead derived the target numerically from `MCPM_GRID_CENTER_MPC`/`MCPM_BASE_DIMS`/`MCPM_BASE_VOXEL_EDGE_MPC` (`tools/volumes/buildMcpmVolume.ts:35-44`) — I checked the arithmetic and it's correct (centroid, AABB extents, and the 0.85 envelope-inner reasoning all check out against the source constants). But "MCPM resident and drawing" was confirmed only via the harness's own `scalar-volume` PER-LAYER row being present/nonzero, not via a screenshot. The harness output itself is mildly suspicious on this point: `point-sprites` is the dominant PER-LAYER cost at this pose (5.1 ms / 46%), well above `scalar-volume` (1.4 ms / 13%) — consistent with a frame dominated by galaxy point sprites rather than one filled with volumetric filament structure. Geometric centrality in the cube's AABB does not by itself guarantee the frame is visually filled with dense structure (the report's own root-cause section notes 95.2% of MCPM voxels are below the transfer-function cutoff — most of the volume, including near the centroid, is void). This is exactly the failure mode the project's own convention warns about (`feedback_verify_rendering_visually_before_measuring.md` — "zero-area draw = fake perf win"; "visual checkpoint EARLY"). A screenshot at this pose, taken before further tasks build on it, is cheap insurance.

**Minor — module header comment is now slightly stale.** `perfScenarios.ts`'s header docstring states unconditionally: "The pose values below were captured by flying the running app to each regime and reading the `l`-key `logState` one-liner — physical coordinates invented at a desk would put the camera nowhere meaningful." The new row breaks that invariant (computed at a desk from cube metadata, not captured live) — the interactive capture wasn't available in this session per the report. The row's own inline comment does disclose "derived from the shipped origin/voxel/dims," so a reader of the row itself won't be misled, but the file-level claim is no longer true for all rows and wasn't caveated. Low cost to fix (one added clause), not blocking.

**Minor — trial-log/context detail lives only in the report, not the code.** The 14-candidate search and the PER-LAYER-floor root-cause analysis are valuable but exist only in `task-1-report.md` (SDD scratch, git-ignored per the report's own closing note). That's consistent with the project's plan-vs-code split (history is the git log's/plan's job, not inline comments) — noted only because a future reader of just the commit (no SDD folder) gets the row's "why this pose" reasoning but not the "why not 2x" investigation; the controller has already accepted this trade-off per the task framing, not re-litigating it.

## ⚠️ Cannot verify from diff

- Whether the pose visually shows "dense filament structure filling the frame" as the brief requires — no screenshot in the report or diff; only inferred from cube-centroid geometry and non-zero harness liveness (see Important finding above).
- Whether `envelopeInner: 0.85` truly leaves the centroid pose in the full-opacity region for all three axes simultaneously (the shader's envelope is a single combined normalized radius across all axes, not a per-axis threshold) — arithmetic on each axis independently checks out generously, but the combined-radius interaction wasn't traced through the shader by hand for this specific viewing direction/FOV.

## Verdict

Spec compliance: ✅ (file scope, row shape, `clearFocus`, no drift to existing rows, baseline recorded, commit alone — all satisfied).

Task quality: Approved with one Important note (get a screenshot of this pose before Stage 1-3 work leans on it being "dense filament fill") and two Minor notes (stale header claim; investigation detail is SDD-scratch-only). Nothing here blocks proceeding — the numeric/typecheck/scope contract is solid — but the qualitative "fills the frame with dense structure" claim is asserted, not shown.
