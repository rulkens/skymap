# Body Layers P2–P4 prep — ledger

Plan: docs/superpowers/plans/2026-10-20-body-layers-p2-p4-prep.md (committed dcbd4a83f)
Branch: body-layers-p2-p4, STACKED on worktree-layer-migration-survey (#929). Same wt.
No PR yet: stacked PRs get no CI. After #929 squash-merges: merge main in, push, open draft PR.

## Rulings
- No perf gate (≤2 extra fade resolutions per frame). Dispatches sequential: A=T1, B=T2–4, C=T5–6.
- My call: EngineState.orbitTrailRows renamed orbitTrailGroups (14 refs, all in touched files).
- USER (ask tJr9): S-star trails row stays in composition order (near the top of L&G). No ordering mechanism.
- B dispatches only after C commits (shared files: createLayers, LayerInstance, instantiateLayer, EngineState, Layer.d.ts).

## Dispatches
- A (Task 1) dispatched, Sonnet, bg.
- Task 1: complete (4e88999e2). 723 frame tests green.
- C (Tasks 5–6) dispatched ahead of B (B waits on the S-star row ask). Commit order becomes P2, P4, P3.
- Tasks 5–6: complete (62b0682e8). Full suite 17256 green (46 website files fail to load: pre-existing github-slugger). ~14 EngineState stubs gained `terrain: FLAT_TERRAIN`.
- B (Tasks 2–4) dispatched.
- Tasks 2–4: complete (34ec5d962). Full suite 17280 green. Mutation checks only reasoned → final review mutates them.
- Final whole-branch review dispatched (bg, read-only, mutation-verifies 3 tests, explains the starPointsPass ↔ orbitTrailGroups oddity).
- Review: no blocking findings; 3/3 mutation checks pass; starPoints oddity = fixture artefact; 14 terrain stubs all needed. 7 low findings → fixes 1–6 + stale comment dispatched; #7 (composeTerrain inline param type) skipped.
- Review fixes: complete (4de946519). Pushed; stacked draft PR **#930** (base = P1 branch). Retarget to main + merge main in after #929 merges → CI.
- Smoke shots sent (dash): Sgr A* (`focus=blackhole-sgr-a-star`; `body-s2` is NOT a valid link), Saturn, Søndermarken, main vs branch; plus a live toggle check on :5174.
- Adjacent (not fixed): `missionTrails/selectors.ts` dead export, same as the sStarTrails one deleted here.
- NEXT after B: final whole-branch review (one) → fix → wait for #929 merge → merge main in → push → draft PR → CI → smoke eye-checks (DoD list in plan).
- Smoke ask VSuu: ALL PASS (Sgr A*, Saturn, Søndermarken terrain seat, independent trail toggles).
- Main moved (#920 scale bands, #928, #919). P1 branch: main merged in (4a11f6497), P1 plan → completed + ledger archived (32a5eb2a8), pushed; CI on #929 re-running (bg).
- P2–P4: P1 branch (incl. main) merged in cleanly; tsc clean; full suite running (bg). Push after green.
- Full suite after main merge: 1 fail — main's new `layerStateShape` convention requires `state/<cluster>/selectors.ts`; restored sStarTrails/selectors.ts (f10b2d0c5), pushed. So the "dead missionTrails selector" adjacent finding is NOT dead weight — drop it.
- **#929 MERGED** (user "Merge it", ask V9bd) → c7f631a7f. Remote P1 branch kept (was #930's base) — delete at wt cleanup.
- #930 retargeted to main; origin/main merged in (8f9949a22, README table conflict resolved: main's table + terrain row). tsc clean, conventions/compositions/phases/orbitTrails green. CI run 39443384862 watching (bg).
- NEXT: CI green → /feature-done for P2–P4 plan (no deletion audit: prep) → mark ready → merge ask ALONE. Then missions craft PR (spec §7 step 3).
- CI red on #930: website `docsReference.test.ts` wanted a settings-reference row for `sStarTrails.enabled` (website tests never loaded locally — github-slugger missing; fixed by `npm install` in this wt). Row added before Mission trails (0405ab3a8); 774 website tests green locally. CI re-watching.
