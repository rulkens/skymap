# Body Layers earthScenes — ledger

Plan: docs/superpowers/plans/2026-10-21-body-layers-earthscenes.md (committed 2026-10-21, pushed).
Branch: worktree-body-layers-earthscenes off main 3207132ca; wt `body-layers-earthscenes`; draft PR **#939**.
Dev server (this wt): http://localhost:5177. public/data linked to main.
Prior ledger: docs/superpowers/plans/completed/2026-10-20-body-layers-missions-craft.ledger.md.

## Decisions (mine, in plan)
- Søndermarken glint kept (behaviour-neutral); earthScenes owns a glint renderer like missions.
- Prep: `glintsPassOver` factory (second glint-over-roster case) = Task 1, own commit.
- CORE_MESH_BODY_IDS → EARTH_SCENE_BODY_IDS (keeps the body kind's focus claim on Søndermarken).

## Open
- Ask: prep commit rides #939 (rec) vs own PR.

## Log
- Dispatch (Sonnet, Tasks 1–3, three commits) running.
- Task 1: complete (706afd90d). Task 2: complete (53236cecf). Task 3: complete (8fc648e36). 18425 green, typecheck clean. Off-plan: sceneBodyPartition.presence tests retargeted to Phobos, 2 Søndermarken-only tests deleted (incl. non-resident MeshBody drop — reviewer to judge retarget).
- Pushed 8fc648e36. Final review (Opus) running; bg CI check running. Ask JdbT (prep packaging) open.
- Final review: no correctness defects. Fixes dispatched (Sonnet): restore MeshBody residency tests on EARTH_SCENE_BODY_IDS roster (+ mutation check), drop redundant coreSceneBodyIds test, reflows. Review fixes: complete (77eacc299; mutation check passes), pushed; CI green on 77eacc299. Smoke ask (4 checks, :5177) sent with JdbT still open. Declined nit: move EARTH_SCENE_BODY_IDS into earthScenes/bodies/ (bodies/ is leaf data; plan's core data spot stays).

- Smoke D53w: ALL 4 PASS (same as main). /feature-done READY → plan + ledger → completed/. Ask JdbT (prep packaging) still unanswered at completion.

## NEXT
Dispatch done → push → one final review (Opus) → fixes → CI → smoke (plan DoD links on :5177) → /feature-done (plan + this ledger → completed/; spec stays until body PR) → merge ask ALONE.
After: body PR (opens with P5), then seeded stars.
