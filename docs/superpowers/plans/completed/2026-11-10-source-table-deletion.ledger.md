# SDD ledger — plan: docs/superpowers/plans/2026-11-10-source-table-deletion.md

Spec: docs/superpowers/specs/2026-11-10-source-table-deletion-design.md
Branch: feat/source-table-deletion (from main 045616ef6, after prep #1102). Same worktree as the prep.
Start asks (V1UU): perf gate SKIPPED; SERIAL. Sju2: per-entry colour "do it now".
Pre-flight: Task 1 ships before Tasks 2-4 (each consumes Task 1's id-valued Source); Task 4's substitution needs Task 1's table as its map. No conflicts.
Ruling: per-entry colour landed as its own leading commit 49547a376 on this branch (typeColour on GalaxyCatalogSourceEntry, GALAXY_TYPE_CLASSIFIERS keyed by threshold set) — the user asked for it now and #1102 had already merged — cost if wrong: one commit to drop or split into its own PR.
Ruling: bin parity builds via `tsx buildAllBins.ts --out-dir <workspace>/bins-*` with main's raw folders symlinked into data/raw, instead of unlinking public/data (plan edited, 6bf6b4f60) — keeps the dev server's data intact for shots — cost if wrong: none to shipped code.

Dispatch A: Task 1 (sonnet). Dispatch B: Tasks 2-3 (sonnet). Dispatch C: Task 4 (sonnet). Task 5: controller.
Dispatch A → sonnet, BASE 6bf6b4f60, running
Dispatch A: done (sonnet, 72 tool calls). Task 1: complete (73e421a5b). Bins 6/6 identical; boot clean; shots before/after-*.jpg (Labels shot skipped: no deep link). Numeric uses were tools (buildAllBins inputCounts, buildFilaments in-memory Uint8Array → array; not persisted) and test stubs.
Ruling: accept docsSettings.ts website rows reordered to the new registry order (docsReference.test pins panel order) — spec §9.1 says the user rules at Task 5 — cost if wrong: revert one array order.
Ruling: accept sStarSource.test's pick-code-ceiling check replaced — pick codes come from the allocator since #1057, so the ≤62 ceiling on entry.code tested nothing — cost if wrong: none.
Dispatch B → Tasks 2-3, sonnet, BASE 73e421a5b
Dispatch B: done (sonnet, 93 tool calls). Task 2: complete (9e63a4302). Task 3: complete (36c3a2c95). typecheck clean; full npm test green once (32868). Step 4 break-it check on sourceRegistryCoverage NOT run.
Ruling: accept APP_SOURCE_REGISTRY `satisfies Readonly<Record<string, SourceEntry>>` (plan said SourceId) — SourceId derives from the registry, so the plan's form is circular (TS7022); keys are entry ids by construction — cost if wrong: none at runtime.
Ruling: accept SEEDED_STAR_CATALOGS_BY_SOURCE and SeededStarRef.source keyed by StarCatalogId (plan said SeededStarCatalogId) — the narrower key forces casts at the .has/.get membership tests — cost if wrong: a looser type on one map.
Ruling: accept catalogStore's CODE_OF_ID/CATALOG_DRAW_ORDER deletion — draw order still iterates GALAXY_CATALOG_SOURCES, which was already row order on main (checked vs 14cff2b5d) — cost if wrong: none found.
Dispatch C → Task 4, sonnet, BASE 36c3a2c95
Dispatch C: done (sonnet). Task 4: complete (62799398b). typecheck + npm test green (32863); bins identical to baseline. Deleted tests/sources.test.ts + 2 tautological describes.
Task 5 shots: final-{m31,sirius,mars,sdss}.jpg match before-*; bare #focus=mars was never valid (body- prefix; T1 implementer hit the same at 18:44 pre-edit); first SDSS thumbnail blank was an external-fetch flake (reshot fine).
Final review (opus): no runtime defects. Important: sourceClass header, ~20 stale `Source` comments, fakePickCode purpose gone, Labels order ruling open. Minors 5-13.
Ruling: fix round takes 1, 2, 5-12; skip 13 (buildFilaments array vs Uint8Array: a build tool, ~8 MB extra at most, clarity wins) — cost if wrong: slower filament build.
Ruling: fakePickCode fold (3) and Labels order (4) go to the user in the dash — 3 touches 21 test files beyond the plan; 4 is spec §9.1's named user call.
User (mbBQ): Labels order KEEP Layer order; fakePickCode FOLD into testPickCode on this branch.
Fix round: done (275f7f77b review fixes, cc7e9d7d3 fakePickCode fold). typecheck clean; targeted tests green.
Task 5: complete (shots final-* match; Labels order ruled KEEP by user). DoD: deliverables present, bins equal, preset tests, data/raw links removed. Landing: plan+spec+ledger to completed, PR next.
