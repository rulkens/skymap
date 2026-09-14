# SDD ledger — plan: docs/superpowers/plans/2026-09-13-keyed-cubemap-captures.md

Spec: docs/superpowers/specs/2026-09-12-mesh-body-pbr-design.md (P1, J1, J2).
Worktree: .claude/worktrees/pbr-keyed-cubemap-captures, branch worktree-pbr-keyed-cubemap-captures, draft PR #697.
Plan committed 697f622d6. node_modules + public/data symlinked to main.
Execution: SEQUENTIAL (T2 consumes T1's table row; T3–T6 chain on renderFrame/executeFrame).
Task-list artifact: see "Artifact" line below once published; republish after every task state change.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T2 | T1 `CUBEMAP_CAPTURES.sgrAStar.nearMpc/viewSlotBase`; T2 call site passes them | consistent; forces T2 after T1 |
| T1 ↔ T3 | T1 renderFrame reads `cubemapCaptures.get('sgrAStar')` interim; T3 removes | consistent |
| T3 ↔ T4 | T3 keeps `skyCubemapFacesToCapture` fed from the context map; T4 replaces with `captureFaces` | consistent |
| T4 ↔ T5 | T4 has capture steps carry BOTH `target` and `capture` while declaring an EXCLUSIVE union | CONFLICT → Ruling R1 |
| T4 ↔ T5 | `groupKeyOf(step)` ternary assumes the exclusive union | resolved by R1 |
| T2 / T3 / T6 | frameFilePurity ALLOWED rows: T2 adds cubemapFaceContext:4; T3 moves the capture block (may strand `ALL_CUBE_FACES`/`GALACTIC_CENTRE_REGION` in renderFrame); T6 deletes renderFrame row + lowers lens pass to 3 | rows are exact → Ruling R2 |
| T5 ↔ T6 | T6 lens `cubeViewOf(CUBEMAP_CAPTURES.sgrAStar.target)`; T5 `captureFaceAttachment` resolves the same row | consistent |
| T1 self | test names vs code: both tests map to table fields | ok |
| T2 self | new test viewSlotBase 7 face 2 → 9; input bag matches call site | ok |
| T3 self | one map replaces two lists; renamed test keeps 9 assertions | ok |
| T4 self | see R1 | — |
| T5 self | attachment test: 6 distinct views ≠ viewOf('sky-cubemap') | ok |
| T6 self | lensBodySlabs tests vs expandFrameOrder merge | ok |
| Plan vs spec | plan drops `sky|probe` union, `pending/facesDone`, `ContentPass.skyCapture`, positional `cubemapFaceContext` | Ruling R3 |

Ruling R1: T4 ships an INTERIM non-exclusive render arm (`target: string; capture?: CaptureFaceRef`, `face` deleted); the exclusive two-arm union lands in T5 together with dropping `target` from capture steps. `groupKeyOf(step)` derives its base as `step.capture?.key ?? step.target` in T4 and keeps working under T5's union. — why: the plan's T4 text cannot typecheck as written — cost if wrong: one extra type edit in T5.
Ruling R2: frameFilePurity rows are exact; whichever task removes a stray lowers/deletes that file's row in the same commit (T3 may already lower renderFrame's row; T6 deletes whatever remains). Target end state per DoD: cubemapFaceContext 4, sgrAStarLensingPass 3, no renderFrame row. — cost if wrong: a ratchet failure caught by the test.
Ruling R3: the plan's deviations from the spec's ideal-shape sketch stand (spec: "prep = exactly the delta"; dead variants with one row are speculative generality). — cost if wrong: the union/async fields get added with the first probe row, where they'd be added anyway.

## Task log
Artifact: https://claude.ai/code/artifact/00ecbd3f-fb61-49a5-9c55-58bf307a82e1 (source scratchpad/p1-tasks.html, STATE object at the bottom)
Task 1: dispatched (BASE 697f622d6, implementer opus)
Ruling R4 (user ask 2026-09-14: max parallelism): after T1 lands, T2 + T4 + T6 run in parallel isolation worktrees off the T1 head (disjoint Files except small hunks in renderFrame.ts + frameFilePurity ALLOWED); controller cherry-picks onto the PR branch, resolving trivial conflicts; T3 then T5 serial on the PR branch. T6 runs BEFORE T3, so it must NOT delete renderFrame's ALL_CUBE_FACES while the capture block still uses it — it imports the data-module one instead; T3 finishes the purge. Reviews pipelined per sdd-execution.md Rule 2. — cost if wrong: cherry-pick conflict resolution time.
Task 1: DONE_WITH_CONCERNS 7856f1d26 (observations only: target stays string — no RenderTargetId union exists; field rename by hand; renderFrame consts ALL_CUBE_FACES/GALACTIC_CENTRE_REGION moved into the table + its purity row deleted already; extra fixture makeCameraSimHarness). Review dispatched; wave T2+T4+T6 dispatched in isolation worktrees off 7856f1d26.
LANDMINE: Agent isolation:worktree cuts from origin/main, NOT the session HEAD — wave agents told to git reset --hard 7856f1d26 first (T2 caught it and stopped; T4/T6 messaged pre-emptively).
Task 1: complete (commits 697f622d6..7856f1d26, review clean)
Task 1: minor (deferred): cubemapCaptures.ts 13 comment / 17 code lines — trim `// The black-hole lens's sky.` + module-load note
Task 1: minor (deferred): CubemapCaptureRuntime.d.ts ~3:1 comment:code — compress bakedSettings block
Task 1: minor (deferred, plan-mandated): `cubemapCaptures.get(..)!` ×2 (renderFrame, renderTargets) — Record runtime would be total; T3 removes one site
Task 1: minor → covered by T3 (sizeOf('sky-cubemap') → capture.target) and T6 (backlog doc names)
Task 2: isolation worktree auto-removed on first stop; implementer now commits DIRECTLY on the PR branch in the shared worktree (controller makes no tree edits meanwhile). NOTE agent-id mixup: 'Task 4' base-fix messages went to the T1 reviewer id; T4's agent (a7f0c883) got the reset instruction labelled Task 6 (same content).
INCIDENT: T6 agent's isolation worktree auto-removed on its first stop; on resume it ran my detach+switch instruction IN THE SHARED PR WORKTREE, moving it onto worktree-agent-a36ee2a5b18f2bdef-p1. T2 told to STOP. Plan: let T6 commit on its -p1 branch, switch the shared worktree back to the PR branch, cherry-pick T6, then run T2 in the shared tree, then T4 (its own worktree agent-a7f0c88360bda9e2e is intact at 7856f1d26).
Task 1 review (second pass) Important plan-mandated: ReadonlyMap runtime forces get()! where the key union promised totality. Ruling R5: switch EngineState.cubemapCaptures to Readonly<Record<CubemapCaptureKey, CubemapCaptureRuntime>> (mutable entries) in TASK 3, the only walker; T1 stands as-is. — why: no in-flight task touches the map; T3 rewrites every read — cost if wrong: a Map/Record flip is a two-line edit.
Task 4: DONE 34b18cf2d on worktree-agent-a7f0c88360bda9e2e (off 7856f1d26); concerns: interim shape (R1), executeFrame faceKey still off step.target (T5), extra files executeFrame.test.ts fixtures + RenderStepSpec comment. Review dispatched; cherry-pick pending T6 vacating the shared tree.
Task 6: DONE acafe617e on agent branch → cherry-picked as 99282fb65; Task 4 cherry-picked as 7e5dc195e (renderFrame FrameInputs hunk conflict resolved by controller: captureFaces + lensBodySlabs(state, ctx)); integration fixture fix committed by controller (lensBodySlabs.test uses captureFaces). typecheck clean, frame tests 745 green. T6 review dispatched. T2 resumed in the shared tree on the PR branch.
Task 4: complete (commits 7856f1d26..34b18cf2d on agent branch = 7e5dc195e on PR, review clean; typecheck of the integrated branch confirmed clean by controller)
Task 4: minor (deferred → T5 must fix): executeFrame faceKey keys on step.target, aliases if two captures share a target
Task 4: minor (deferred): nothing asserts renderFrame's captureFaces construction (T3 rewrites this hand-off; its renamed hand-off test should cover the map)
Task 4: minor (deferred): CaptureFaceRef.d.ts 7:6 and maxFrameInputs.ts 12:17 comment:code; timedSlotRowsOf comment "('sgrAStar', NEAR0)" tuple wording
Task 6: complete (commits 7856f1d26..acafe617e on agent branch = 99282fb65 + fixture fix 9c18b577d on PR, review clean)
Task 6: minor (deferred → T3 owns renderFrame header/docblock): renderFrame function docblock restates header + "pre-unification" history clause; header claims capture bookkeeping T3 removes
Task 6: minor (deferred): lensBodySlabs.ts 7:13 comment:code — cut the mergeAdjacent sentence (test header + expandFrameOrder carry it)
Ruling R6: ExecuteFrameArgs.skyCubemapFaceContexts → captureContexts (CaptureFaceContexts) moves from T5 to T3 (avoids a throwaway adapter between T3's map and the old per-face shape); T5 keeps the attachment/first-touch/union work. — cost if wrong: none, same end state. task-3-context.md written.

## RESUME MAP (written 2026-09-14 for compaction)
- PR branch HEAD 9c18b577d (T1 7856f1d26, T6 99282fb65, T4 7e5dc195e, fixture fix 9c18b577d). Not yet pushed since 697f622d6 — push after T2 lands.
- IN FLIGHT: Task 2 implementer, working IN THE SHARED PR WORKTREE on the PR branch, commits directly (no cherry-pick). Handling: on DONE → review-package <its BASE 9c18b577d>..HEAD, dispatch reviewer (opus, task-reviewer template, brief task-2-brief.md, report scratchpad/task-2-report.md) AND in the same breath dispatch Task 3 implementer (opus, plain agent in the shared tree; brief task-3-brief.md + task-3-context.md + implementer-common.md; report .superpowers/.../task-3-report.md). Then T5 (brief task-5-brief.md; note R1/R6: union tightening + drop target from capture steps + captureFaceAttachment + faceKey on capture key; captureContexts rename already done by T3). Then final whole-branch review (opus/fable, merge-base = 697f622d6's parent fde484b91… use `git merge-base main HEAD`), one fix wave, then gates: visual parity (user, dev server in this worktree on a free port), perf A/B, /feature-done, undraft PR #697.
- User directives this session: execute the plan; task-list artifact (republish scratchpad/p1-tasks.html via Artifact tool with the same path after every state change); max parallelism (R4).
- Cleanup owed at the end: agent worktree .claude/worktrees/agent-a7f0c88360bda9e2e + branches worktree-agent-a7f0c88360bda9e2e, worktree-agent-a36ee2a5b18f2bdef-p1, worktree-agent-a65cb62c6bc33e798 (if it exists); scratchpad task-2/4/6 report files are outside the repo.
- LANDMINE: Agent isolation:worktree = cut from origin/main + auto-deleted when the agent pauses (a resumed agent lands in the controller's worktree). For any further parallel wave: do not use isolation:worktree; serialise in the shared tree instead.
- USER DIRECTIVE 2026-09-14: 'tell me when there is a visual gate' — when T5 lands and the final review is clean, start a dev server in this worktree on a free port (never kill :5173/:5175/:5600), then tell the user explicitly it is time for the Sgr A* lens visual pass (7 DoD checks) and wait for attestation before /feature-done.
Task 2: implementer DONE 61acdcbdf (on PR branch, BASE 9c18b577d); full suite 9246 green; review dispatched (package review-9c18b577d..61acdcbdf.diff)
Task 3: dispatched (opus, plain agent, shared tree, BASE 61acdcbdf) — brief task-3-brief.md + task-3-context.md
Ruling: implementer-common.md refactor-CLI spelling corrected to `rename <file>#<symbol> <new> [--no-file-rename]` — T2 hit the wrong form — cost if wrong: none
Task 2: complete (61acdcbdf on PR branch, review clean — APPROVED, 0 blocking)
Task 2: minor (deferred → final fix wave): docs/backlog/2026-09-03-s-star-analytic-lensing.md:12 cites the old skyCubemapFaceContext.ts filename
Task 2: minor (deferred → T3 owns the renamed hand-off test): row→call wiring of nearMpc/viewSlotBase unasserted; T3's renderFrame.cubemapCaptures.test.ts should assert the keyed argument bag incl. both fields
Task 2: minor (deferred): one ragged doc line in cubemapFaceContext.ts
Task 3: implementer DONE af74ca85c (R5 record) + 30a61263e (scheduleCubemapCaptures + R6), BASE 61acdcbdf; suite 9248 green; concerns: rosterSettling hoisted once per frame (pure reads), executeFrame.test.ts + starAggregatesPass.test.ts fixtures followed, renderFrame.ts still over comment ratio (39:55, pre-existing landmines). Review dispatched (package review-61acdcbdf..30a61263e.diff)
Task 5: dispatched (opus, plain agent, shared tree, BASE 30a61263e) — brief task-5-brief.md + task-5-context.md (R1 union tightening, R6 already done, T4 faceKey minor)
Task 3: review NEEDS FIXES — 1 blocking (4 cross-file comments name renderFrame as CubemapCaptureRuntime writer: CubemapCaptureRuntime.d.ts:3, EngineState.d.ts:50, engine.ts:125, renderTargets.ts:284), 3 minor (stale fixture pointers in renderFrame.cubemapCaptures.test.ts:109-111 + renderFrame.test.ts:576-577; renderFrame header 12>10; renderFrame comment:code 39:55)
Task 3: fix round 1 — implementer resumed (comment-only: blocking + first two minors), running beside T5 in the shared tree, disjoint files, commit with explicit paths
Ruling: renderFrame.ts comment:code 39:55 overage KEEP for this plan — every surviving block is a landmine (HDR two-conjunct race, strategy fork, focus-uniform ordering) and the file shrank 93→55 code lines; trimming blind is riskier than the overage. Re-judge at the final review; backlog line only if the final reviewer independently flags it. — cost if wrong: a later comment trim.
Task 3: fix round 1 DONE aa55de2ac (writer comments → scheduleCubemapCaptures, fixture pointers, header 10 lines); scoped re-review dispatched (sonnet, package review-30a61263e..aa55de2ac.diff); pushed
Task 3: re-review round 1 — findings 1,2 ADDRESSED; finding 3 (header 11>10) NOT ADDRESSED → controller trimmed inline, commit 8fe2dd004 (header 10 lines incl. delimiters), pushed
Task 3: complete (af74ca85c + 30a61263e + aa55de2ac + 8fe2dd004, review clean after round 1 + inline trim)
Task 3: minor (ruled KEEP, see ruling above): renderFrame.ts comment:code 39:55
Task 5: implementer DONE 9c9ea1b58 (BASE 8fe2dd004); suite 9250 green; concerns: pass debug labels render-sky-cubemap → render-sgrAStar (label-only), renderedTargets has 5 foreground:0 guards not 4, extra files slabs.ts (groupKeyOf narrowing) + expandFrameOrder.test.ts (compiler-enforced assertion deleted). Review dispatched (package review-8fe2dd004..9c9ea1b58.diff); pushed
Task 5: complete (9c9ea1b58, review clean — APPROVED, 0 blocking, 5 minor)
Task 5: minor (deferred → final fix wave): executeFrame.ts:56-58 ragged mid-sentence wrap in the rewritten first-touch paragraph
Task 5: minor (deferred, inherited): executeFrame.ts header 71 lines / 191:218 comment:code — pre-existing debt, +2 net from T5
Ruling: renderGroup's `depth?: { target, loadOp }` bag stands over the brief's `depthTarget` param — the two depth facts travel together, one absence check; behaviour identical — cost if wrong: a rename.
Task 5: informational: checkFrameOrder.ts:34 resolves capture key → target id at boot (declared-row check, no GPU object) — not a second J2 site; carry to the per-body-probe task.
ALL TASKS COMPLETE. Final whole-branch review dispatched (fable, brief final-review-brief.md, range fde484b91..9c9ea1b58).
Dev server for the visual gate: this worktree, http://localhost:5177 (vite --strictPort, background task b06fj3f32, log scratchpad/dev-5177.log). Do not kill :5173.
Final review: APPROVED (fable) — 0 blocking, 9 minor; frame trace byte-identical; (hdr,NEAR0) 1 out / 3 in band; typecheck clean; 3 suite timeouts in untouched files, green in isolation. Review scratchpad/final-review.md
Final fix wave: dispatched (sonnet) — 8 comment/doc items (plan Map→Record DoD wording, s-star backlog filename, cubemapCaptures.ts trims, CubemapCaptureRuntime.d.ts field docs, CaptureFaceRef.d.ts header, lensBodySlabs.ts sentence, executeFrame.ts:56-58 + cubemapFaceContext.ts:3 rewraps). Ruled DROP: maxFrameInputs ratio, timedSlotRowsOf tuple wording, passGroupTitles derived spread, executeFrame header (no backlog line).
VISUAL GATE ATTESTED 2026-09-14 by user on http://localhost:5177: DoD checks 1,3,4,5,6,7 pass; check 2 pass with a PRE-EXISTING bug noted (cube-face edges appear when strafing in band; confirmed on the deployed build) → recorded on the existing backlog item 2026-09-03-sky-cubemap-face-seams-star-aggregates.md, commit 297c7283d. Not fixed, per user.
NEXT: fix-wave commit → scoped re-review (sonnet) → perf A/B (npm run perf --url http://localhost:5177, in-band + out-of-band Sgr A* pose vs main on :5173; expected neutral) → /feature-done (plan+spec moves, ledger archive) → undraft #697 → squash-merge on user go → cleanup agent worktrees + worktree-agent-* branches + :5177 server.
Final fix wave: DONE b35f484b1 (8 comment/doc items), pushed; scoped re-review dispatched (sonnet, package review-297c7283d..b35f484b1.diff)
Perf A/B: RUNNING (bg task bzakdfq4f, script scratchpad/perf-ab.py) — base = scratch worktree .claude/worktrees/perf-base-p1 @ fde484b91 on :5178 (bg task buvqn8fei, node_modules+public/data symlinked) vs branch :5177; scenarios galactic-centre (out of band) + sgr-a-star-lens (in band), A-B-A-B, 30 frames; outputs scratchpad/perf-{A0,B0,A1,B1}.json. CLEANUP OWED: git worktree remove --force perf-base-p1 + stop :5178.
Perf A/B: NEUTRAL (gate passes). Report scratchpad/perf-ab-report.txt. In band (sgr-a-star-lens): every MERGED slot row matches base within 0.07 ms (12 capture faces sky-cubemap·… vs sgrAStar·… and all render slots). Out of band (galactic-centre): A1 9.99 vs B0 9.93 / B1 9.21 ms; A0 12.39 was the cold first run. Harness observation, NOT a branch finding: the in-band merged "total" is bimodal on the base itself (A0 11.99 vs A1 38.76 on identical code; B 38.96) — whether bake frames fall in the sampled window; per-slot rows are the comparison. Baseline server :5178 stopped, scratch worktree perf-base-p1 removed.
Suite (audit): 9244/9250 in the loaded full run; 6 timeouts in untouched files, all 188 green in isolation; typecheck clean
Deletion audit: 18 LOC safe-now + 2 ruled DELETE (history clause, test-local ALL_FACES) + stale renderTargets.test.ts pointer → d1e12170e (−20 net); checkFrameOrder capture-target resolution ruled KEEP (startLoop checks assembled specs). Report deletion-audit-whole-branch.md
/feature-done: READY — plan → plans/completed, ledger archived; SPEC STAYS in specs/ (2026-09-12-mesh-body-pbr-design.md covers P2–P5 + the feature, only P1 shipped); no backlog straggler (face-seams + band-memory are separate open items)
