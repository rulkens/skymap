# SDD ledger — plan: docs/superpowers/plans/2026-09-15-layer-composition-04b-contract-empty-tuple.md

Branch `worktree-layer-composition-04b`, draft PR #711. Execution base: ac3530d9c (plan after review + R2). Spec: §9(d).
Protocol: lean (sdd-execution.md). One worktree, serial Sonnet implementers, one final review, CI gate.
Rulings at start (user 2026-09-15): parallelism = one PR, 4 grouped dispatches; perf gate = none (plan header justifies); R2 rides PR-B (Task 3).

## Task list (15)

- [x] 1 contract types, backlog D consumed
- [x] 2 import-boundary ratchet (both directions)
- [x] 3 contentVersion on the bake key; fadeTo target-shaped
- [x] 4 targetOf; applyIntent skips a held target
- [x] 5 generic syncFades; FADE_ROW + writes go
- [x] 6 flow field reconciles its seed in the frame; saga goes
- [x] 7 six core selection rows + composer
- [x] 8 composed resolver in saga ctx + pick path; tables deleted
- [x] 9 factsReported; engine slice composes facts
- [x] 10 handle shrinks; structure list a fact
- [x] 11 createLayers, LayerInstance, deps, destroy in reverse
- [x] 12 frame hook runs and votes (D2)
- [x] 13 readiness narrows to core; ready ctx loses galaxy handles
- [x] 14 panel renders composed sections first
- [ ] 15 gate (controller inline: CI, final review, attestation)

## Dispatches (serial order 1,2 · 3–6 · 9,10,11 · 7,8,13,12,14)

| #   | tasks                              | model  | BASE→HEAD           | status                                                                                                                                                                                                                                                                                                                             | turns |
| --- | ---------------------------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| D1  | 1, 2                               | sonnet | ac3530d9c→685b7c534 | landed, no deviations (app.ts needed no change)                                                                                                                                                                                                                                                                                    | ~?    |
| D2  | 3, 4, 5, 6                         | sonnet | 685b7c534→d2f789518 | landed; 4 named deviations (T4 post-test at applyIntent level; fadeLayers.test rewritten; T6 5 extra files incl. tools/flow-workbench createFlowHarness; tour.integration fades stub +targetOf as own commit)                                                                                                                      |       |
| D3  | 9, 10, 11                          | sonnet | d2f789518→e1f5bc6e6 | landed; deviations: composed rows named `state.selectionKindRows` (EngineState.selectionRows already taken by the saga display cache); assertSelectionRowsDisjoint written early (T7 reuses); T10 Cmd+K box unattested                                                                                                             |       |
| M1  | merge origin/main (#708 #710 #715) | sonnet | e1f5bc6e6→75c589075 | landed + pushed; contentVersion ported into scheduleSkyCaptures.ts under the rebakeOnSettings gate; #715-pruned tests dropped not resurrected; makeReconcileEffects dead reseedFlow test deleted                                                                                                                                   |       |
| D4  | 7, 8, 13, 12, 14                   | sonnet | 75c589075→5caebf388 | landed + pushed; deviations: T8 fallout in 5 more test files + saga harnesses gain `selection`; T13 engineReady.test gone (#715), ~15 ReadyFrameContext fixtures trimmed; T14 SettingsPanel.test created fresh; +1 stale-comment commit                                                                                            |       |
| R   | final review                       | opus   | 5caebf388           | done: 0 BLOCKER, 4 FIX (F1 second resolver in wireInput; F2 test-store resolver inert + missing saga deep-link case; F3/F4 stale comments/docs), 9 NIT; report scratchpad/review-04b-final.md                                                                                                                                      |       |
| FX  | fix round F1–F8,F10,F13            | sonnet | a140a45d9→c105e0d1f | landed + pushed; F7 declined (readonly payload needs the spread under Immer — review premise wrong); F9/F11/F12 = PR-body notes (unused ComposedSources kept per Ruling 8 for PR-C; fadeTo idempotence also covers clip/structure-focus re-fades; famous-vs-static prefix collision throws inside waitUntil, PR-D owns the assert) |       |

Ruling: contentVersion obeys `rebakeOnSettings` (from #708) exactly as the settings ref does — a once-baked row ignores content bumps; only band entry bakes it — cost if wrong: a stale solarSystem env cubemap after a tier swap, fixed by dropping the gate for that term.
Ruling: composed selection rows live at `state.selectionKindRows`, not `state.selectionRows` (name taken) — cost if wrong: a rename.
Landmine (user): CI never settles if main moved under the PR — fetch + merge main + push before reading `gh pr checks`; only at dispatch boundaries.

## Queued sequence (resume here)

1. DONE — M1 landed 75c589075, pushed; origin/main still dc222eaef at push time.
2. DONE — D4 landed 5caebf388, pushed (origin/main still dc222eaef). (sonnet): Tasks 7, 8, 13, 12, 14 in that order, one worktree, protocol block verbatim. Brief MUST say: composed rows are `state.selectionKindRows` (not `selectionRows`); reuse `src/utils/selection/assertSelectionRowsDisjoint.ts` (+test) already landed in Task 11; Task 8 after 11 (landed); 13 before 12; consult the merge commit for #708/#710 shapes (scheduleSkyCaptures.ts, CameraRuntime.surface, probeDue).
3. DONE — review + fix round (c105e0d1f pushed), CI GREEN on it (origin/main dc222eaef contained), PR body set from scratchpad/pr-711-body.md. Dev server started in this worktree (public/data linked to main); user asked to stop ALL dev servers (six, one per worktree) — done; none running. For attestation the user starts one: `npm run dev -- --port 5180 --strictPort` in this worktree.
   3b. Attestation IN PROGRESS (dev server :5177 in this worktree). Attested: 1 pick path, 3 Cmd+K, 4 `l`, 8 debug slots, milkyWay deep link, galaxies-off re-bakes the lensed sky. Plan example id fixed (cdfc8f373: cluster-virgo-m87). Merged #717 (13678afd3), pushed.
   NOT regressions (A/B'd against origin/main served from this worktree, headless probe `probeDeepLink.ts` in this dir): structure deep link never tweens at boot (watchFocusTweenSaga returns on null row, retries only for stars) — main identical; flow particle-count change does not reseed — main identical. Both → adjacent findings, ask user (pick up here or backlog).
   USER RULINGS 2026-09-15: (1) structure deep link → FIX HERE (B1 LANDED 4873d5320: NOT_YET_LOADED table {star, structure} in watchFocusTweenSaga, ResolveDeps.structures.loaded?() + StructureStore.loaded(); pulse = engineStructureCountsChanged; headless: Virgo at 4.7 Mpc. Controller follow-up 43a10c417: watchSelectionRowsSaga gap-fill also takes engineStructureCountsChanged). (2) famous textures / disks → "implement properly" HERE (B2 LANDED 80187bce1 — sourceOpacity on DiskWalkInput, both planners, deriveSourceMasks(nowMs) at 3 call sites incl. cubemapFaceContext; scheduleSkyCaptures untouched; root cause = texturedDiskSubsystem fadeAlpha lacks the source fade term [galaxyPointSpritesPass has it]; deriveSourceMasks calls opacityOf without nowMs → mask lags one frame → thumbnails baked into the "settled" sky bake; fix = sourceOpacity(nowMs) into both disk planners + masks read nowMs). (3) flow reseed → BACKLOG, own PR #721 (docs only, via GitHub contents API, branch backlog/flow-reseed) — MERGED c43f43615, branch deleted; main moved → merge main into the branch before CI.
   NOTE: shell cwd got reset to the MAIN repo — use absolute paths / `git -C <worktree>` from here on.
   DONE: merged main post-#721 (891b82ee3), typecheck clean, pushed; CI GREEN on 891b82ee3; user ATTESTED 2 and 7 (all eight checks now attested). PR body updated with the two fixes.
4. DONE. 5. LANDING RUNNING: deletion audit DONE (12 candidates; ~85 src / ~80 test lines + 446 test cases); triage: apply 1,2,4,5,7,8,9,12; fence 3 (defineLayer = plan Task 1 contract), 6 (gate item), skip 10,11; sonnet apply round RUNNING (commit '04b deletion audit — …') → then push, main-moved check, CI → artifact republish → /feature-done → PR ready → STOP for user's merge word. Then (`gh pr checks 711`, main-moved check first) → Task 15 gate inline: one whole-branch final review (top tier; mandate = spec §9(d) fidelity + slop; give it the plan, spec headings, and the branch diff) → one fix round by a sonnet implementer → no re-review.
5. User attestation (dev server in this worktree, `/link-data` first): tier swap near the black-hole lens re-bakes the lensed sky; Cmd+K lists structures on first open after boot (T10 box).
6. Landing: republish task-list artifact https://claude.ai/code/artifact/6745ae36-8d92-41a1-9d13-b531f1efaf90 from scratchpad `sdd-04b-tasks.html` (once); diff breakdown code/comment/test/doc once; deletion audit (feature PR, so it runs); `/feature-done` moves ONLY the plan (spec shared by 04c/04d — stays); archive this ledger to `docs/superpowers/plans/completed/2026-09-15-layer-composition-04b-contract-empty-tuple.ledger.md`; PR #711 ready; squash-merge on the user's word; remove worktree + branch.
7. After merge: plan 04c (PR-C galaxy-side moves) in a fresh worktree.

## Test-count reconciliation (static it()/test() count, origin/main dc222eaef vs a140a45d9)

main 5405 cases / 1223 files → branch 5439 / 1226 (+34). Deleted 40, added 74; per difference:

- −22 resolveFocusId.test, −10 extractSelectionRow.test, −5 resolvePick.test, −3 resolvePickTable.test (T8 tables deleted) → +35 composeSelectionRows.test + 2 coreSelectionRows.test + 4 assertSelectionRowsDisjoint.test (cases moved onto the rows; deep-link boot-window case lives in composeSelectionRows).
- −2 watchFlowReseedSaga.test (T6 saga gone) → +1 flowFieldRenderer.test (reconcile) ; −2 makeReconcileEffects.test (dead reseedFlow scaffolding, M1).
- −1 watchFadesSaga.test (T5 fold: four settings-write cases → one generic syncFades case; main's mergeSnapshot standalone dropped in M1 as one of the folded four) → +6 syncVisibilityFades.test, +2 fadeRegistry.test (targetOf), +1 fadeController.test (held-target early return).
- T3: +1 renderFrame.cubemapCaptures.test (contentVersion bump), +2 galaxyCatalogSourceRegistry.test (commit bumps contentVersion).
- T9/T10/T11: +4 engineSlice.test (factsReported/layerFactsSeeded/structure list), +4 createLayers.test, +3 instantiateLayer.test, +1 engine.destroyOrder.test, +1 bootstrap.test, +1 wireStructureProjection.test.
- T12/T13: +4 runFrame.test (frame hook + votes), +1 shouldKeepTicking.test, +1 frameContext.test, +1 passes.test.
- T2: +2 layerImportBoundary.test. T14: +2 SettingsPanel.test (new file).
  No unexplained drop.
