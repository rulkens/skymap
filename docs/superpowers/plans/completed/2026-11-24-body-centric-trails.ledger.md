# Body-centric trails: ledger

Plan: docs/superpowers/plans/2026-11-24-body-centric-trails.md
Spec: docs/superpowers/specs/2026-11-24-body-centric-trails-design.md
Branch: feat/body-centric-trails (worktree .claude/worktrees/check-2026-qq8-data), not pushed, no PR yet
Parallelism: 1 (one PR). Perf gate: SKIP (owner, 2026-11-24).
Dev server: http://localhost:5177 (this worktree). Before-shot: data/shots/trail-before-craft.jpg

Prep: f6e00887a (controller, inline) — owner eye check passed.
Dispatch A: Tasks 1-3, sonnet, 7a8dea0a0 → 8db1c8c33, done, 28 tool uses.
Task 1 redone by controller: 55d492f33 (mass as a number in the fact sheet).
Dispatch B: Tasks 4-6, sonnet, 8db1c8c33 → 0c1410451, done in two runs (23 + ? tool uses).
Dispatch C: Task 7, opus (review: yes), BASE 0c1410451 — running.

Ruling: mass lives in the fact sheet as massKg, card text derived (owner, 2026-11-24) — one value for card and reach — card digits shift (Jupiter 318 M⊕). Dash check MGth open.
Ruling: trailStaysOf scans with a conservative adaptive step (V_MAX 100 km/s) — fixed 0.25 d step took 7 s, now 12 ms for both tracks — a pass shorter than the minimum step can be missed.
Ruling: `whole` is cut at the last vertex at or before entry, no inserted vertex — the spec already accepts a ~50M km gap there — one extra chord of gap.

Next: mid-branch review of Task 7 (one round), Task 8 inline (docs/RENDERER.md), whole-branch review,
smoke shots as dash checks (spec §7), /feature-done, push + PR. Backlog line "Craft around other
planets" stays (narrowed by the QQ8 PR).

Dispatch C: Task 7, opus, 0c1410451 → 977835629, done, 26 tool uses. Task 8 inline: 0407eca43.
Deviation: Task 7's mid-branch review folded into the whole-branch review (it was the last code task).
Review: whole branch, top tier, 31 tool uses — no must-fix; fix round by controller: 7e3cbd47a.
HEAD 7e3cbd47a. Eye checks sent: dash ask (7 questions: 5 smoke shots, exhibit exit cut, adjacent slot-reset finding).
Card checks MGth: both passed.

Next: on answers → /feature-done (moves spec+plan to completed/, archive this ledger), push, PR, watch CI.
Unpushed. Merge only on the owner's "merge this PR".

Eye checks uxCf: Jupiter, Saturn, Neptune, craft weld passed. Failed: leaving Earth (no pad join), exhibit (needs a fade, stray Sun trail).
Adjacent multi-view slot finding: cannot occur (each view its own encoder + submit, pass draws once per view). No change.
Ruling iSsT (owner, 2026-11-24): fade the loose ends + cross-fade on leaving; add the launch climb to the trail.
Fix round 2 by controller (uncommitted until next line): NearTrail {piece, leaveDays}, TrailDraw weight/fadeVertex/fadeMaxMpc,
fade point in TrailUniforms (144 bytes), withLaunchAscent. Suite green (2028 files).
Finding: the climb keeps the craft within 4 km of the ground for 50 of its 63 minutes, so the trail there is hidden by the occlusion test.
Owner (mid-turn): "write the code in a subagent" — further code goes to a subagent.

f88bf0a3e: fix round 2 committed. Ask zsKa closed unanswered (superseded).
Ruling (owner, chat, 2026-11-24): only ONE trail at a time; planet frame only in the Voyager exhibit, normal mode = Sun trail only; keep the cut-end fade on the planet piece.
Dispatch D: subagent, f88bf0a3e -> 50dbc9fe8, done, 42 tool uses: missionTrails.nearPlanets setting (exhibit sets it), trailDrawsAt(trail, t, nearPlanets), cross-fade at entry and exit, TRAIL_STAY_FADE. Suite green.
Open: eye checks (normal mode, exhibit) + climb-height ruling in the dash. Plan file still describes the old rule (fix at /feature-done).
Next: on answers -> /feature-done, push, PR, watch CI. Merge only on the owner word.

Ask Czzw: normal mode, exhibit at Jupiter, swap all passed; ruling: lift the climb to orbit height early.
Dispatch E: subagent, 50dbc9fe8 -> 934cd3502, done, 30 tool uses: climb rises to 170 km in 600 s (LAUNCH_CLIMB), red-then-green test. Suite green (2029 files).
Note: in normal mode the Sun trail cannot join the pad (Earth moves 30 km/s in that frame); the pad join shows in the exhibit only. Pad check in the dash.

Ask vYUf: pad join in the exhibit passed.
/feature-done: READY. Leanness audit (opus, 37 tool uses): safe-now applied by subagent in b4a87aaf1 (12 files, +34 -81); needs-ruling: RENDERER.md bullet trim, SUN_MASS_KG inline, TRAIL_REACH_HILL_RADII move, planetFactsSeed comments.
Plan + spec moved to completed/, this ledger archived beside the plan. Next: push, PR, CI watch. Merge only on the owner's word.
