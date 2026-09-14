# SDD ledger — plan: docs/superpowers/plans/2026-09-10-layer-composition-02-boot-decoupling.md

Branch: worktree-layer-boot-decoupling (off main 79f1f8063). Plan commit 58ddd7cd1. Spec: docs/superpowers/specs/2026-09-09-layer-composition-design.md §9(b).
Task list: harness has no todo tool in this session; this ledger IS the task list (Rule 1 noted).
Parallelism: tasks strictly sequential (T1→T2→T3→T4→T5→T6 by data dependency), so single serial lane; no parallel-worktree execution.

## Pre-flight conflict scan

| Pair / task | Produces vs consumes | Finding |
| --- | --- | --- |
| T1 → T2 | `EngineHomeConfig`, `HomeFocusTarget`, `followedBodyHome`, narrowed `EARTH_REF` → `EARTH_HOME` | names/signatures consistent (pose(boot)→InitialCam, focus: HomeFocusTarget\|null, seedSelection thunk) |
| T2 → T3 | `BootstrapDeps.home` required; wireInput.test fixture uses real `EARTH_HOME` | consistent; T3 asserts against EARTH_HOME |
| T3 ↔ T4a | both edit wireInput.ts + wireInput.test.ts | sequenced T3 then T4 (plan states it); no pipelining T4 while T3 review open |
| T4b | `wireImpostorSubsystems` signature gains `disks` param; deletes both throws | consistent with ruling 1; test deletion `throws when … null` is a compile-time-fact test → allowed by testing.md |
| T4c | startLoop guard subject → `deps.phaseLocals`; consumes `:76` `!` | self-consistent |
| T1 self | test `followedBodyHome throws for static anchor 'sun'` presumes `sun` ∉ ORBITAL_ELEMENTS | plan-time verified by author; implementer re-checks |
| T5 | CLAUDE.md tree line only | no conflict |
| Global | "no test restates a type fact" vs T1 rule "no followsSimClock===true test" | consistent |

Scan clean; no rulings needed before T1.

## Progress
- Draft PR #675 opened at 58ddd7cd1.
- Task 1 dispatched (sonnet; BASE 58ddd7cd1). Brief task-1-brief.md.
- Task 1 implementer DONE: 698efe7c5 (full suite 8190 pass, typecheck clean). Implementer concern: comment ratio slightly over on the two tiny helper files — reviewer to judge.
- SESSION HALTED by user 2026-09-10 (account switch to claude_ludens). RESUME HERE: dispatch Task 1 reviewer (BASE 58ddd7cd1, HEAD 698efe7c5; review-package not yet generated), then Task 2 (brief task-2-brief.md already extracted). No fix loops open.
- RESUMED 2026-09-10 (ludens account). Review package review-58ddd7cd1..698efe7c5.diff generated. Global constraints extracted to global-constraints.md for reviewers.
- Task 1 reviewer dispatched (sonnet) ∥ Task 2 implementer dispatched (sonnet; BASE 698efe7c5) — Rule 2 pipelining, file sets disjoint.
- Task 1 review (sonnet): spec ✅; 1 Important — EngineHomeConfig.d.ts module header echoes the `pose` field comment (delete/cut header). Fix round 1 QUEUED behind in-flight T2 implementer (freeze rule; original T1 implementer from prior session, fresh fixer to be dispatched with brief+report).
- Task 1: minor (deferred): comment/code ratio over budget in EngineHomeConfig.d.ts (1.5×), HomeFocusTarget.d.ts (2.0×), bodyFollowsSimClock.ts (1.25×), bodyMovesThisFrame.ts (1.0×), followedBodyHome.test.ts (0.82×) — largely brief-mandated field docs; no in-header over-budget note.
- Task 2 implementer DONE: 9190dc028 (suite 8190 pass, tsc clean). Concern: wireImpostorSubsystems.test.ts fixture also needed `home` (not in brief's list of 6) — brief drift, fixed in-task.
- Task 2 reviewer dispatched (sonnet; BASE 698efe7c5, HEAD 9190dc028) ∥ Task 1 fix round 1 dispatched (fresh fixer, haiku; FIX_BASE 9190dc028).
- Task 1 fix round 1 fixer DONE: 994d1b44e (header trimmed). Scoped re-review dispatched (haiku; FIX_BASE 9190dc028, HEAD 994d1b44e).
- Task 1: fix round 1/5 (1 addressed, 0 open — header echo removed; commits 9190dc028..994d1b44e)
- Task 1: complete (commits 58ddd7cd1..698efe7c5 + fix 994d1b44e, review clean)
- Task 2 review (sonnet): spec ✅, quality Approved. Reviewer note: wireImpostorSubsystems.test.ts fixture was a brief oversight, not drift (file untouched since pre-branch).
- Task 2: minor (deferred): identical ~13-line stub `home` literal duplicated across 8 test fixtures (wireSlots, startLoop, initGpu.hdrCapabilityWiring, installLoadProgress, engineSliceDispatches ×2, wireImpostorSubsystems, registerReconcile) — brief mandated "minimal inline literal"; a shared test-only helper would cut ~90 lines. earthHome.ts comment ratio borderline (36–55% depending on delimiter counting).
- Task 2: complete (commits 698efe7c5..9190dc028, review clean)
- Task 3 implementer dispatched (sonnet; BASE 994d1b44e). Brief task-3-brief.md.
- Task 3 implementer DONE: 621a3c7d2 (wireInput 9 pass incl. 2 new; suite 8192 pass; tsc clean). Note: Earth still named inside the kept comment ranges — reviewer to judge against reject-if.
- Task 3 reviewer dispatched (sonnet; BASE 994d1b44e, HEAD 621a3c7d2). Task 4 NOT pipelined (shares wireInput.ts + test with T3; plan sequences it after T3 review).
- Task 3 review (sonnet): spec ✅, Approved. Ruling (reviewer + controller agree): "wireInput.ts no longer names Earth" reject-if reads as no Earth-specific configuration; Earth as an example inside the brief-mandated kept comment ranges is fine.
- Task 3: minor (deferred): wireInput.ts "Camera auto-framing" comment says pose is a function "of the boot sim instant" only — omits frameBasis (pre-existing wording).
- Task 3: complete (commits 994d1b44e..621a3c7d2, review clean)
- Task 4 implementer dispatched (sonnet; BASE 621a3c7d2). Brief task-4-brief.md + plan-rulings.md (rulings 1–2).
- Task 4 implementer DONE: ae2b2b015 (4a) fbbd09b1d (4b) 7def3f8c7 (4c); suite 8193 pass (+1 net: +2 −1, as planned), tsc clean.
- Task 4 reviewer dispatched (sonnet; BASE 621a3c7d2, HEAD 7def3f8c7) ∥ Task 5 implementer dispatched (haiku; BASE 7def3f8c7; CLAUDE.md only, disjoint).
- Task 5 implementer DONE: 116fb94bf (CLAUDE.md +1 line). rg hit: `wireSlots` in docs/superpowers/conventions/simplicity.md:337 (ADR 0005 entanglement entry). Ruling: leave it — the identifier is still correct (wireSlots exists, unchanged name), and the brief permits fixing identifier text only; the plan's "empty" expectation was stale, not the doc — cost if wrong: none (docs).
- Task 5 reviewer dispatched (haiku; BASE 7def3f8c7, HEAD 116fb94bf).
- Task 5 review (haiku): spec ✅, Approved. minor (deferred): CLAUDE.md compositions/ line uses an em-dash where neighbours use colon/parens — fold into the final fix wave if one happens.
- Task 5: complete (commits 7def3f8c7..116fb94bf, review clean)
- Task 6 pre-checks by controller: DoD greps empty (phases: EARTH_REF|isCinemaMode|computeInitialCamera; `Renderer === null`); ORBITAL_ELEMENTS.some only in bodyFollowsSimClock.ts; phases/ numstat net −44 (startLoop 5/21, wireInput 8/31, wireSlots 7/12; wiring 14/19); file set within plan allowlist (+ CLAUDE.md, plan md, BootstrapDeps.d.ts).
- Task 4 review (sonnet): spec ✅ on all items; 1 Important (plan-mandated budget): wireImpostorSubsystems.ts module header 16 lines > 10 cap. ⚠️ resolved by controller: (1) wireInput on initGpu skip still fails loudly via `deps.phaseLocals!.device` at wireInput.ts:73 (TypeError), same surviving guard shape ruling 1 accepted for wireSlots; (2) startLoop.test.ts has no remaining reader of the dropped renderer fields (rg empty).
- Task 4: minor (deferred): wireImpostorSubsystems.test.ts:453-455 comment narrates change ("no longer asserts"); wireInput.test.ts:365-366 "worst of the three" presumes sibling context.
- Task 4 fix round 1 dispatched: resumed original implementer with the Important finding (FIX_BASE 116fb94bf — HEAD now includes T5's docs commit; fix diff will be scoped to the range).
- Task 4 fix round 1 fixer DONE: 5fb7699ff (header 16→10). Scoped re-review dispatched (haiku; FIX_BASE 116fb94bf, HEAD 5fb7699ff).
- Task 4: fix round 1/5 (1 addressed, 0 open — header 16→10; commits 116fb94bf..5fb7699ff)
- Task 4: complete (commits 621a3c7d2..7def3f8c7 + fix 5fb7699ff, review clean)
- Task 6 (gate) running in background at HEAD 5fb7699ff: typecheck, npm test, build → scratchpad gate-*.log. Visual smoke = user.
- Final whole-branch review dispatched (fable; MERGE_BASE 79f1f8063, HEAD 5fb7699ff) with the deferred-minor list.
- Task 6 gate (mechanical) at 5fb7699ff: tsc both projects clean; npm test 1217 files / 8193 tests pass (delta +4 vs pre-T1 8189 — matches plan); npm run build green. Visual smoke (3 poses) pending user.
- FINAL REVIEW (fable, 79f1f8063..5fb7699ff): 0 Critical, 0 Important in code; verdict "With fixes" = 6 one-line comment edits (BootstrapDeps.d.ts:19 task-number ref; EngineHomeConfig.d.ts:6-7 history narration; HomeFocusTarget.d.ts:5 SCENE_BODIES→ORBITAL_ELEMENTS; wireImpostorSubsystems.test.ts:15-17 + wireInput.test.ts:~366 narration; CLAUDE.md:15 em-dash) + user visual smoke. Deferred triage: T2 stub×8 → (c); rest stays. Adjacent pre-existing (NOT in wave, offer to user): wireInput.ts:54-57 docblock lists "status-ready + settings seed" that don't happen there.
- Final fix wave dispatched (haiku, comment-only; FIX_BASE 5fb7699ff).
- Final fix wave DONE: 15b7c4447 (6 files, −12/+6, comment-only). Scoped re-review dispatched (haiku; 5fb7699ff..15b7c4447).
- Final fix wave re-review: 6/6 ADDRESSED, no breakage. Branch review-clean at 15b7c4447. Pushing; PR body ticked 1–5, 6 mechanical; visual smoke = user; /feature-done + ledger archive (Rule 3) after smoke attestation. Workspace KEPT (ledger not yet archived).
- /feature-done audit at 15b7c4447: tests 8193 PASS, tsc PASS, no new TODOs, files within plan, backlog nothing to sweep (boot-ordering item explicitly not consumed), smoke attested by user ("pr looks good"). HALTED by user before verdict.
- USER RULINGS 2026-09-10: (1) EngineHomeConfig must be pure data (no function fields) — pose recipe back to the phase as bodyHomePose, cinema gate back to wireInput; (2) no src/compositions/ folder yet — EARTH_HOME → src/data/selection/earthHome.ts, CLAUDE.md line dropped; folder arrives with (c)'s app.ts. Plan amended: Task 7 (commit 95a328e38).
- Deletion audit (opus, 79f1f8063..15b7c4447) → deletion-audit-79f1f8063..15b7c4447.md: C1 wireImpostorSubsystems takes BootstrapDeps for one field (pass device; −33 LOC incl. test makeDeps + one home stub); C2 wireInput.test cameraFraming mock reaches through EARTH_HOME (MOOT after T7 — wireInput imports it again); C3 disks.proceduralDiskRenderer never read (fenced by ruling 1; new evidence: unread param); C4 followsSimClock write-only (structural type; fenced — needs user ruling); C5 followedBodyHome happy-path test redundant with EARTH_HOME module-load (plan-mandated); C6 three stale comments (wireInput.ts:6-8 cites cameraFraming — MOOT after T7; startLoop.test.ts:60-66 clouds/catalogs + timingService; wireInput.test.ts:4-7 header). Controller ruling: safe-now bin = C1 + C3 + C6(startLoop.test, wireInput.test header) as one deletion commit AFTER Task 7 review; C4/C5 = keep (contract landmine field; 4-LOC plan-mandated test) unless user overrules.
- Task 7 implementer dispatched (sonnet; BASE 95a328e38). Brief task-7-brief.md.
- Task 7 implementer DONE_WITH_CONCERNS: d0c5577a0 (rename) a3d3ba056 (move) 321d981c6 (content); suite 8195 pass (+2: neutral-pose + requested-body tests), tsc clean. Concern = stale DoD lines → fixed by controller in 769e250f0. Task 7 reviewer dispatched (sonnet; BASE 95a328e38, HEAD 321d981c6). Deletion commit (C1/C3/C6) queued behind it (shares wireImpostorSubsystems.test.ts).
- Task 7 review (sonnet): spec ✅, Approved. minor (deferred): cameraFraming.computeInitialCamera repeats the fovYRad/near/far envelope in both return branches — fold into the deletion commit.
- Task 7: complete (commits 95a328e38..321d981c6, review clean)
- Deletion commit dispatched (haiku; BASE 769e250f0): C1 (wireImpostorSubsystems takes device, drop test makeDeps), C6.2 (startLoop.test docblock), T7 minor (envelope fold). C3 + C4 → user ruling. C6.1/C6.3 moot after T7.
- Deletion commit DONE: bb828e95a (−31 LOC: src +8/−15, tests −16). Scoped re-review dispatched (haiku; 769e250f0..bb828e95a). Gate rerun (tsc/test/build) in background at bb828e95a → scratchpad fd2-*.log.
- Deletion commit re-review: clean. Branch review-clean at bb828e95a; awaiting gate rerun.
- USER: smoke test PASS at 8bf228a46 (post-Task 7). All DoD items closed.
- USER RULING: delete deletion-audit C3 (`disks.proceduralDiskRenderer` param, never read) and C4 (`HomeFocusTarget.followsSimClock`, write-only) before merge. HomeFocusTarget stays a `{ ref }` wrapper; wireSlots two-renderer gate untouched.
- Deletion commit 2: 8339f9b27 (−9 LOC; report `deletion-commit-2-report.md`). Gate at 8339f9b27: tsc clean, 1217 files / 8195 tests, build green. Scoped re-review package `review-8bf228a46..8339f9b27.diff`.
- Re-review of 8339f9b27: APPROVED (haiku, 4 checks). Merge-ready.
