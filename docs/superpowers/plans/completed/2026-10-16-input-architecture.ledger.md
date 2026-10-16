# SDD ledger — plan: docs/superpowers/plans/2026-10-16-input-architecture.md

Branch `worktree-input-architecture`, draft PR #913. Plan commit e1158eafe. Lean protocol (sdd-execution.md).
Parallelism: this plan only. Perf gate: none (per-frame cost is one small conversion; user ok'd 2026-10-16).
Groups: A {1,2} Sonnet · B {3} Opus · C {4} Opus · D {5,6} Opus. Mid-branch reviews for 3, 4, 5, 6 (review: yes).
Pre-flight scan: no conflicts found.

Dispatch A (Tasks 1,2) Sonnet, BASE e1158eafe, running
Task 1: complete (e1158eafe..2286ace59, Sonnet). Deviations: RecognizerState +pinchSpanPx/pinchBroken; tap needs release strictly inside slop; double-tap window inclusive; pinch ratio test toBeCloseTo.
Task 2: complete (2286ace59..77558086a, Sonnet)
Dispatch B (Task 3) Opus, BASE 77558086a, running
Ruling: Task 3 heading says 'camera and selection answers' but the body specifies no selection change — no selectionSlice edit; hover clears via the pick.hover at:null request — cost if wrong: hover card lingers during a drag until the Task 5 driver answers it (it does).
Task 3: implemented (77558086a..09e4afec2, Opus); mid-branch review dispatched (Opus)
Dispatch C (Task 4) Opus, BASE 09e4afec2, running
Task 3: review (Opus): 1 Important (merge key ignored aspect), 2 Minor. Fixed inline by controller (<50 lines, lean): aspect in merge key, test pins it with the same intent; wake-saga header trimmed. Task 3: complete.
Task 4: implemented (09e4afec2..46f69ab82 — note 3 fix commit sits inside, 125 tool uses, Opus); golden traces pass unedited.
Ruling: keep the 2^-16 px snap in unitToViewPx — no double u gives u·100 === 55, the residue flipped a near-zero golden basis value at the 9th digit; the snap is invisible (far below pointer resolution) and keeps the golden unedited — cost if wrong: 3 lines of production code exist for a test's sake.
Ruling: inputConsumed filtered from the golden-trace and runFrame.test action recorders — it is frame bookkeeping, not camera output — cost if wrong: a stray inputConsumed regression goes unrecorded (the reducer test pins it).
Ruling: the aggregator moved to tools/utils/input/createInputAggregator.ts (mcpm-workbench + scene-workbench use it); Task 6 likewise MOVES orbitControls/OrbitControlsOptions/InputGestureEvent under tools/ instead of deleting them, and a backlog line records porting the workbenches to the new path — cost if wrong: the legacy recognizer lives on in two dev tools.
Ruling: harness gets notch() (wheel without frames), no pinch() (no call site) — cost if wrong: none.
Task 1: defect found later: recognize.ts declares inline types `Step` and `PointerEv` (fails tests/conventions/noInlineTypes) — fixed in dispatch D.
Task 4: review dispatched (Opus). Dispatch D (Tasks 5,6) Opus, BASE 46f69ab82, running.
Task 4: review (Opus) APPROVE; all four rulings agreed. Task 4: complete (09e4afec2..46f69ab82).
Task 4: minor (deferred): stepCameraRuntime.test.ts:758-770 comment claims "the follow capture" — now runs under orbitDrag (dragging=true); confirm or reword.
Task 4: minor (deferred): unitToViewPx.ts:4-11 comment over budget; PX_GRID holds 2^16 while the comment says 2^-16 px — cut to one line, rename GRID_STEPS_PER_PX.
Task 4: minor (deferred): InputStep.d.ts:2,6 doc still names inputAggregator — repoint to pendingToInputSteps (comment only).
Task 4: minor (deferred): docs/backlog/2026-09-09-camera-smooth-zoom-and-flick-coast.md:23 points at deleted inputAggregator.ts — repoint to the input slice.
Task 4: minor (deferred): harness call sites dispatch beginDrag() before press() — redundant now (driverGoldenTrace :851/:882, poseFold :1040, runFrame.test, settleGoldenTrace, tilt*); drop after Task 6 (golden must stay green).
Task 5: implemented (46f69ab82..49c4c2b0c, Opus; recognize.ts inline types fixed here). Task 6: implemented (49c4c2b0c..cb5a0fb47, Opus; 127 tool uses for D). Deviations: AttachEngineInputsOptions keeps only scheduler; DragMode backlog bullet repointed to tools file; website docs-data links repointed; oneMpcSeam anchor changed; channel drops window pointermoves from pointers not pressed on the canvas; CssPx deleted.
Ruling: Tasks 5–6 mid-branch review folded into the final whole-branch review — a separate review would read the same diff minutes earlier — cost if wrong: none beyond one larger review.
Pushed cb5a0fb47; CI watch running (bg). Final review dispatched (Opus) on review-e1158eafe..cb5a0fb47.diff. Next: ONE fix round via the group-D implementer (findings + deferred minors), then CI, then report.
Task 3: minor (deferred): no camera-slice test that a held:false inputMoved leaves tween/dragging — Ruling: skipped — the camera slice has no inputMoved case, so the test would restate an absence; the at-rest lane is pinned by the saga test (held false at rest), pendingToInputSteps (duringGesture false) and inputSlice (non-owner notch kept) [rationale corrected per final review: no frame-level wheel-during-fly test exists] — cost if wrong: one regression unpinned at slice level.
Final review (Opus): MERGE-READY, 0 Critical/Important, 6 Minor + triage (4 deferred minors fix now, stepCameraRuntime comment leave). One fix round sent to the group-D implementer (resumed): beginDrag deleted, tourBodySaga comments, recognize history clause, InputBindings/AttachEngineInputsOptions deleted, pick driver live guard + test, canvas channel jsdom tests, unitToViewPx comment/rename, InputStep comment, backlog repoint.
CI cb5a0fb47: FAIL 1 test — website facts cite deleted clickHandler.ts; also stderr 'requestRender' undefined (maybe watchInputWakeSaga without reconcile ctx). Both added to the running fix round.
Fix round: 6c3cf7835 (all 11 items; item 11 pre-existing watchWakeSaga noise, also on e1158eaf). Pushed; CI watch running.
CI 6c3cf7835: GREEN (typecheck/test/format + Workers). Awaiting user smoke (deep links given, data linked).
Deletion audit (Opus, greenfield): little to remove; safe-now applied 8812f35bb (src -4, tests -26). User rulings 2026-10-16: Q1 keep the resize wake, rename to attachResizeWake/resizeWake; Q2 KEEP wheel mods; Q3 DELETE PickRequest.source. Q1+Q3 dispatched (Sonnet).
Landing: deletion trims 8812f35bb + rulings 933e12fd4. DoD audit READY (CI green 6c3cf7835, user smoke attested, no new TODOs, file inventory explained). Diff vs main: src+tools +1032/-784, tests +1323/-683, docs+website +1237/-17. Plan+spec moved to completed/; ledger archived. Merge awaits the user's word.
