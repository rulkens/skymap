# Body Layers missions craft — ledger

Plan: docs/superpowers/plans/2026-10-20-body-layers-missions-craft.md (written, UNCOMMITTED)
Branch: body-layers-missions-craft off main 534efddab (same wt as P1/P2–P4). Prior ledger: ../2026-10-20-body-layers-p2-p4/progress.md.

## Open (dash ask WGDt)
- S1 mesh slots: stay core (rec) / LayerCoreDeps field / SlotDeps.state.
- Split: two PRs (rec) / one.
- R1 own 'craft' selection kind now (rec) / stay on body kind.
- R2 rename Source.MeshBody 32 → Craft (rec) / append 37.
- R3 missions search member (rec) / core until body PR.
- R4 accept no craft-caption mute checkbox (rec) / want toggle.

## Spec revisions the plan carries (tell user if any is wrong)
- spacecraftPresent stays core (frameContext + slot demand read it); presentFromIso values move.
- Roster splits: bodySlabRosterIds (NEAR0 + probes) vs coreSceneBodyIds (core draws).
- Interim CORE_MESH_BODY_IDS (Søndermarken) until earthScenes draws its own rows.

## Ruled (ask WGDt, 2026-10-20)
All as recommended EXCEPT R4: user wants a toggle → one missions label item "Spacecraft" (`missions.items.craft.labelEnabled`) mutes every craft caption (my naming call). Spec ruling 8 amended + new ruling 10 (mesh slots stay core). Plan + spec committed 4b2e0195f, pushed; draft PR opened (PR 1).
- Dispatch A (Tasks 1–2, Sonnet) running.

## NEXT
Answers → fold into plan (if S1 ≠ rec: re-plan) → commit plan → dispatch A (Tasks 1–2, Sonnet) → B (3–4, Opus) → Task 5 inline → review → PR → CI → smoke → merge ask.
- Task 1: complete (f74439d6f). Task 2: complete (88d1b61a3). typecheck clean, 7946 scoped tests green; full suite flaked once (4 unnamed failures), two reruns green — watch CI.
- Dispatch B (Tasks 3–4, Opus) running. PR 1 = #936 (draft).
- Task 3: complete (31ef518b2). Task 4: complete (f0659026c). Full suite 18144 green first run; 3 mutation checks pass. Off-plan: tests retargeted (whale now craft), stale meshBodiesPass comments fixed.
- Task 5 (docs + unused NEAR0 import in bodyGlintsPass) dispatched to Sonnet (planned inline; delegated per >2-file rule).
- NEXT: final whole-branch review (one) → fixes → push → CI → smoke pairs (plan DoD links) → DoD → merge ask.
- Task 5: complete (bffd78dd6). Pushed; CI on #936 watching (bg).
- Final review: no blockers; rows value-identical to 17 sig digits; no TDZ; only BodyPosition changed. Finding 1 = improvement (craft glints no longer dropped on core MAX_GLINTS overflow, 42→33) → mention in PR body. Fixes dispatched (Sonnet): glint-brightness util, INSTANCE_FLOATS → data, static CORE_SCENE_BODY_IDS, one mesh-pass factory, surplus headers, stale docs.
- Smoke ask yaQw sent (Curiosity/Hubble/whale/Voyager pairs + live glints + Hubble click). I eyeballed Curiosity pair: identical.
- CI green on bffd78dd6. Review fixes: complete (8313e24db, +166/-170), full suite 18149 green. Pushed; PR body updated (glint-overflow side effect). CI re-check bg.
- NEXT: CI green + smoke yaQw pass → /feature-done for PR 1 (plan stays in plans/ — PR 2 still to run; deletion audit = this feature PR, run it) → ready → merge ask.
- CI green on 8313e24db. Waiting on smoke ask yaQw.
- Smoke ask yaQw: ALL 6 PASS. Dev servers were stopped by another agent on purpose (user) — don't restart unprompted.
- DoD PR 1: Tasks 1–5 ticked; 0 new TODOs; review leanness pass applied (8313e24db) = deletion audit for this PR; plan stays in plans/ (PR 2 pending). Diff: code +1028/-626, tests +133/-22, docs +510/-18 (docs = plan+spec).
- Main moved → merged in, tsc clean, 12973 key tests green, pushed, #936 marked ready. CI bg → then merge ask ALONE.
- Dev server restarted on user request: http://localhost:5176 (5174 now held by openspace-camera-mode wt).
- Live checks on :5176 (Mars glints, Hubble click): user PASS.
- USER: 'once CI passes, you can merge' (#936). Merge on green d248d98ca.

## PR 2 (2026-10-21)
- #936 MERGED `2fd9f7a24` on green (user OK). PR 2 branch `body-layers-craft-selection` off origin/main 2fd9f7a24.
- Task 6: complete (1dff38b56). Task 7: complete (1dff38b56). 18398 tests green, typecheck clean. Off-plan: craft source row `bearsLabel: true` (Labels & Guides needs it); `isRegistryBodyId` covers all non-star scene bodies (pose links); `meshBodiesPassOver(name, roster, pickIdOf)`; exhibits' picking patches gain `craft`; ~13 comments "mesh-body"→"mesh body".
- Pushed; draft PR **#938**. Dispatch D (Sonnet, Task 8) running.
- Task 8: complete (e29830017). 18406 green. Off-plan: AUTHORED table in bodySearchNames deleted; paletteRows shot lookup for layer rows; no screenshot of a craft palette row taken.
- Pushed e29830017. Final review (Opus, read-only) running; bg CI check (sleep 660 → gh run list) running.
- Final review: no blockers; settings never persisted (no dead key/migration); all off-plan accepted. Fixes 1–10 + adjacent test-import cleanup dispatched (Sonnet, one commit): dead label-claim path deleted, website copy "Spacecraft", petunias dup alias, redundant isRegistryBodyId clause, one craft order table, dead objectCatalogue fallback, derived initialState key, meshBodyCaption pickId: number, comment fixes.
- CI green on e29830017. Review fixes: complete (f39741ff6, +45/-114), pushed; CI green on f39741ff6. Smoke ask N1dq sent (7 checks + region-chip choice). NEXT: answers → /feature-done (plan + ledger → completed/; spec stays, body PR pending) → merge ask ALONE.
- Left for user (smoke ask): craft palette rows lost the region chip `bodyRowChip` (LayerSearchEntry has no chip; restoring = contract widening). Not fixed: `missions.craft` (emphasised craft) vs `missions.items.craft` (caption switch) naming overlap — mention only.
- NEXT: D done → push → one final whole-branch review (Opus) → fixes → CI → smoke ask (DoD "PR 2 adds" list, links on :5176) → /feature-done (plan + spec? spec stays — body PR pending; plan + this ledger → completed/) → merge ask ALONE.

## RESUME HERE (2026-10-21, superseded by "PR 2" above)
- Branch body-layers-missions-craft @ d248d98ca (main merged in), PR **#936** ready. Tree clean.
- In flight: bg CI check (sleep 600 → `gh run list --branch body-layers-missions-craft`). Dev server bg on http://localhost:5176 (this wt).
- STANDING USER DIRECTIVE: "once CI passes, you can merge" #936 → on green for d248d98ca: `gh pr merge 936 --squash` (no --delete-branch; never from main checkout). Red → diagnose/fix, do NOT merge.
- After merge: PR 2 (Tasks 6–8: craft selection kind, Source.Craft 32, "Spacecraft" caption toggle, missions search) on a fresh branch off main, same wt; dispatch C (Opus, Tasks 6–7 one commit) → D (Sonnet, Task 8) → review → CI → smoke → /feature-done (plan + this ledger → completed/) → merge ask ALONE.
- Then per spec §7: earthScenes PR (deletes CORE_MESH_BODY_IDS' drawing role), body PR (opens with P5), seeded stars PR.
- Remote branches to delete at wt cleanup: worktree-layer-migration-survey, body-layers-p2-p4 (+ body-layers-missions-craft after merge).
