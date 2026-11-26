# SDD ledger — plan: docs/superpowers/plans/2026-11-24-body-content-out-of-core-c-meshes.md

Worktree: .claude/worktrees/body-content-c-meshes, branch worktree-body-content-c-meshes, base 61626c078 (PR B squash), plan commit d9c2bb421. Dev server :5176 (background task bxmslw6j5).
Owner answers (carried): one PR at a time; perf gate on every prep PR; LayerCoreDeps.meshBodies + LayerBody.shapeModel approved 2026-11-24. Owner said "yes merge it" for B and I announced starting C; not contradicted.
Baseline (before code): shots scratchpad/c-before/{phobos,bennu,curiosity,voyager1,soendermarken,hubble,probe}.jpg at t=2026-01-01T12:00:00Z; perf scratchpad/c-perf-before-{earth-surface,solar-system,full-survey}.txt, c-perfcpu-before.txt (running as task bgdyya3m6 when this was written).
Shot links: focus=body-phobos, body-bennu, body-curiosity, body-voyager1, body-soendermarken, body-hubble; layers=probeSpheres&focus=body-probe-sphere-orbit.
Spike kit (untracked, never commit): tools/reference-engine/, src/compositions/galaxiesOnly.ts; backup scratchpad/spike-kit/.

Ruling: tierCeiling is Tier, not number — matches the generated table — if wrong: none.
Ruling: MeshPresentation carries resolvePx — helper keeps the spec's 2-arg signature, no SCENE_BODIES lookup — if wrong: one extra field.
Ruling: mesh rows rank 11 (spec said keep 10) — missions is composed before body, so equal rank would fetch craft meshes ahead of body textures; 11 is unused and keeps today's order — if wrong: owner wanted array order; revert to 10 + reorder composition.
Ruling: shape models joined in bodyBodyRows.ts from a Layer id list — same pattern as corrections — if wrong: rows hide which have a model.

Dispatch 1: Tasks 1-2, opus, BASE d9c2bb421 → (waiting on baselines, then dispatch)
Baselines done: perf merged ms earth-surface 14.3, solar-system 13.0, full-survey 28.0 (60 frames); 7 before-shots present; probe sphere draws.
Dispatch 1: Tasks 1-2, opus, BASE d9c2bb421 → (running)
Dispatch 1 result: DONE_WITH_CONCERNS, HEAD 8722cec6c. Task 1: complete (26b8ee944; 2 tests red on that commit alone, fixed in Task 2 commit). Task 2: complete (8722cec6c). Suite 2035 files green, tsc clean. Dumps: MESH_PRESENTATIONS same 18 ids same order; asset key set same (59); only change = 18 mesh rows 10→11; all body textures ahead of all mesh rows. Order among mesh rows changed: phobos..bennu now ahead of soendermarken + probe spheres (body Layer composed before those Layers).
Deviations: meshBodiesAttachedTo.test mocks MESH_PRESENTATIONS; composition test "slot key core already owns" deleted; one table-driven per-Layer test; 3 extra stale comments fixed; BodyAssetKey mesh arm is documentation only.
Adjacent → Task 3: tools/meshes/meshAssetRowFields.ts:28 + meshAssets.generated.ts:12 doc names meshBodyRow.req (hand-fix both, no regen).
Dispatch 2: review of Tasks 1-2 (d9c2bb421..8722cec6c), opus; Dispatch 3: Task 3 docs, sonnet → (running)
Dispatch 3 result: Task 3: complete (cfb5019f4). compositions README:16 and add-mission step 7 left (still true). Generated field doc hand-edited in tool + generated file.
Task 4 so far: after-shots scratchpad/c-after/ (7; phobos, curiosity, probe looked at, meshes draw). Perf merged ms before→after: earth-surface 14.3→14.9, solar-system 13.0→10.5, full-survey 28.0→28.0 (inside same-commit drift seen in PR B: 12.2–14.4).
Payoff (informative, empty registry): 218 kB gzip (230 after B, 279 at spike); npm:meshoptimizer absent from attribute output. Build not run in a browser (PR D).
Dispatch 2 result: review of Tasks 1-2 clean (no Critical/Important). Minors for the fix round: (a) delete the unused mesh arm in BodyAssetKey.d.ts:5, restore doc line; (b) appBodies.test.ts:35-42 shape-model MESH_ASSETS test cannot fail (load-time throw covers it) — drop; (c) createLayers.composition.test.ts:121 title "before core's" + .slice(0,2) at :138 stale — retitle, compare whole list.
Dispatch 4: whole-branch review d9c2bb421..cfb5019f4, fable → (running). Owner checks: 7 before/after pairs sent as one dash ask.
Owner checks (ask DqYv): all 7 pass.
Dispatch 4 result: whole-branch review = ready after docs fixes, no code defect. Important: docs claim Layers DRAW through deps.meshBodies (README :127-128, RENDERER :38, leftovers :92); leftovers LayerInstance.d.ts:20, meshPresentations.ts:3, ADR 0005:87. Minor: shape-model id list not named in docs; mistyped shape-model id silently ignored (make it throw); spec §4.2/§4.3 contradict plan rulings (amend); four-times-repeated expression (left: plan form).
Dispatch 5: the one fix round (11 items), sonnet, BASE cfb5019f4 → (running). After: feature-done, push, PR, CI; merge only on the owner's word.
Dispatch 5 result: fix round done, b97b5d9ae (11 items, nothing skipped; unknown shape-model id throws at load, with test).
Done audit: full suite 2035 files / 35446 tests pass, `npm run typecheck` 0 errors, plan boxes all ticked, owner checks 7/7 pass. Plan complete; ledger archived.
