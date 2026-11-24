# SDD ledger — plan: docs/superpowers/plans/2026-11-24-body-content-out-of-core-b-corrections-and-stars.md

Worktree: .claude/worktrees/body-content-b-star-rows, branch worktree-body-content-b-star-rows, base 6cd89c2a7, plan commit e29307a49.
Owner answers (carried from plan A ask, 2026-11-24): one PR at a time; perf gate on every prep PR. "continue with B" given 2026-11-24.
Baseline (before code, dev server :5176): shots scratchpad/b-before/{home,mars,moon,hubble,sirius,s2,sun}.jpg; perf merged ms: earth-surface 12.5, solar-system 10.8, galactic-centre 9.7, full-survey 27.6 (scratchpad/b-perf-before-*.txt, b-perfcpu-before.txt).
Shot links: `t=2026-01-01T12:00:00Z` bare, plus focus=body-mars, body-moon, body-hubble, star-sirius, star-s2, star-sun.

Ruling: corrections join in bodyBodyRows.ts, not 29 row edits — smallest diff, generated file stays the list — if wrong: rows hide which are corrected.
Ruling: orbit PositionDriver carries resolved `reflex`, row carries `pair` — placement reads no table — if wrong: one extra core type.
Ruling: SGR_A_STAR_LABEL core constant feeds blackHoles source row and sStarOrbitInfo — a Layer may not import compositions — if wrong: label has a core home it did not need.
Ruling: CompactBodyCard loses its constellation lookup (stars never reach it; implementer verifies, stops if false).

Dispatch 1: Tasks 1-2, opus, e29307a49 → a0d825a24, done, 63 tool uses. Task 1: complete (c7544211c), positions byte-identical at 2 instants (209 ids). Task 2: complete (a0d825a24); regen NOT run (Horizons CSVs absent: main has only 500@799, 500@899).
Dispatch 2: mid-branch review of Task 1 (c7544211c), opus → clean. Minors for the final fix round: (a) bodyBodyRows.ts:91 join should key on `row.position.elements.id` after the kind check, not `row.body.id`; (b) positionDrivers.ts:32 comment repeats BarycentricReflex.d.ts doc — keep only "A misspelt secondary throws."
Dispatch 3: Tasks 3-4, opus, BASE a0d825a24 → (running). Agent a6a338699e1106d42 died on an API network error mid-Task 4 and was resumed by SendMessage. Task 3: committed cb7214d14. Task 4 so far: hand fixes committed 4b7f46dce; move-files result + docs uncommitted (~120 paths) when it died.
Dispatch 3 result: done, HEAD ae7107d8f. Task 3: complete (cb7214d14). Task 4: complete (4b7f46dce + ae7107d8f; move and docs in one commit). Suite green 2024 files, tsc + fast typecheck pass; ids same, positions exact at 2 instants. SCENE_BODIES / SCENE_CELESTIAL_BODIES order changed (stars first); other tables unchanged. Deviations: starCatalog layer.ts gains `bodies`; test `no star row is a planet`; bodyRegions test mocks appBodies; CompactBodyCard.test.tsx deleted; oneMpcSeam allow-list row for sStarOrbitInfo; spike kit reformatted by `npm run format` then restored from scratchpad (unstaged).
Adjacent (not fixed): docs/science.md links missing src/layers/filaments/render/filamentRenderer.ts (pre-existing).
Dispatch 4: mid-branch reviews of Task 3 (a0d825a24..cb7214d14) and Task 4 (cb7214d14..ae7107d8f), opus → (running)
Task 5 so far: after-shots in scratchpad/b-after/ (7 views; s2 pair identical by eye). Perf after, merged ms: earth-surface 14.3, solar-system 11.3, galactic-centre 10.0, full-survey 27.8. Three earth-surface repeats on the same commit: 14.4, 12.2, 13.6 → the 12.5→14.3 read is inside same-commit drift. CPU rows (perf:cpu) unchanged at all poses (largest rows within ±0.06 ms both ways).
Ruling: no paired A-B-A-B — the hook wants worktrees under .claude/worktrees and worktree isolation refuses that path, so a base checkout cannot be made from this session; evidence is same-commit drift + unchanged CPU rows + no GPU pass touched — if wrong: a small GPU regression rides in unseen; owner can ask for a paired run from main.
Dispatch 4 result: Task 3 review clean, Task 4 review clean (no Critical/Important). Minors for the fix round: (c) plan Task 4 ticks "commit docs separately" but ae7107d8f is one commit — reword the checkbox; (d) spec :28-31 import snapshot now shows layers/starCatalog paths — add "(since moved)"; (e) starCatalogBodyRows.ts:396/414 pair rows by index with no id check.
Payoff build (informative, spike kit repointed + payoff/appHome.ts stand-in added, all untracked): body Layer rows only → 276 kB gzip (was 279), star data absent from the bundle; empty registry → 230 kB gzip, builds (not run; core still throws without shape-model rows until PR C).
Dispatch 5: whole-branch review 6cd89c2a7..ae7107d8f, fable → (running). Owner checks: 7 before/after pairs sent as one dash ask.
Dispatch 5 result: whole-branch review = ready, no code defect. Important: ATTRIBUTIONS.md six stale paths; data/raw/horizons/README.md:4 stale path; plan Task 5 unticked (controller ticks at feature-done). Minor: stale headers StarOrbitInfo.d.ts, PositionDriver.d.ts; SCENE_BODIES order note (no fix; per-frame `find` walks 39 more entries).
Dispatch 6: the one fix round (items a-e + the above), sonnet, BASE ae7107d8f → (running). After it: feature-done (tick Task 5, plan → completed/, ledger archive), push, PR, CI watch. Merge only on the owner's word.
Carry to end: tools/reference-engine/vite.payoff.config.ts:12 stub map names the old corrections path (untracked kit; fix before the payoff build).
Dispatch 6 result: fix round done, 642fcccbc (9 items, nothing skipped; new test `every orbit row's body id is its elements id` passes).
Done audit: full suite 2024 files / 35277 tests pass, `npm run typecheck` 0 errors, plan boxes all ticked. Owner visual checks (ask AK3k, 7 pairs) open at PR time. Plan complete; ledger archived.
