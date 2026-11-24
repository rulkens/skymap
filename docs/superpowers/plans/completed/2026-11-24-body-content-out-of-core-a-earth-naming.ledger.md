# SDD ledger — plan: docs/superpowers/plans/2026-11-24-body-content-out-of-core-a-earth-naming.md

Spec: docs/superpowers/specs/2026-11-24-body-content-out-of-core-design.md
Worktree: .claude/worktrees/move-body-code-out-of-core, branch worktree-move-body-code-out-of-core
Docs commit (BASE for the plan): 1f4b4b2b2
Dev server: http://localhost:5176 (session background task)

## Owner answers before Task 1 (2026-11-24)

- Perf gate: on every prep PR.
- Parallelism: one PR at a time (A, then B, then C, then D).
- Sky capture row (PR D): measure; leave in core if it never bakes with no bodies.
- Row mesh field is `shapeModel` (spec §4.2), not `mesh`.

## Spike kit (never commit)

- `tools/reference-engine/` (untracked; scripts carry `// @ts-nocheck`), `src/compositions/galaxiesOnly.ts`
  (untracked), `.payoff-dist/`, `.payoff-off-dist/`.
- The two frame-order patches are saved as `tools/reference-engine/spike-frame.patch` and are NOT applied
  during PR A; `git apply` it only to measure the payoff build.

## Baseline (before any code change)

- Shots + perf in scratchpad `before/` (earth-home, saturn, hubble, perseverance at t=2026-01-01T12:00:00Z;
  perf earth-surface, solar-system, local-group at 30 frames; perf:cpu).
- Scratchpad: /private/tmp/claude-501/-Users-rulkens-Development-js-skymap/d1d35be0-2a49-46b0-8b72-af822e32d383/scratchpad

## Dispatches

- Baseline done: merged totals earth-surface 11.9, solar-system 8.8, local-group 5.3 ms/frame (30 frames).
- Dispatch 1: Tasks 1-3, opus, BASE 1f4b4b2b2 -> (running)
- Dispatch 1 result: Task 1 dc160b369, Task 3 acc0ff6d7 (opus, 27 tool uses). Task 2 stopped on the plan's stop condition.
- Ruling: homePose's declared return narrows from FramedCameraPose to FramedPose<'absolute'> (it only ever returns absoluteArm(...)); the go-home saga passes .pose — a truthful type, no conversion or new symbol — if wrong: one type annotation and one property read to revert.
- Deviations accepted: README tally line updated; flyToLonLatLands.test.ts payloads gained body.
- Dispatch 2: Tasks 2 + 4, same agent resumed, BASE acc0ff6d7 -> (running)
- Dispatch 2 result: Task 2 0e8d87c40, Task 4 efeaba8a8 (same opus agent, 48 tool uses total, 135k tokens). No new deviations.
- Task 1: complete (dc160b369)
- Task 2: complete (0e8d87c40)
- Task 3: complete (acc0ff6d7)
- Task 4: complete (efeaba8a8)
- Task 5: after shots + perf running; whole-branch review dispatched (fable) over 1f4b4b2b2..efeaba8a8
- Whole-branch review (fable, 10 tool uses): no Critical/Important; 6 Minor. Fixed inline: earthRef header, deleted sceneEarthBodies.test.ts (cannot fail), tally 27 DONE / 7 TODO. Left: go-home vs navigateSaga homeSaga overlap (note for later un-braid), omit rule's body-kind narrowing, pre-existing long header line.
- Task 5: complete. Shots pixel-identical within JPEG noise (max 86 of 17.3M samples differ >16, hubble). Go-home from Mars: URL #focus=body-mars&t -> #t, Earth framed with ring and card, 0 page errors.
- Perf: first 'after' read earth-surface 14.2 vs 11.9 before; paired A-B-A-B at 60 frames on base 1f4b4b2b2 vs head: 14.0/13.9 vs 14.4/14.0 = drift, not a regression. solar-system 8.8 -> 8.9, local-group 5.3 -> 4.9.
- HEAD after review fixes: b843007de. Not pushed.
- PR #1155 opened (push b843007de). Owner (mid-turn): merge PR A once CI passes; continue with B.
- Deletion audit (opus, 14 tool uses): little to remove; ~7-13 src + ~22 test LOC candidates, none in the safe-now bin. Ruling: keep the null-focus URL test and the null-home pose assertion — they are the only checks that fail if an Earth fallback returns — costs ~22 test lines if wrong. Ruling: keep the indexed loop in sceneOccluderBodies (per-frame path, controller asked for no iterator). Needs-ruling, offered to owner, non-blocking: fold EARTH_HOME into APP_HOME and delete earthHome.ts (~6 src LOC, 5 test files swap a name).
- Trap list: sceneOccluderBodies.test.ts mock; earthRow() throw; isSceneBodyId check in watchFlyToLonLatSaga; homePose narrowed return; body:'earth' in flyToLonLat tests.
- /feature-done: READY. Full suite 2022 files / 35172 tests pass, typecheck clean, 20/20 checkboxes, no new TODOs. Plan moved to completed/; spec stays (PRs B, C, D still execute against it).
