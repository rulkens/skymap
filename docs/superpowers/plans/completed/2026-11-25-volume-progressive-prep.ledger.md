# Ledger: volume progressive prep (2026-11-25)

Plan: docs/superpowers/plans/completed/2026-11-25-volume-progressive-prep.md (7 tasks, one commit each)
Spec: docs/superpowers/specs/completed/2026-11-25-progressive-volume-sampling-design.md §4
Branch: `volume-progressive-prep` (remote), built in ONE isolation agent worktree off origin/main
(the controller session is pinned to the spike worktree `volume-progressive-octree`, which must not
reach the branch). Continue the same implementer agent across dispatches.

Pre-task answers (owner, ask fTey): parallelism = one PR at a time (prep, then feature);
perf gate = skipped for prep, feature PR timed with the wall-clock bench.

Rulings (owner, ask H3rY): PassState.frameIndex allowed; ScalarVolumePassRow.inputs allowed;
prev per-view planners only; shared WESL layout test helper extracted in prep; star planner counter
fixed in prep. Controller ruling: no `peek` on the planner store, plan runner keeps prev privately
— passes could dodge get's throw — cost if wrong: one private map to move.

## Dispatches
- D1: tasks 1–3, opus, BASE 8809f9478 (origin/main, #1167) → ba080e829, done, pushed.
  Implementer worktree: /Users/rulkens/Development/js/skymap/.claude/worktrees/agent-ae7e7a2d877b1ccba
  Task 1: complete (58f5c000e) · Task 2: complete (a040e3a08) · Task 3: complete (ba080e829)
  Deviations: WeslStructLayout type under tests/helpers/wesl/@types/ (case-insensitive disk);
  other private struct parsers (mcpm-workbench packed layouts, star/label/ism) left alone.
- Review R1: task 2 mid-branch (opus): no must-fix; 5 comment/doc nits → fixed in 3fb2abf27.
- D2: tasks 4–5 + R1 fixes, same implementer, ba080e829 → 3fb2abf27, done, pushed.
  Task 4: complete (2e2baf95b) · Task 5: complete (df5273291) · R1 fixes (3fb2abf27)
  Deviations: runFrame.test stub gained reconcileViews; executor throws when a retained target's
  step names no restartPlanner; `release` allocated-check now `sizes.has(id)`.
- D3: tasks 6–7, same implementer (a fresh isolation agent with a reset step was denied by the
  permission classifier; continuing the original at ~290k tokens), 3fb2abf27 → (pending)

  → 2575c5c1c, done, pushed. Task 6: complete (8bb71affb) · Task 7: complete (2575c5c1c)
  Deviations: gatePlannerByFade.test per-view case reads fade at arg 3; `previousViews` holds last
  frame's views one extra frame; noStoredRegimeFlag flaked once under load (passed alone).
- Review R2: whole-branch (opus), 8809f9478..2575c5c1c: nothing blocking; fix round f546f263f
  (previousViews holds { canvasSize, stillFrames } + vp compare; retained-row guards; doc nits).
- Task 2 shot check (bd8d1f487): volume off bit-identical mono + dome; volume on = run-to-run
  noise. GAP: dome with the volume on all five faces not exercised (pose outside the cube).
- Draft PR #1170 opened at bd8d1f487; CI watched in background.

## Open for the controller
- Dome five-face check at a pose inside the cube (GPU busy with the box spike; do when free).
- /feature-done + plan/spec moves + ledger archive ride the PR BEFORE the merge ask.
- Implementer agent retired (386k tokens): use a fresh agent in its worktree for further fixes.
- Known pre-existing weakness (R1): hash jitter loses precision from ~1e5 frames; the feature PR's
  blue-noise mask removes it.
- Worktrees to clean at landing: agent-ae7e7a2d877b1ccba.

## RESUME HERE
All 7 tasks + review fixes pushed (bd8d1f487), draft PR #1170, CI running. Next: CI green, dome
five-face check, /feature-done on the branch, then the merge ask. Merge only on the owner's
"merge this PR".
