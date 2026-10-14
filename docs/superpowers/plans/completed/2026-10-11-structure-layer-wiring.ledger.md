# SDD ledger — plan: docs/superpowers/plans/2026-10-11-structure-layer-wiring.md

Spec: docs/superpowers/specs/2026-10-11-structure-layer-design.md
Branch: worktree-structure-layer-wiring (wt refactor-structures-layer, same dir as PR 1; dev server :5184 shell b2dupp5yl). Base 71657bc7c (main after #879). Draft PR #880.
Lean protocol (sdd-execution.md). User rulings (ask s46s): serial after PR 1; perf gate skipped; keep the four `review: yes` mid-branch reviews (Tasks 1, 4, 5, 6).
PR 1 archive: 6a354403c (plan + ledger → plans/completed/).

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 → T4 | T1 re-signs `structureSelectionRow(store)`; T4 hands `runtime.store` to it and deletes T1's interim `engine.ts` append | consistent |
| T2 → T4 | T2 planner calls `produceStructureMarkers(state, view)`; T4 makes planner a factory calling `produceStructureMarkers(runtime.store, state, view)` | consistent, sequential |
| T3 ↔ T4 | both edit `produceStructureMarkers`/`produceStructureLabels` (T3 body, T4 signature) | sequential, no conflict |
| T4 → T5 → T6 | `wireStructureProjection` signature `(runtime, dispatch)` → `(runtime, publish, dispatch)` → `(runtime, publish)` | consistent chain |
| T1 → T5 | interim deferral `engineStructureCountsChanged` → final `factsReported` | consistent |
| T1 self | Files line says `src/layers/structure/render/createStructureStore.ts` | STALE: PR 1's final review moved it to `load/` — Ruling: use `load/`, cost none |
| T5 vs spec | spec P1 deletes `selectStructureCounts`; plan re-points it | plan already states the ruling (§Task 5 prose) |
| T4 self | Task 4 asserts a `layer.test.ts` with 2 tests; no registry restatement | ok |

## Dispatch plan
- D1 = Tasks 1–3 (Opus; T1 review: yes) — Ruling: Task 3 folded into D1 (plan said its own small dispatch): disjoint files, saves a dispatch — cost if wrong: none. Mid-branch review (Opus) after D1.
- D2 = Task 4 (Opus, review: yes) + mid-branch review.
- D3 = Tasks 5–8 (Opus; T5, T6 review: yes) + mid-branch review.
- Final whole-branch review (Opus), then smoke shots per DoD, CI, ask.

## Dispatches
- D1 Tasks 1–3, Opus, BASE 6a354403c, agent a8ff0a164807291ed, briefs task-{1,2,3}-brief.md → d1-report.md. IN FLIGHT. On DONE: review-package 6a354403c..HEAD → mid-branch review (Opus) for Task 1's saga/ResolveDeps change (user keeps the four tagged reviews), then D2 = Task 4.
  - D1 DONE_WITH_CONCERNS: Task 1 80ac15cbf, Task 2 e14490896, Task 3 c4df55da7; full suite 1546 files green; typecheck:fast 0 errors at HEAD. Concerns (all minor): layerImportBoundary `engine` row 1→2 (Task 4 deletes it); test stores with empty counts now wait for a pulse (prod timing identical); 7 extra test files re-signed; stale docs/research + docs/audits mentions left for Task 8.
  - Task 1: complete (80ac15cbf). Task 2: complete (e14490896). Task 3: complete (c4df55da7).
  - Mid-branch review (Opus) agent a458b97707578635c over review-6a354403c..c4df55da7.diff → d1-review.md. IN FLIGHT. Findings → one fix dispatch (resume D1 agent a8ff0a164807291ed), then D2 = Task 4.
  - Mid-branch review (D1) DONE: both verdicts Approved; 0 blocking, 1 medium (garbage-id deferral test proves nothing about "stop waiting"), 5 low, 4 info → d1-review.md. Deferral timing confirmed identical to the deleted loaded().
  - Fix round 1 (D1 agent a8ff0a164807291ed resumed): medium + 4 lows in one commit; ratchet engine-row count left for Task 4 (deletes it); info items skipped. IN FLIGHT. Task 4 brief ready: task-4-brief.md. Next: D2 = Task 4 (fresh Opus), then mid-branch review.
  - Fix round 1 DONE: 67c8359ac (medium + 4 lows). Plan ticks Tasks 1–3: 411a6e775. Tree clean.
- D2 Task 4, Opus, BASE 411a6e775, agent ab938629413178b62, brief task-4-brief.md → d2-report.md (+ two smoke shots). IN FLIGHT. On DONE: review-package 411a6e775..HEAD → mid-branch review (Opus: GPU handle lifecycle, planner placement, selection rows, boundary ratchet rows deleted), one fix round, then D3 = Tasks 5–8.
  - D2 DONE_WITH_CONCERNS: Task 4 8680de34e; typecheck + build + full suite (16669 tests) green; slab-swap mutation check passed. Shots on a temp server :5199 (the :5184 server answers 504 "Outdated Optimize Dep" after the dep churn — needs a restart before the final smoke): data/shots/galaxy-cluster-virgo-m87-20261011-175234.jpg, open-cluster-pleiades-20261011-175244.jpg. Controller checked: the Virgo shot is pixel-identical to PR 1's (163545), so the hidden focused ring is pre-existing close-approach fade at framing distance, NOT a regression. Deviations: temporary outbound-sweep allowance for `load/wireStructureProjection` in layerImportBoundary (Tasks 5–6 delete it); `hiddenPasses.test` re-pointed at FRAME_ORDER_PASS_NAMES.
  - Task 4: complete (8680de34e).
  - Mid-branch review (Task 4), Opus, agent ad4acf44d0aa10ab2 over review-411a6e775..8680de34e.diff → d2-review.md. IN FLIGHT. Then one fix round (resume ab938629413178b62), then D3 = Tasks 5–8 (briefs task-{5..8}-brief.md).
  - Mid-branch review (Task 4) DONE: both Approved; 0 critical/important, 2 minor (create.ts builds renderers after the projection has dispatched counts — reorder; bare `dispatch` param dodges the `.dispatch(` sweep — Tasks 5–6 must remove every dispatch reference), 4 nits → d2-review.md. hiddenPasses.test change judged necessary. Plan ticks: 0e0b2c026.
  - Ruling: Task 4's fix round is folded into D3 as its commit 0 (the two files it touches are rewritten by Tasks 5–6 anyway) — cost if wrong: none, same diff one dispatch earlier.
- D3 commit 0 + Tasks 5–8, Opus, BASE 0e0b2c026, agent a9232532b7d907ddc, briefs task-{5..8}-brief.md → d3-report.md. IN FLIGHT. On DONE: review-package 0e0b2c026..HEAD → mid-branch review (Opus; Tasks 5, 6 are review: yes: Redux state + two sagas), one fix round, then the FINAL whole-branch review (Opus) over 71657bc7c..HEAD, deletion audit framing, then: restart :5184 (504 Outdated Optimize Dep), smoke shots per plan DoD (4 observables), push, bg CI watch, diff breakdown, /feature-done-style DoD check, ONE ask (checks + merge word).
  - D3 DONE_WITH_CONCERNS: 5f07b2ac9 (Task 4 review fixes), Task 5 10f2e4760, Task 6 36ae378af, Task 7 eafa2e08c (all five types moved; no outside reader), Task 8 3d6285fbe; build + full suite (1550 files / 16681 tests) green; mutation checks for review-focus 1–3 passed. Concerns: selection-rows gap-fill runs on every Layer's factsReported (guarded no-op); `{bulk:'loading'}` may publish up to 3× per load (no-op writes). Plan ticks 988cd881b.
  - Tasks 5, 6, 7, 8: complete.
  - Ruling: the Tasks 5–6 tagged review and the final whole-branch review run as ONE Opus dispatch (agent a350163d1d3993659; packages review-0e0b2c026..988cd881b.diff and whole-branch-71657bc7c..988cd881b.diff → final-review.md) — the branch is complete, so a second pass over the same code would be duplicate work; the user's four tagged reviews are each still done in depth — cost if wrong: one review's attention split. IN FLIGHT. Then ONE fix round, then smoke (restart :5184 first), push, CI, diff breakdown, ask.
  - FINAL review DONE: Part A spec + quality Approved; Part B ready to land after smoke + CI. 0 critical/important, 6 low (top: untested `bulk:'idle'` cancel branch in wireStructureProjection), 4 nits, deletion audit 6 items (~39 lines) → final-review.md. watchSelectionRowsSaga re-fill on every Layer's report judged fine (no filter).
  - Final fix round (D3 agent a9232532b7d907ddc resumed): 6 lows incl. the idle-cancel test, 4 nits, all 6 deletions. IN FLIGHT. :5184 answers 200 again (504 was transient) — no restart. Next: smoke shots per plan DoD on :5184, push, bg CI, diff breakdown, ask.
  - Final fix round DONE: 2657f44ae (6 lows incl. idle-cancel test, 3 nits, 6 deletions; nit 10 no-op). Pushed; PR #880 MERGEABLE; CI run 38159803766 bg shell bbw3v3i1u.
  - Smoke on :5184 (controller): data/shots/galaxy-cluster-virgo-m87-20261011-182926.jpg (ring field, labels, card 341 galaxies — identical to main's render) and open-cluster-pleiades-20261011-182933.jpg (card, 47 Tuc ring/label; Pleiades' own ring hidden by close-approach fade as on main). Interactive DoD observables (Settings counts growing on bulk land, Cmd+K Virgo row, toggle fades, anchor counts with bulk off) NOT shot-checkable — handed to the user as checks.
  - Diff breakdown 71657bc7c..2657f44ae (added+removed): code 900 | comment 658 | tests 2101 | docs 237.
  - Green → ONE ask: 2 shot checks + 2 interactive checks (links) + merge word. NEVER merge without the explicit word; squash; not from the wt. After merge: /feature-done filing (plan + spec + ledger → completed), memory, wt cleanup ask.
- CI run 38159803766 GREEN at 2657f44ae. Ask posted: 2 shot checks, 2 interactive checks, merge word. Awaiting user.
