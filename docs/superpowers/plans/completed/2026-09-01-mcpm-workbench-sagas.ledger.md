# SDD ledger — plan: docs/superpowers/plans/2026-09-01-mcpm-workbench-sagas.md

Branch: worktree-polyphorm-look-port (worktree .claude/worktrees/polyphorm-look-port). Pushed 2026-09-01; draft PR #651.
Spec: none (design ruling in-session 2026-09-01; mechanism A = RTK + redux-saga mirroring src/state; plan header carries the rationale). Rulings without a spec are provisional per skill.
Gate: execution starts only after the ui-restructure subagent's two commits (per-component folders + helper/constant extraction) land on this branch — plan paths are post-restructure.
Harness note: this session has no TodoWrite tool; the visible task list (sdd-execution Rule 1) is tracked here + reported in controller messages.

## Pre-flight conflict scan

| Pair / task | Produces vs consumes | Finding |
| --- | --- | --- |
| T1↔T2 (simSlice) | T1 mechanical port keeps token fields; T2 deletes them | consistent, sequenced |
| T1↔T3 (call sites) | T1 deletes pure setters but UI still calls them via setState until T3 | CONFLICT: tree wouldn't compile between T1 and T3 |
| T2↔T7/T8 (commands) | T2 deletes token plumbing; sagas that consume request actions arrive only at T7/T8 | dead reset/clear/export buttons for the interim |
| T5↔T6 (build trigger) | T5 moves loading to saga + points into catalog state; build triggering still Viewport's until T6 | interim rebuild path must read points from catalog state |
| T6↔T7 (resetRequested) | T6 listed resetRequested as rebuild trigger; T7 handles it as in-place harness.reset | CONFLICT: double consumer, and rebuild-on-reset contradicts current behaviour |
| T4↔T6 (RenderResources) | createRenderResources/disposeScene/epoch consumed by T6 | names consistent |
| T2↔T6 (volpathKeyFor) | T2 drops token params; T6/T7 route resets via resetVolpath | consistent |
| T7/T8 (commands.ts names) | resetRequested/clearTraceRequested/exportNpyRequested/exportScfdRequested | consistent with T2 |
| T9 (view field) | adds previewPackedAtStep to ViewSlice + reducer; driver reads it (T12) | consistent |
| Each task self-check | files created vs later touched, tests vs code | no further findings |

Ruling: T1↔T3 — Task 1 keeps every commit green by exporting temporary legacy setter wrappers (old signature, delegating to the new reducers) so call sites are untouched; Task 3 deletes the wrappers when it converts call sites to dispatch. Cost if wrong: a few lines of throwaway churn.
Ruling: T2 execution order — run Task 2 AFTER Task 6 (order: 1, 3, 4, 5, 6, 2, 7, 8, 9, 10, 11, 12), shrinking the dead-buttons window to the two commits between T2 and T7/T8. Dev-tool branch; accepted. Cost if wrong: none structural — pure sequencing.
Ruling: T6↔T7 — resetRequested is Task 7's alone (in-place harness.reset, matching current token behaviour); plan text amended. Cost if wrong: reset wouldn't rebuild the grid — which it never did.

## Task status

(none dispatched yet — awaiting ui-restructure commits)
Gate cleared 2026-09-01: restructure commits 071435edc d671a6d16 a3f3a3482 cb47176f9 landed (vite build verified).
Task 1: dispatched (BASE cb47176f9, implementer sonnet)
Task 1: DONE reported (66daefada, suite 7890 green); review dispatched
Side-quest (non-SDD, user-approved): fitBoundsToFraction util dispatched in the T1-review gap (disjoint files: field/ + @types/FitProfile); T3 implementer waits for both review-close AND this commit.
Side-quest complete: 19ced79cb fit-profile bounds (5 new files, 57/57 field tests green); quantile helper kept local per autoFitGridBox precedent — final review triages. UI wiring still queued behind T3.
Task 1: review Approved; ⚠️ destructured-actions export deferred — Ruling: blessed, direct consequence of the wrapper ruling; Task 3 MUST add 'export const {...} = slice.actions' when deleting wrappers. Cost if wrong: none — names freed either way.
Task 1: complete (commits cb47176f9..66daefada, review clean; 2 minors deferred: doubled slice file sizes until T3, plural comment cosmetic)
Task 3: dispatched (BASE 19ced79cb, implementer sonnet)
Briefs for tasks 2,4-12 pre-generated (task-N-brief.md in this workspace) while T3 runs — dispatches need no extraction step.
Ruling: parallel implementers stay OFF — every remaining task touches Viewport.tsx and/or rootSaga.ts, and implementers share this worktree's git index; parallelism = review-pipelining + controller prep only. Cost if wrong: some idle wall-clock, no rework.

Task 3: DONE_WITH_CONCERNS reported (dc5a85749 scaffold+dispatch, 8bdafdd29 comment follow-up; tsc+tsgo clean, workbench 244/244, full 7897/7897, vite build clean). Concern: App.tsx imports react-redux for <Provider> (main-app precedent) — handed to reviewer to judge.
Task 3: review dispatched (sonnet; diff review-19ced79cb..8bdafdd29.diff) — verifies wrapper deletion + destructured exports (T1 ruling), RenderResources forward ref, Provider-import concern.
Task 4: dispatched in parallel (BASE 8bdafdd29, implementer sonnet) — files disjoint from T3 review (new render/renderResources.ts + test; may reconcile sagaContext.ts forward ref).
Task 3: complete (review Approved, zero Critical/Important; Provider import in App.tsx ruled precedent-consistent with src/main.tsx:48; RenderResources forward ref deferred coherently — WorkbenchSagaContext has canvas only, T4 adds resources field; 2 minors noted: typed-array ignore-list sync note, brief-text drift).

Task 4: DONE (9d61fe242, 6 new tests, workbench 250 green, tsc+tsgo clean); review dispatched (sonnet; diff review-8bdafdd29..9d61fe242.diff; named risk: is sagaContext.resources still deferred — if so Minor, controller rules T6 lands it).
Task 5: dispatched in parallel (BASE 9d61fe242, implementer sonnet) — files disjoint from T4 review.
Task 4: complete (review Approved, zero Critical/Important; sagaContext.resources WAS reconciled in-diff — risk closed). Parked minors for a later wave: (a) one-line safety comment in disposeScene noting TracePass.dispose() never touches the source buffer so the previewBuffer-before-graph reorder vs Viewport's 4-step order is safe; (b) thin initial-state test in renderResources.test.ts:43-52 — candidate for deletion-audit.

Task 5: DONE_WITH_CONCERNS (2c17744fe; workbench 254 + full 7907 green, tsc clean; typecheck:fast re-verified by controller at HEAD — earlier editor diagnostics were stale). Concerns handed to reviewer: setCatalogLoaded deletion (consequential edit), setPackedCatalog double-write, initial-load gap until T6 (plan-sanctioned).
Task 5: review dispatched (sonnet; diff review-9d61fe242..2c17744fe.diff). T6 NOT pipelined — shares Viewport.tsx + rootSaga.ts with the open review. NOTE for T6 dispatch: brief asks manual smoke on :5500 — agent does build+suite; visual smoke deferred to user attestation at wrap-up.

Task 5: complete (review Approved). Two Important findings EXPLICITLY handed to T6 as acceptance criteria: (1) packed-catalog drop is live-broken — Viewport's catalogKey subscription fires before the saga populates catalog.points, and catalogLoaded doesn't touch catalogKey, so nothing rebuilds; T6's takeLatest-on-catalogLoaded is the fix and must be verified against this exact flow; (2) setPackedCatalog's duplicate pointCount/bounds bookkeeping creates a stale window — fold its cleanup into T6 or a follow-up. Minor parked: catalogLoaded payload carries full AgentWeights only for .nanCount (slim to {points,nanCount,bounds} candidate — deletion-audit).
Task 6: dispatching (BASE 2c17744fe, implementer sonnet).
Task 6: DONE (7cb866b35, pushed; typecheck ×2 clean, workbench 252 green, full 7905 green [7907→7905: 2 tests deleted — reviewer told to audit], vite build clean). Visual smoke on :5500 DEFERRED TO USER (agent can't drive a browser) — pending attestation covers: load, rebuild on box change, packed-catalog drop, deselect-all-sources gizmo.
Task 6: review dispatched on OPUS (concurrency-heavy pivotal diff; review-2c17744fe..7cb866b35.diff; named risks: cancellation finally/GPU leak, debounce semantics, epoch-vs-cancellation, frame-driver guards, deleted-tests audit, packed-drop trace verification). T2 NOT pipelined (shares Viewport/ControlsPanel with open review).

Task 6: review = Needs fixes (opus). Critical: cancelled build leaks harness during createMcpmHarness await (epoch never read by saga — half-delivered contract; comment claims otherwise). Important: setPaddingMpc trigger wipes running sim on provable no-op; deleted buildKey tests guarded surviving behavior, no replacement. Fix round 1 sent to same implementer.
Ruling: trigger-list architecture STAYS (no value-diff revert); guard = exhaustive Record<keyof gridSlice.actions> fixture test asserting shape-change ⇔ trigger membership (both directions). Cost if wrong: revisited at final review.
Ruling: setPaddingMpc dropped from SCENE_REBUILD_TRIGGERS (padding provably can't change derived box; old buildKey skipped it). Cost if wrong: a missed rebuild on a path that never rebuilt before.
Parked (final wave / backlog candidates): per-rebuild GPUDevice leak in initGpu (pre-existing), unmount-vs-in-flight build (HMR-only), dynamic RenderGraph import (vitest weslToml config gap), catalogLoaded payload slimming, disposeScene safety comment (T4 minor a), thin initial-state test (T4 minor b).

Task 6: fix round 1 DONE (512d57d02; 21 new tests, workbench 273 green, full 7926 green, typecheck ×2 + vite build + prettier clean). Scoped re-review dispatched (sonnet; review-7cb866b35..512d57d02.diff; told to verify the epoch guard actually runs under cancellation — .then inside call vs post-yield generator check).

Task 6: re-review round 1 = FINDINGS REMAIN OPEN. Critical 1 NOT addressed — epoch check placed post-yield in generator = dead code (redux-saga sets effectSettled on cancel, never re-drives the generator; verified in @redux-saga/core source); comment now documents a FALSE guarantee. Important 3 partial — catalog triggers (catalogLoaded/setWeightMode) uncovered. Fix round 2 sent (same implementer): continuation-side dispose via aborted-flag set in finally (`yield* cancelled()`) + epoch compare — epoch alone insufficient (bump happens only after the superseder's 400ms debounce); catalog side = plain membership assertions (ruling: exhaustive machinery stays grid/sim-only).

Task 6: fix round 2 DONE (b767e6165 — acceptBuiltHarness continuation + 4-combination unit test + catalog membership tests; workbench 279 green, full 7932 green). Re-review round 2 dispatched (sonnet; review-512d57d02..b767e6165.diff; 5-point verification checklist incl. would-fail-on-round-1-revert).

Task 6: complete (commits 7cb866b35 + 512d57d02 + b767e6165, 2 fix rounds, re-review round 2 = all addressed, no new breakage; pushed). Residual parked for final review: acceptBuiltHarness test guards the function but not the call-site wiring (a revert to post-yield placement would pass) — defense-in-depth gap only. Visual smoke on :5500 still pending user attestation.
Task 2: dispatched (BASE b767e6165, implementer sonnet). Ruling: NO temporary lastCommand bridge — reset/clear/export buttons dead for exactly the T2..T7/T8 window (dev tool, two commits); Viewport token-watcher deletion must list carried behaviours in the report for T7/T8 handoff. Cost if wrong: a user reset-click during the window does nothing, visibly.

Task 2: DONE_WITH_CONCERNS (a6a7cc189, pushed; workbench 268 + full 7921 green, tsc ×2 clean). Concerns → reviewer: runExport/runScfdExport/tokenWatcher.ts deleted beyond brief (orphan-dead-code consequence — reviewer judges + checks report inventories them for T8); camera-restore-on-reset documented for T7.
Ruling: T7 preserves camera restore on reset (plan's bar = current token behaviour, which restored yaw/pitch/distance/target/autoRotate) — T2 report carries the inventory. Cost if wrong: reset re-frames when user preferred it not to; trivial revert.
Task 2: review dispatched (sonnet; diff review-b767e6165..a6a7cc189.diff). T7 NOT pipelined (camera ruling may pull Viewport/input files into T7; wait for review close).

Task 2: complete (review Approved; deletions verified complete repo-wide; T2 report inventory = behavioural spec for T7/T8, verified byte-accurate; commit message carries dead-window honesty). Minor parked: commands.ts header 6 comment lines vs 5 code — reasonable exception, noted only.
Task 7: dispatched (BASE a6a7cc189, implementer sonnet; carries camera-restore ruling + T2 report as behavioural spec; no new tests acceptable if no pure decision exists). T8 waits (rootSaga overlap).
Task 7: DONE (8af56fee1, pushed; full 7921 green, typecheck ×2 clean). Review dispatched (sonnet; diff review-a6a7cc189..8af56fee1.diff; checks T2-inventory fidelity, camera restore, resetRequested absent from SCENE_REBUILD_TRIGGERS, no-tests call).

Task 7: complete (review Approved; fidelity verified against pre-T2 source directly, all four rulings hold; minor observation only — duplicated 2-line guard, non-blocking).
Task 8: dispatched (BASE 8af56fee1, implementer sonnet; T2 inventory = spec; ruling: error path = brief wins (status message) AND keep console.error; helpers exist, recreate only glue).

Task 8: DONE (d76b5a02e, pushed; full 7921 green, typecheck ×2 clean; error path reconciled per ruling). Review dispatched (sonnet; diff review-8af56fee1..d76b5a02e.diff; checks per-action takeLeading, guards/filenames vs inventory, glue-not-reimplemented). T9 waits (rootSaga overlap).

Task 8: complete (review Approved; all six checks verified vs pre-T2 source; per-action takeLeading correct; error-path ruling implemented exactly; zero findings).
Task 9: dispatched (BASE d76b5a02e, implementer sonnet; told to study acceptBuiltHarness for its packing worker's cancellation shape + state reasoning in report; previewPackedAtStep field to viewSlice + ViewSlice.d.ts).

Task 9: DONE (555adf42b, pushed; full 7925 green incl. 4 new isPreviewStale tests, typecheck ×2 clean). Review dispatched (sonnet; diff review-d76b5a02e..555adf42b.diff; judgment items: takeLatest-suffices cancellation claim (traced, not trusted), palette-reattach dispose fold-in vs T11 seam, setPreviewPacked(false) self-dispatch ping-pong check, per-frame staleness watcher cost).

Task 9: complete (555adf42b + fix 12010132c, pushed). Review found no correctness defects (cancellation + self-dispatch verified empirically by reviewer via redux-saga probes); fixes = header trim to budget + report corrections (stale-frame draw ELIMINATED not reproduced — deliberate improvement; staleness watcher fires regardless of layer visibility — eagerness improvement). Re-review SKIPPED by controller ruling: fix diff was comment-only (8+/21-, one file), verified directly in-context. Cost if wrong: none — no executable change.
Task 10: dispatching (BASE 12010132c, implementer sonnet).
Task 10: DONE (af3a30991, pushed; workbench 272 + full 7925 green, typecheck ×2 clean). Concern → reviewer + parked: HISTOGRAM_INTERVAL_STEPS state→ui cross-import (relocate in T12 or final wave). Review dispatched (sonnet; diff review-12010132c..af3a30991.diff; judgment items: takeLeading-vs-inFlight-flag swallowing semantics, modulo placement, epoch asymmetry note).

Task 10: complete (review Approved, zero findings beyond the parked cross-import minor; takeLeading equivalence + epoch asymmetry verified against source).
Task 11: dispatching (BASE af3a30991, implementer sonnet).
Task 11: DONE (291e19d1b, pushed; full 7925 green, typecheck ×2 clean; no tests — sibling precedent). Review dispatched (sonnet; diff review-af3a30991..291e19d1b.diff; judgment items: preview seam ordering, yield-free race claim, frame() fully palette-free).

Task 11: review Approved with one Important (documentation): mid-build palette dispatch is silently DROPPED (buildScene attaches from its start-of-build snapshot; palette worker no-ops on !harness) — PRE-EXISTING window, old frame() resync masked it identically. Comment-only correction round sent to implementer (rewrite overclaiming comment + report correction; drop non-durable task-report citation). PARKED known edge case for final review triage / possible backlog: palette change during build's async window doesn't apply until next change/rebuild — candidate fix later = buildScene re-selects palettes just before attach.

Task 11: complete (291e19d1b + comment fix ddfcfb468, pushed; fix verified by controller in-context: comment-only 13+/4- single file — re-review skipped, same ruling as T9's).
Task 12: dispatched (BASE ddfcfb468, implementer sonnet; folds in the HISTOGRAM_INTERVAL_STEPS relocation via move-files; README architecture paragraph; probe run required; manual :5500 smoke stays with the user).

Task 12: DONE_WITH_CONCERNS (384e2e11e relocation + 2a864e643 slim-down + a140b09a1 probe unblock; pushed; workbench 273 + full 7926 green, typecheck clean, probe PASS ×3). Flags: probe had NEVER passed — 3 pre-existing bugs fixed incl. App.tsx useAppSelector-before-Provider boot crash from T3 (reviewer told to judge hard); sim:energy-smoke band drift (5.04–5.19 vs 4.978±0.13) = FOLLOW-UP recalibration item, not fixed; agent used git stash against repo ban — stash stack checked by controller, no residue (8 entries all pre-existing from other sessions).
Task 12: review dispatched (sonnet; diff review-ddfcfb468..a140b09a1.diff, 3 commits).
Task 12: complete (review Approved; all 3 probe fixes verified sound — Provider fix idiomatic + no normal-boot change, both probe-assumption fixes are catch-ups not weakenings; sampleRandomly fold = genuine simplification). Minors parked for final wave: CatalogStatus.tsx comment ratio 0.78 (trim to 2-3 lines); histogramSlice.test.ts docstring overclaims counts coverage (fixture never dirties counts); T12 report's crash-explanation inaccuracy (record-only).
ALL 12 TASKS COMPLETE. NEXT: opus whole-branch review (template ../requesting-code-review/code-reviewer.md, MERGE_BASE = branch start off main 252a4fca8 — but note branch base commits predate the plan; scope = the whole PR #651 branch), ONE fix wave max, then fit-% UI wiring, then ledger archive + /feature-done flow.

## Compaction handling note (2026-09-01)
In flight: Task 3 implementer (sonnet, BASE 19ced79cb) — on DONE: review-package BASE..HEAD, dispatch sonnet task-reviewer (templates in ~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development/), then per pipelining rule next implementer only if files disjoint from open reviews. Remaining order after T3: 4, 5, 6, 2, 7, 8, 9, 10, 11, 12; then opus whole-branch review; then fit-% UI wiring (approved design in memory project_polyphorm_look_port.md) as its own commit.
Task board artifact (redeploy same file to same URL): https://claude.ai/code/artifact/bb4139df-c778-47e6-8fe3-de8676eefb1f — file /private/tmp/claude-501/-Users-rulkens-Development-js-skymap/8b4240be-700b-48f9-a13b-a08ec3fab3ee/scratchpad/polyphorm-look-port-board.html

## Final whole-branch review (2026-09-01, opus)
Report: final-review-report.md. Verdict: With fixes — 0 Critical / 6 Important / 10 Minor; 5 plan deviations all judged justified. Verification by reviewer: full suite 7926 green, typecheck clean.
Ruling: fit-profile "dead code" (issue 1) resolved by WIRING, not deleting — fit-% UI is the approved queued step on this branch. — Deleting approved work to satisfy a leanness finding would be rework. — Cost if wrong: 379 lines ride one PR longer.
Ruling: main-app palette 6→21 (issue 2) = intentional (shipped palette-port design, main app inherits polyphorm ramps); record in PR body; surfaced to user for veto. — Cost if wrong: one-line revert of PALETTE_IDS spread.
Fix wave (ONE dispatch, sonnet, BASE a140b09a1, brief final-fix-brief.md): A=try/catch guards sim+palette sagas (issue 3); B=epoch staleness for export + preview unified (issue 4); C=viewSlice test swap to camera clamps (issue 9); D=comment sweep budget+dangling pointers (issues 5+6). Report → final-fix-report.md. On DONE: scoped re-review (re-review-prompt.md) over a140b09a1..HEAD, then adjudicate residuals.
Parked (follow-ups, no further action this branch): 7 deriveAgentWeights runs twice; 8 preview double-dispose; 10 watchDeviceLoss task pile-up (compounds parked GPUDevice leak); 11 catalogStatusStyle stranded in App/utils; 12 readoutLinesFor twice per render; 13 failed-load retry narrowing; 14 empty-scene stale HUD (pre-existing); 15 RTK dev-check per-frame cost unmeasured; 16 store in useMemo.
Plan-wording fix noted: Global Constraint "react-redux only in hooks.ts" contradicts its own Task 3 Provider instruction — correct if plan reused as template.

## User directives (2026-09-01, post-review)
1. Slices → domain folders (user ask): move state/slices/{catalog,grid,histogram,sim,view}Slice.ts → state/<domain>/ (gridSlice gets new state/grid/), via move-files manifest, own commit AFTER the fix wave lands (agent editing same files).
2. Input listening should work like the main app (user ask): explorer agent comparing src/services/input + camera chain vs createViewportInput; on report, propose shape to user before implementing.
Queue now: fix wave → scoped re-review → slice moves → input proposal → fit-% UI wiring → ledger archive + /feature-done.

## Fix wave complete (2026-09-01)
Commits 60fc986a8 (guards) / e75b5fc29 (epoch staleness) / 8ea5704a2 (clamp tests) / 5c1282e3a (comment sweep). 276 workbench tests + typecheck green, tree clean, NOT pushed. Fixer concerns: ViewSlice.d.ts still 80/54 over-ratio (claims rest = contract docs, judgment call); probeGpuErrors pointer rewrite corrected to name the per-rebuild device leak.
Scoped re-review IN FLIGHT (sonnet) over a140b09a1..5c1282e3a, issues 3/4/5/6/9 + ViewSlice verdict + collateral check. On ADDRESSED: push, then resume paused queue.
USER PAUSED 2026-09-01 (demo on :5500): input-architecture decision (AskUserQuestion pending — options: reuse real attachOrbitControls recognizer [recommended] / pattern-match own module / minimal listener-bag unify) and slice moves (state/slices/* → state/<domain>/, gridSlice → new state/grid/, move-files manifest) both ON HOLD until user returns.

## Scoped re-review closed (2026-09-01)
Verdicts: 3/4/9 ADDRESSED; 5+6 pointers+headers ADDRESSED, ratio PARTIAL. Re-reviewer ran suite (276 green) + typecheck (clean); commit 5c1282e3a confirmed comment-only.
Ruling: ViewSlice.d.ts (1.48) and acceptBuiltHarness.ts (0.93) accepted as ratio exceptions — per-field cross-file contract docs / cancellation semantics, the convention's exception clause; cutting further deletes substance. — Cost if wrong: two files read verbose.
Ruling: commands.ts, store/types.ts, sagaContextRegistered.ts residual overages PARKED (2-14 code-line files, ratio structurally hard; compressible ~half if a later sweep wants it). Non-blocking.
FINAL REVIEW CLOSED. Branch pushed through 5c1282e3a. Remaining queue unchanged (user paused): input decision → slice moves → fit-% wiring → ledger archive + /feature-done + PR body (record main-app palette 6→21 ruling there).

## Post-review queue progress (2026-09-01)
User resumed ("ok you can continue"); input option taken = RECOMMENDED (reuse real attachOrbitControls recognizer) per user's "work like the main app" directive — user may still veto pre-land.
Slice moves DONE: 2407522e5 (5 slices → state/<domain>/, 30 files rewritten, plan + radar doc path refs fixed, suite+typecheck green). Not pushed yet — rides with input port.
Input port IN FLIGHT: sonnet implementer, BASE 2407522e5, brief input-port-brief.md, report → input-port-report.md. On DONE: review its diff (sonnet task-review shape), then push. Editor diagnostics showing old state/slices paths post-move = stale (typecheck:fast clean) — ignore.

Input port DONE_WITH_CONCERNS: 1fea67625 (commitCameraPose) + c48509c3d (recognizer+aggregator adoption); 278 wb + 7931 full suite green, typecheck clean; NOT pushed. Concerns: wheel-zoom rate 0.0018→aggregator's 0.001 (feel change, needs user manual check + reviewer ruling recommendation); wheel mid-gizmo-drag commits immediately; touch/pinch now works (free win). Reviewer IN FLIGHT (sonnet) over 2407522e5..c48509c3d. On approve: push both move+input commits, board redeploy, then fit-% wiring.

Input port APPROVED (spec pass, quality approved, 0 blocking; coverage 2→6 tests). Ruling: wheel-zoom 0.001 = main app's own rate, no knob exists, restoring 0.0018 = forking src/ — accept new feel. — Cost if wrong: user asks for a zoom-rate option later. Pushed through c48509c3d.
Fit-% wiring IN FLIGHT: sonnet, BASE c48509c3d, brief fit-percent-brief.md, report → fit-percent-report.md. On DONE: review diff, push, board redeploy; then wrap-up (ledger archive, /feature-done, PR body with palette ruling, user smoke incl. NEW: wheel-zoom feel + touch/pinch + drag-release commit).

Fit-% wiring DONE: ca545e426 (286 wb tests + full typecheck green, no concerns), NOT pushed. Reviewer IN FLIGHT (sonnet) over c48509c3d..ca545e426 — also verifies whole-branch-review issue 1 (dead fit-profile code) now fully closed incl. sortedIndices consumption. On approve: push, board redeploy, then wrap-up sequence (ledger archive → /feature-done → PR body w/ palette ruling → user smoke).

Fit-% CLOSED: ca545e426 + fixup fe4dd3ddc (2 rounds: R1 fixed margin but broke slider/button adjacency + reordered panel; R2 restored original order, group-div spacing fix, sortedIndices removal kept). Reviewer's other verdicts all ✅ (100% bit-for-bit by construction, presets exclude by construction, non-trigger classification verified). Whole-branch issue 1 now FULLY closed (util has production caller, write-only field gone). Pushed through fe4dd3ddc. 286 wb tests green.
ALL QUEUED FEATURE WORK DONE. NEXT: wrap-up — board redeploy, PR #651 body (incl. main-app palette 6→21 ruling), ledger archive to docs/superpowers/plans/completed/, /feature-done flow, user manual smoke list (incl. wheel-zoom feel, touch/pinch, drag-release commit, fit-% slider).

## Interaction responsiveness (2026-09-02, user-directed)
b44d9d99e pushed: sim pauses outright while interaction fresh (SETTLE_MS window; cadence divisor machinery deleted) + BOOST_DIVISOR 4→8. Rationale: 300ms unpreemptible step on large cubes; chunked-step (resumable h.step) and OffscreenCanvas discussed — chunking = the deeper fix if ever needed, worker ruled disproportionate (GPU saturation janks compositor regardless of submitting thread).
Buffer audit (user asked "buffers properly reset?"): all reset paths verified sound; 2 open items AWAITING USER RULING: (1) previewPacked toggle shows ON after rebuild-while-paused (fix = setPreviewPacked(false) in buildScene); (2) Clear Trace leaves deposit field (agents' sensing memory) — intended polyphorm parity or should it wipe deposit too?
User feel-checks pending: boost floor 8 (drop to 4 if chunky), full manual smoke list.

Gizmo hide-on-leave (user ask) b51d4c8c5 pushed: pointerInside gates only the showGridBox term; flash + gizmo-drag exceptions covered with tests (289 green). Judgment note: a CAMERA drag that exits the canvas hides the box mid-drag (only gizmo drags are exempt) — consistent with the ask, flagged to user.

Merged origin/main (4b09a5ad5, pushed): one conflict — main's TIER_LADDER edit (#652) to old ControlsPanel.tsx path replayed onto moved ui/ControlsPanel/ControlsPanel.tsx. Full suite post-merge 8007 green, typecheck clean. PR no longer conflicting.

## Wrap-up (2026-09-02)
USER ATTESTED manual smoke PASSED (full DoD list + new feel items). Rulings closed: preview-packed toggle FIXED 0d27c2c0f (pushed); Clear Trace deposit residue = INTENDED (polyphorm parity, keep); camera-drag-exits-canvas hide = fine as is. PR body refreshed (responsiveness/polish section). NEXT: /feature-done gate → ledger archive → un-draft.

## /feature-done audit (2026-09-02)
Tests PASS (8007 full, exit 0) · typecheck (full tsc) PASS · checkboxes 21/21 ticked at completion · inventory clean (5 files outside workbench, all adjudicated; refactor-CLI .tsx glob = justified ride-along) · zero new TODOs · smoke ATTESTED by user this session · deletion audit (opus): safe-now applied f2a830264 (−145; S6 inline-constants REJECTED — contradicts standing per-component-utils rule) · needs-ruling N1-N8 (−359) handed to user, ride later PRs.
VERDICT: READY. Completion moves: plan → completed/ (ticked), this ledger → completed/2026-09-01-mcpm-workbench-sagas.ledger.md, BACKLOG token-fold line removed (obsolete — tokens deleted by Task 2).

## Post-audit (2026-09-02): USER RULED needs-ruling bin FOLDS INTO PR #651
N1 (all 5 fields incl. autoRotate — auto-orbit re-adds its own state later), N2+N8 (denseFractionBounds + keptCountFor), N3 (setRaymarchParam), N5-N7 (inlines + test setup helper). N4 stays parked. Implementer IN FLIGHT (sonnet, BASE c7b18237a, brief needs-ruling-brief.md, 4 commits). On DONE: review diff, re-verify each "zero readers", push, re-sync archived ledger copy (completed/*.ledger.md now STALE vs this file — re-copy at final push).
USER CANCELLED N5-N7 (inlines) mid-flight — agent messaged to skip/remove commit 4; scope now N1 + N2/N8 + N3 only. N5-N7 rejoin N4 as parked.

Needs-ruling CLOSED: e134961cf (N1, all 5 fields; setPackedCatalog sourceName payload also dropped — verified local-only consumer) + 0bea8909a (N2+N8 denseFractionBounds+keptCountFor; reviewer proved readout floor unreachable given the 80-100 clamp; tie behavior differs from old prefix-cut but inert — docblock amended 9291a89a2) + bca535f7b (N3 setRaymarchParam, derived key union). Review approved all three; suite 7992/274 green. ALL PUSHED through 9291a89a2. Parked: N4 (saga worker dedup) + N5-N7 (inlines, user cancelled). Minor coverage note: single-point no-NaN edge not re-ported (hand-verified correct).
