# SDD ledger — plan: docs/superpowers/plans/2026-10-11-structure-layer-moves.md

Spec: docs/superpowers/specs/2026-10-11-structure-layer-design.md
Branch: worktree-refactor-structures-layer (wt refactor-structures-layer). Lean protocol (sdd-execution.md).
Start answers: serial (PR 2 after PR 1 merges); perf gate skipped; PR 2 keeps its four review: yes mid-branch reviews.
Pre-flight scan: Task 1 → Task 2 share the moved sources files (Task 2 consumes the post-move paths); no conflicts found.
Dispatch plan: D1 = Tasks 1–2 (Sonnet); D2 = Tasks 3–4 (Sonnet); then one whole-branch review (Opus/top tier).

Draft PR #879 opened at start.

## Dispatches
- D1 Tasks 1–2, Sonnet, BASE ad4d2c8dc → 527c8d281 (Task 1 d537035b8), ~30 turns, DONE. typecheck:fast + build + 86 targeted test files green.
  - Deviation: move-files stripped `.json` from a `structure_anchors.seed.json` string literal (restored by hand) — tool landmine, record in memory.
  - Deviation: frameFilePurity ratchet row for `frame/planners` dropped (folder holds only index.ts after the move). Ruling: accepted — PR 2 deletes `planners/index.ts` and CORE_PLANNERS entirely, so the row has no future subject — cost if wrong: a new core planner file would escape the purity ratchet until someone re-adds the row.
  - Deviation: five string paths in tests/helpers/conventions/inlineTypeFiles.ts updated by hand.
- D2 Tasks 3–4, Sonnet, BASE 527c8d281 → 97a9bf809 (Task 3 87d547c01, Task 4 97a9bf809), ~25 turns, DONE. Also fixed stale paths in docs/science.md, add-data-source SKILL.md, two backlog files.
- Final review, Opus, range ad4d2c8dc..97a9bf809 → findings, all minor: README slabs row contradicts ruling; stale path comment in buildStaticAnchorStructures; .design-sync preview import; add-data-source skill wording; inlineTypeFiles order; plan code-block tick; empty test folder; createStructureStore placement. CI run 38150462603 green at 97a9bf809.
  - Ruling: createStructureStore moves to load/ (CPU-only record store; render/ is for GPU-buffer owners per the new README ruling) — spec §5.1 amended — cost if wrong: one more file move in PR 2.
  - Ruling: README `slabs?` table row → present/ (blackHoles precedent) — cost if wrong: none, text only.
  - Observation (no action): tools/utils/capture/*DeclutterActions.ts already imported layers/structure/state before this branch; plan Task 1's "no tools/ import" check was stated too broadly.
- Fix round 1 (one dispatch, D1 agent resumed, Sonnet), BASE 97a9bf809 → 55efb1ec9, all 8 applied, typecheck:fast + 18 test files green. No re-review (lean protocol).
- DoD (controller, inline): deliverables verified by the final review; smoke shots at HEAD on :5184 — `galaxy-cluster-virgo-m87` ring + label + card (341 galaxies) OK; `open-cluster-pleiades` card OK, ring/label verdict left to the user. DoD line "no tools/ imports src/layers/" corrected to "no tools/ file imports a moved file" (pre-existing state-slice imports).
- CI never ran on 97a9bf809/55efb1ec9/84a25ee6e: PR was CONFLICTING against main (#877 edited moved files), so GitHub skipped the pull_request runs silently. Merged origin/main (d0e921dbc; controller, inline: two import-only conflicts in produceStructureLabels + structureSelectionRow, three new main-side importers re-pathed: packages/website objectCatalogue.ts, its test, encodePick.test.ts). typecheck 0 errors, 909 targeted tests green. Run 38152210000 started at d0e921dbc.
  - Ruling: packages/website keeps importing `buildStaticAnchorStructures` from the Layer's `load/` (it did so from `src/data/structure/` on main; a cross-package read of Layer guts, pre-existing) — cost if wrong: one import to redirect when the website gets its own seed reader.

## Resume map (written 2026-10-11 for compaction)
- HEAD d0e921dbc pushed; draft PR #879; dev server on http://localhost:5184 (background shell b2dupp5yl); shots at data/shots/galaxy-cluster-virgo-m87-20261011-163545.jpg and open-cluster-pleiades-20261011-163523.jpg.
- In flight: background Bash bsc7fj2n0 watching CI run 38152368568 (first real run on the code, at the merge commit).
  - Green → ONE ask_user: two `check` questions with the shots attached (Virgo ring+label+card 341 galaxies; Pleiades card — ring/label verdict is the user's), plus the merge question. NEVER merge without the user's explicit "merge" word; squash-merge; never from the worktree.
  - Red → diagnose from the run log, fix via the D1 implementer (agent aea2ebdfd82cd7486), push, re-watch.
- After merge: archive this ledger to docs/superpowers/plans/completed/2026-10-11-structure-layer-moves.ledger.md and move the plan to plans/completed/ (spec STAYS active for PR 2) in PR 2's first commit; `/wt-close` is NOT the move — PR 2 runs serially from a fresh branch off main (user ruling: serial), plan docs/superpowers/plans/2026-10-11-structure-layer-wiring.md, with its own ledger under .superpowers/sdd/2026-10-11-structure-layer-wiring/. PR 2 keeps its four `review: yes` mid-branch reviews (Opus); perf gate skipped (user ruling).
- Diff breakdown ad4d2c8dc..55efb1ec9: code 323 non-comment + 7 comment lines, tests 150, docs 138 (lines added+removed).
- CI run 38152368568 at d0e921dbc RED (first real run): 5 tests. (1) `tests/conventions/layerImportBoundary.test.ts` ×3 — pre-existing ratchet (not in the 86 targeted files): 9 core files import moved Layer files; `layers/structure/load/wireStructureProjection.ts` imports engineSlice and dispatches. (2) website `facts.test.ts` + `docsReference.test.ts` — three cited paths at pre-move locations (docsGuideFacts.ts:843,851,907; docsSettings.ts:452). Website tests need `npm ci` in the wt (astro missing) — done.
  - Ruling: wireStructureProjection moves BACK to `services/engine/wiring/` for PR 1 (a dispatching file is core by the ratchet's definition; the outbound sweeps have no allow-list and adding one is worse than one file waiting a PR); PR 2 Task 4 moves it into `load/` and deletes the rows — cost if wrong: one extra move-files line in PR 2.
  - Ruling: 8 inbound ALLOWED rows raised with a comment naming PR 2 as the deleter (precedent: `state/tier/watchTierSaga: 1`, removed by the milkyWay Layer PR) — cost if wrong: rows linger if PR 2 forgets; its plan Task 4 now names them.
  - Fix round 2 (D1 agent resumed, Sonnet), BASE d0e921dbc, brief `fix-round-2-brief.md` → report `fix-round-2-report.md`. Then push, bg-watch CI, then the eye-check + merge ask.
  - Fix round 2 DONE: a59978d99 (ratchet rows ×9 incl. `wiring/wireStructureProjection: 3`, move-back, PR 2 plan Task 4 bullets), 9f0cf5bab (website paths + docsReference excludes `src/layers/structure/` until PR 2), ae13cf739 (controller: PR 2 Task 4 bullet to drop that exclusion). Pushed; PR MERGEABLE; CI run 38153331353 watched in bg shell bttx4b948. Green → eye-check + merge ask (see Resume map). No re-review (lean protocol; test-only + path edits).
- CI run 38153331353 GREEN at ae13cf739 (first green on the code). Ask posted: two eye-checks (Virgo, Pleiades) + merge word. Awaiting user.
- MERGED: #879 squash-merged as 71657bc7c (user word "Merge this PR", ask ZyCf; eye-checks Virgo + Pleiades PASS). Ledger archived to docs/superpowers/plans/completed/2026-10-11-structure-layer-moves.ledger.md in PR 2's first commit.
