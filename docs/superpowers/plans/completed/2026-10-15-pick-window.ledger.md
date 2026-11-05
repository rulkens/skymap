# SDD ledger — plan: docs/superpowers/plans/2026-10-15-pick-window.md

Branch `gpu-memory/pick-window-spec` (PR #908, draft), wt `.claude/worktrees/gpu-memory-spec`. Spec `docs/superpowers/specs/2026-10-14-pick-window-design.md`.
User rulings 2026-10-15: plan approved; Subagent-driven (lean SDD); implementation lands on #908.
Pre-flight scan: clean (T1 pickWindowNdc → T3/T4; T2/T3 signature changes have single call sites; T4 → T5 windowedSlabView).
Groups: A = T1–T3 (Opus, review on T3), B = T4–T6 (Opus, review on T4, T5). Plan BASE 21313d278.
Pre-Task-1 asks (B7QC): parallelism = this plan only, serial; perf gate = none.
Ruling: Tasks 1 and 5 keep the plan's full npm test run despite the lean "no full suite" line — T1 sweeps ~24 test literals, T5 changes pick(); one extra turn each — cost if wrong: ~2 min per task.
Group A dispatched: T1–T3, opus, BASE 21313d278, agent ae30919f745d8b006 (bg). On return: push, start dev server, ZoA shot pair (main vs branch, #focus=body-sun zoomed out), T3 mid-branch review, then Group B.
T3 mid-branch review (opus): APPROVED. Task 3: minor (deferred): io.wesl:38 "the whole canvas (0, 1)" reads ambiguously -> "centre (0, 0), half-extent (1, 1)".
Group A visual: shot pair at #pose=a,0,0,0,5.8964,0.0552,300,0&t=2026-01-01T00:00:00Z main:5177 vs branch:5176 — diff only inside the async density volume; sent to user as dash check. Dev servers: branch bnwugiqju :5176, main b7m7ns4ws :5177 (stop main one at landing).
Group B dispatched: T4–T6, opus, BASE f497cf381.
Group B agent a94f2818aa6646a05 (bg). Group A shot check sent as ask 4seb.
Group B returned: T4 8d6c3a825, T5 3b398d392, T6 42b8c7e0c (opus, 82 tool uses). Audit: no hits (milkyWay/sprites/generate.wesl:544 not a pick pipeline; starPointsPass satellite exclusion rejects w<=0 only). Full suite green at T5. Pushed. T4+T5 mid-branch review and whole-branch review dispatched in parallel (read-only).
Whole-branch review (opus): FINDINGS, 5 minor: (1) pickProgram sized()+[w,h] dead generality → allocate once, delete sized; (2) pickProgram.test scissor recorder/assertions guard nothing → delete, rename test; (3) zoneOfAvoidance/vertex.wesl:5 stale "Verbatim technique" → canvas NDC wording; (4) zoneOfAvoidanceRenderer.test.ts:95 "Review Focus 5:" not timeless; (5) audit doc link to spec breaks at /feature-done move → fix in feature-done commit. Deferred io.wesl:38 → fix now.
T4+T5 mid-branch review (opus): APPROVED, 3 minor (windowed-view test should assert vp is cropped; scissor mock dead; sized()/size param dead for pick + PickSlabTarget comment).
Ruling: delete the shared-target resize generality (allocate the 1x1 pair once; keep sized() only if the debug path still uses it) — both reviewers flag it, pick() only ever uses a 1x1 window, code is liability — cost if wrong: a later multi-pixel pick re-adds a size param.
Ruling: audit-doc link to the spec is fixed in the /feature-done commit that moves the spec — cost if wrong: none.
Fix round 1 (all minors except the doc link) sent to Group B implementer a94f2818aa6646a05.
Fix round 1 done: d00bad681 (sized() deleted, shared pair once at 1x1, scissor test plumbing gone, windowed-view test asserts cropped vp, 3 comment fixes). Targeted 179 tests green. Pushed. No re-review (lean). NEXT: CI green -> user smoke on WebGPU (wt server :5176) + parity by hand -> /feature-done (fix audit-doc spec link to completed/, archive ledger) -> merge on user word.
CI green on d00bad681 (typecheck/test/format + Workers). Awaiting user smoke.
Group A shot check (ask 4seb): user PASS — looks identical.
Smoke: user PASS on WebGPU (2026-10-16). /feature-done started: full suite+typecheck bg, deletion audit dispatched (opus, legacy framing) -> report deletion-audit-branch.md.
Deletion audit (opus, legacy): ~-10 src / -40 tests realistic. Applied safe-now 81dbee3f4 (-5 net src: PickSlabTarget width/height, duplicate comment).
Ruling: keep pickWindowNdc.test, windowedSlabView field tests, crop identity test — spec Tests section names them and the y-flip/optional-field cases can fail on real bugs no compiler check catches — cost if wrong: ~40 test LOC.
Needs user ruling (not applied): cursor clamp removal (-4 src/-22 test, changes off-edge resize picks); literal copy origin + its test (-27 test).
DoD audit: READY. Suite 17683 green, typecheck 0 errors, files match plan, no new TODOs, smoke attested by user.
Completion: plan+spec -> completed/, audit-doc spec link fixed, ledger archived to docs/superpowers/plans/completed/2026-10-15-pick-window.ledger.md. Landing (squash-merge) waits on the user.
