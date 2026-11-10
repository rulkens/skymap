# SDD ledger — plan: docs/superpowers/plans/2026-11-10-source-table-deletion-prep.md

Spec: docs/superpowers/specs/2026-11-10-source-table-deletion-design.md
Branch: worktree-layer-refactor-cleanup (prep PR; spec + both plans ride it). BASE 6270a4d83.
Start asks (V1UU): perf gate SKIPPED; parallelism SERIAL (prep PR merges, then feature from main).
Pre-flight scan: no conflicts. Tasks share only layerImportBoundary.test.ts / compositions/README.md rows (T1 row 36, T3 rows 33 + CORE_ALLOWED line) — disjoint lines.

Dispatch 1: Tasks 1-3, one Sonnet implementer (all three are move-files refactors in galaxyCatalog/starCatalog).
Dispatch 1 → sonnet, BASE 6270a4d83, running
Dispatch 1: done (sonnet). Task 1: complete (30bc9ca34). Task 2: complete (182577797). Task 3: complete (0409b90d1). HEAD 0409b90d1.
Ruling: accept GalaxyRow.d.ts moving into galaxyCatalog/records/@types with its CORE_ALLOWED row deleted — the type-ownership sweep demands it and it shrinks core's allow-list — cost if wrong: one move back.
Ruling: accept AliasIndexEntry = {pgc, names, sourceLabel, focusId} instead of the plan's {pgc, names, focusId} — paletteRows.tsx reads the label and needs a unique key (GLADE and 2MRS share a pgc); the label comes from the Layer, so core stops reading the registry for it — cost if wrong: the alias testid changed (no consumers found).
Final review (opus): fix first — 1 Important (add-data-source SKILL row 3 stale), 6 Minor; all sent to implementer as one fix round.
Fix round: done (c5667401f), 7/7 addressed. No re-review (lean).
DoD manual pass (dev server :5177): #focus=m31 card type line "Spiral (Sb)" + source fields intact; #focus=star-sirius resolves (seeded-star map). Palette alias search left to the user as a dash check.
Landing: PR #1102 opened, CI watched.
