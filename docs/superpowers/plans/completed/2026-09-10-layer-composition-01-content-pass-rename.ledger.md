# SDD ledger — plan: docs/superpowers/plans/2026-09-10-layer-composition-01-content-pass-rename.md

Spec: docs/superpowers/specs/2026-09-09-layer-composition-design.md §9(a)
Worktree: .claude/worktrees/content-pass-rename, branch worktree-content-pass-rename, BASE 8f8ae20fb (main after #671)
Task list: no harness task-list tool in this session — this ledger is the list.

## Task list

- Task 1: dry-run inventory (no commit)
- Task 2: core type + CONTENT_PASSES + upsample derivatives
- Task 3: 37 pass rows + files + test mirrors (manifest from T1)
- Task 4: residue (layers→passes field, locals, comment identifiers)
- Task 5: living docs
- Task 6: gate

## Pre-flight scan

| pair / task | shared surface                                                   | produces vs consumes                                                        | finding                                                                                                                                          |
| ----------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1→T3       | passRenames.json manifest                                        | T1 writes to "scratch"; T3 runs it                                          | plan says "outside the repo"; implementers are different agents → Ruling: manifest lives at `<workspace>/passRenames.json` (git-ignored, shared) |
| T2/T3       | passes/index.ts                                                  | T2 renames CONTENT_LAYERS symbol; T3 rewrites 37 re-export specifiers       | sequential, CLI-driven, no conflict                                                                                                              |
| T2/T4       | wireInput.test.ts, ExecuteFrameArgs.d.ts                         | T2 fixes vi.mock export name only; T4 renames `layers` field                | disjoint edits, sequential                                                                                                                       |
| T3/T4       | the 37 pass files                                                | T3 moves; T4 edits locals/comments inside                                   | sequential                                                                                                                                       |
| T4/T5       | none (code vs docs)                                              | —                                                                           | T5 could pipeline behind T4 review                                                                                                               |
| T1 header   | plan line 8 says branch worktree-layer-composition off 3a12e6490 | stale: docs PR merged, branch is worktree-content-pass-rename off 8f8ae20fb | Ruling: counts re-derived by T1 anyway; branch line is history, not a requirement — cost if wrong: none                                          |
| T1/T4 greps | plan uses `rg`                                                   | implementers may lack rg / shell grep is policy-blocked                     | Ruling: implementers use the Grep tool and report counts; same result                                                                            |
| each task   | self-consistency                                                 | tests specified vs code                                                     | no new tests by design; consistent                                                                                                               |

Rulings: see rows above. Batching: T1+T2 dispatched to one implementer (T1 has no diff; review covers T2's diff).

## Execution

- Task 1: complete (no commit; counts matched inventory: 104/42/21, 37 manifest entries, 11 wesl comment sites, 0 package::, 0 tools/)
- Task 2: implemented (commits 8f8ae20fb..0243f734d), review dispatched
- Ruling: T3 dispatched while T2 review open although both touch passes/index.ts — T2's index.ts edit is one CLI symbol rename already committed; a T2 fix landing there is improbable, and T3's edits are CLI re-export rewrites. Cost if wrong: one re-run of the T3 manifest.
- Note: implementer agents in this session have no Grep/Glob tools; sweeps ran via Bash rg (permitted). Applies to T3–T5 dispatches.
- Task 2: complete (commits 8f8ae20fb..0243f734d, review clean; stale comment/describe text noted for T4)
- Task 3: implementing
- Task 3: implemented (commits 0243f734d..c56fee8e7), review dispatched
- Ruling: T4 dispatched while T3 review open (T4 edits locals/comments inside files T3 moved) — T3 is a pure CLI manifest run; a fix there would be a re-run, not a content edit. Cost if wrong: T4 rebased onto a re-run.
- Task 3: complete (commits 0243f734d..c56fee8e7, review clean; 7448-line automated pair scan found only Layer→Pass swaps)
- Ruling: `tests/services/engine/frame/passes/starCatalogLayer.frustumCull.test.ts` did not move (suffixed basename, not CLI-tracked) but the DoD requires zero `*Layer*.test.ts` there → rename to `starCatalogPass.frustumCull.test.ts` via `npm run move-files` in the T6 gate task (a mechanical move, its own commit). Cost if wrong: one file rename.
- Task 4: implementing
- Task 4: first implementer (opus) died mid-task on API 500 with 8 files half-edited, uncommitted, no report; fresh opus implementer dispatched with a Step-0 audit of the partial diff (keep name-only hunks, revert anything else), continue from there.
- Task 4: second opus implementer also died on API 500 before editing anything further (tree unchanged, 8 files / 66+60); third dispatch on sonnet, same brief. Ruling: model downgrade is a server-availability workaround, not a capability judgement — the reviewer gate is unchanged. Cost if wrong: one extra fix round.
- Task 4: implemented (commits c56fee8e7..5903338bf; 220 files, +1019/-995; suite 8182 green), review dispatched. Implementer concerns: scope followed the brief's sweep gate (247 files hit) not its file list; mechanical tail applied via script after token classification. Reviewer told to verify both.
- Task 5: dispatched in parallel (docs only, disjoint from T4; T4 already committed so index is free)
- Task 4: complete (commits c56fee8e7..5903338bf, review clean — 83 distinct token pairs all mapped, 0 excluded-identifier contact, 0 shader identifiers changed)
- Task 4: minor (deferred): src/utils/scene/bodyGlintBrightness.ts prettier reflow of a 3-line ternary in an untouched region (formatting-only hunk)
- Task 4: minor (deferred): report overstated sweep-2 → 0; `hdrLayers`/`swapLayers`/`fgLayers` + bare `layer` locals remain in tests/services/engine/frame/passes/passes.test.ts (within brief rule 2 scoping)
- Task 4: minor (cross-task): `layerTimingSlotName` (src/services/engine/frame/slabs.ts:104, 12 refs) is a live export still carrying "layer"; not caught by the sweeps. Ruling: rename to `passTimingSlotName` via `npm run refactor -- rename` in the T6 gate task, own commit, beside the starCatalogLayer.frustumCull.test.ts move. Cost if wrong: one symbol rename to revert.
- Task 5: implemented (commits 5903338bf..3c23ca38a; 32 docs, +96/-96), review dispatched. Implementer left `renderers.md:324` stale example (`pointSpritesLayer.ts`, predates this rename) and an s-star backlog citation of a never-landed file — both classified out of scope.
- Task 6: dispatched (gate + the two ruled mechanical ops: `layerTimingSlotName`→`passTimingSlotName`, `starCatalogLayer.frustumCull.test.ts` move)
- Task 5: complete (commits 5903338bf..3c23ca38a, review clean)
- Task 5: minor (deferred): renderers.md:324 `// pointSpritesLayer.ts` example predates this rename (no such file ever; real name galaxyPointSpritesPass.ts) — pre-existing staleness, candidate for a docs follow-up, not this PR
- Task 6: complete (commits 3c23ca38a..a45ac1433 = 2151af556 rename + a45ac1433 test move; gate PASS: typecheck, 1216 files/8182 tests (=base file count), build+WESL green; 259 files, +1831/-1807, 70 renames)
- Ruling: `starCatalogLayer.frustumCull.test.ts` lived in tests/services/engine/frame/ (not passes/); the move relocated it into passes/, matching its source's mirror home. Kept — one-file CLI move, correct mirror. Cost if wrong: move it back. Stated in PR body.
- Final whole-branch review dispatched (opus) over 8f8ae20fb..a45ac1433
- Draft PR #674 opened on worktree-content-pass-rename @ a45ac1433 (body states perf/visual skipped on purpose, test relocation, deferral boundary)
- Final review (opus): MERGEABLE, 0 Critical/Important, 6 Minor; 244/259 files token-identical modulo rename map; DoD all ✅ (mirror count 31 not 30 due to ruled relocation)
- Ruling: one fix wave for Minor #1 (`layerName` param in passTimingSlotName), #2 (`plainLayerGroupKeys` local fn), #3 (backlog s-star citation `sStarLensedImagesLayer.ts`→`sStarLensedImagesPass.ts`) — name-only, in this PR's scope; leaving them ships a half-rename. Deferred: #4/#5 prettier reflows (harmless), #6 passes.test.ts locals → prep (c) rewrites that file. Cost if wrong: one commit to revert.
- Final fix wave: commit 2f6960f67 (passName param, plainPassGroupKeys, backlog citation, one test comment); fixer left backticked `layerName` in passTimingSlotName's JSDoc prose — scoped re-review dispatched over a45ac1433..2f6960f67
- Re-review: all 3 ADDRESSED, no new breakage; new Minor: backticked `layerName` ×2 in passTimingSlotName JSDoc (slabs.ts:91-92). Ruling: fix (project rule "finish half-renames" outranks the no-second-wave process default); 2-token comment edit, verified by controller reading the commit diff instead of a fourth review seat. Cost if wrong: one commit.
- Micro-fix commit 39bca686b verified by controller: 2 lines, two backticked tokens `layerName`→`passName`. Final review closed clean. HEAD 39bca686b. Next: /feature-done, ledger archive, PR ready.
- Leanness audit (opus): net +24 LOC all prettier reflow, safe-now none. Needs-ruling: free-prose "layer" for passes in ~40 frame files. Ruling: leave for the PR that introduces the Layer concept (spec relocates that prose; a sweep now collides with the new vocabulary). Cost if wrong: a later prose sweep.
- /feature-done: READY (tests 8182/1216 = main, typecheck, build+WESL green, 0 TODOs, 0 smells, parity OK). Plan checkboxes ticked in the completion commit; plan moved to completed/; spec stays active (spans (a)–(g)); ledger archived.
- Plan 01 SHIPPED to draft PR #674, HEAD 39bca686b + completion commit. Rulings made: see all `Ruling:` lines above.
