# SDD ledger — 2026-11-10 milky-way v2 field in layer

Plan: docs/superpowers/plans/2026-11-10-milky-way-v2-field-in-layer.md
Spec: docs/superpowers/specs/2026-11-10-milky-way-v2-field-in-layer-design.md
Branch: worktree-land-v2-milky-way, stacked on PR 0 #1099 (move-v2-field-into-milkyway-layer @ 644532527)
Parallelism: one plan, PR A then PR B, serial (asked in dash). Perf gate: PR B only, per spec §8.

Dispatch groups (PR A): D1 = A1–A4 (Sonnet) · D2 = A5 (Opus, review) · D3 = A6 (Opus, review) · D4 = A7–A10 (Opus, A9 review) · A11 controller.

Task A0: complete (dbda63e6c) — controller inline
Landing: PR 0 #1099 squash-merged 1a42ad56a (user "merge 1099 when green"). Remote branch delete DENIED by auto-mode classifier — user to delete `move-v2-field-into-milkyway-layer` + isolation wt agent-a57995b58788c792d. After D1: merge origin/main into this branch (same content, clean).
Ruling: rename the ISM chain's GPU `.dispatch()` in PR A and delete #1099's GPU_DISPATCH_FILES exemption — no allow-list on a ratchet — cost if wrong: a few renamed call sites. (Add plan task after D1 finishes editing the plan.)
Ruling: investigate + fix `pcToUnits` (1.6667 vs 1.75 kpc/unit) in PR B — 'both' compares v1/v2, a 5% scale gap defeats it — cost if wrong: a scale change in the tool's look. (Add plan task.)
Ruling: perf gate = PR B only, v1 before/after.
Dispatch D1 (A1–A4): Sonnet, 159 tool uses, BASE 644532527→HEAD 78236f15b, complete. Deviations: refactor-extract "node removed or forgotten" bug worked around (void-import hack); armCurvePos folded back; arms/utils 12 files.
Rebase: squash-merged #1099 made a merge of main conflict add/add on ~80 files; aborted, `git rebase --onto origin/main 644532527` (controller; unpushed) — clean. typecheck + conventions green.
Task A0: 9a5646ee3 · A1: 1aa118c51 · A2: f96c46cbe · A3: 82c366674 · A4: 48a65b4cc (post-rebase shas)
Task A-rename (ruling): complete (24f860908) — controller inline; exemption deleted.
Dispatch D2 (A5): Opus, 63 tool uses, 9a68357ca→b563600b8, complete. Tool build + naga + real-Metal probe clean; field renders (scratchpad a5-tool.png). Deviation: oblique pose in ray test.
Task A5: complete (b563600b8). Review A5 (Opus) dispatched in parallel with D3 (A6, Opus).
Review A5: no correctness findings (layout, maths, asymmetric frusta, shift sign all verified). Fix round queued after D3: probeGpuErrors.ts:1367,1731 `params.w`→`eye.w`; move the frustum warning off buildFieldHeaderInputs.ts:66-68 (inline `exposure`); rejoin bubblePresent/vertex.wesl:31-32. Residual: no test runs the WGSL frustum fns — gate is the rendered tool (a5-tool.png + A11 pair).
Dispatch D3 (A6): Opus, 51 tool uses, b563600b8→e30807cd5, complete; probe PASS. Deviations: dropped 2 `populated` test asserts; tool targets → one id map, `fieldTargets` getter.
Task A6: complete (e30807cd5). A5 nit fix round: 01eb1ae7c (controller inline).
Review A6 (Opus) dispatched in parallel with D4 (A7–A10, Opus).
Review A6: GPU logic correct, 4 low. Fix round queued after D4 (it touches the same files): timingSlots.ts:19-20 stale gate comment; createFieldPipelines.ts:199-203 stale gate/target names; encodeDustMapPass.ts over comment budget (cut :30-33 to the Chrome zero-instance note); createGalaxyRenderTargets.ts new inline union ×3 + row shape → named types in tools/galaxy-renderer/@types/. OPEN (adjacent, ask owner): pre-existing inline types in createGalaxyRenderTargets.ts / createFieldPipelines.ts (allow-listed in inlineTypeFiles).
Dispatch D4 (A7–A10): Opus, 163 tool uses, 01eb1ae7c→8f0f0d46d, complete; probe PASS after A9 and A10.
Task A7: 41a2ccfdc · A8: 07efaa001 · A9: 044ba3740 · A10: 8f0f0d46d. Deviations: GalaxyIsmMapOrientation → field/ismMap/@types (ratchet); deriveFieldFrameLanes takes a Pick; tool setTuning once/frame, setters store only; encode throws before first setTuning; stale-plan HII id draws empty (clear).
Review A9 (Opus) + A11 shots (Sonnet, exported BASE/HEAD copies) dispatched in parallel. A6 fix round waits on ask 44Tp (old inline types).
Review A9: one-plan contract holds, tool order + composites unchanged. MEDIUM: encode throws before first setTuning → initial tuning becomes a factory arg. LOW: probes need field on; stale docs. NIT: fieldHostRender views Pick.
A11 shots (BASE 14cff2b5d vs HEAD 8f0f0d46d, 1280×800): in-disc 39 px max Δ1 (≈ identical, expected). Outside: noise floor max Δ10, but ONE deterministic diff — a ~3×3 px point at (423,393) present on BASE, absent on HEAD (Δ53; 9 px >12). crop_hot.png. Bisect agent dispatched.
Fix round (A6 low + A9) dispatched (Sonnet), parallel with the bisect (exported copies only).
Fix round: A6 review fixes 512d051b3 · A9 review fixes e53900143 (Sonnet), probe PASS. Deviation: tool builds host from boot preset (describeGalaxy(DEFAULT_GALAXY_PARAMS)) as initialTuning; host holds it but applies nothing to the renderer until first setTuning — check in final review whether "held but not applied" is a new asymmetry.
Bisect: the point is an hii:shells shell (~0.4 px, 31 kpc away); first bad = A5 b563600b8. Cause: gaussianRayCoeffs q = c − b²/a cancels in f32 (c≈4e8, q≈10); 1-ULP ray change flips the SPLAT_CUT test (shadeCommon.wesl:76). Benign for PR A; latent bug (far compact shells randomly visible; worse at app distances). Proposed fix: q from o' = o − d·dot(o,d). Asked owner (ask DfoV) with the A11 checks + old inline types.
Final whole-branch review of PR A (Opus) dispatched on 14cff2b5d...e53900143.
Final review PR A: must-fix 4 (held-not-applied initial tuning; dead HiiTierSpec.label; findHiiSegment doc; stale split pointers), nice 9.
Ruling: the host starts untuned (tuning | null, empty plan while null) — reverses my fix-round initialTuning arg — one value gates encode + composites, no fabricated placeholder — cost if wrong: one null branch.
Ruling: adopt nice items (values travel once through the frame; targetSizes/TargetDivisors keyed by FieldTargetId; delete restating exposure test; TAU_ROOT3 dedupe; tool FrameView → ToolFrameView; doc sweep; README host/; small items). Accepted as is: tool's debug dust-view composite double-check.
Final fix round (Opus) dispatched.
Final fix round (Opus, 145 tool uses): b1e2bb6f5 untuned host · 2d8a053a3 label · 139ca8e82 doc · d9112f541 pointers+README · 1eef23a88 values once · ab6d89f08 FieldTargetId keys (+ HII_TIERS/HiiTierSpec deleted) · e4820eee2 cleanups. Kept tool `hostTuning !== null` gate (covers dust-view + overlays).
Landing: PR A pushed, draft #1100 opened; CI watched. CI #1 failed: website roadmap row 'milky-way-model' named the retired backlog line → f71abfafb (row rests on the spec, state in progress, built = createGalaxyFieldRenderer.ts). CI #2 GREEN on f71abfafb. Waiting on ask DfoV (A11 verdict, HII-cut fix placement, old inline types) + merge word.
Task A11: complete — owner verdict 2026-11-10: in-disc MATCHES, outside ACCEPTED (one sub-pixel shell = f32 cut noise).
Ruling (owner): HII cut-noise fix (gaussianRayCoeffs q from o' = o − d·dot(o,d)) = own commit at the START of PR B → plan task B0.
Ruling (owner): old inline types in createGalaxyRenderTargets.ts / createFieldPipelines.ts move in PR A — Sonnet dispatched.
c03c08f48: TargetDivisors + GalaxyRenderTargets → tool @types (field/@types cap blocked the rest). 7a015bc3e: plan B0 task.
Ruling (controller): pipeline factories → new sub-module field/pipelines/ (render/ + @types/), keeps field/@types ≤ 15 and frees field/render for PR B. d4953dc04 (Sonnet). NOTE: d4953dc04 carries a Co-Authored-By trailer (agent followed the harness reminder) — at squash-merge pass an explicit --body so it doesn't reach main; no force-push.
Landing: PR A #1100 squash-merged 88146625d (owner "Merge it"), explicit message — no Co-Authored-By on main. Remote branch worktree-land-v2-milky-way left (deletion is the owner's).
PR B: branch milky-way-v2-in-layer off origin/main 88146625d in this worktree.
Dispatch groups (PR B): E1 = B0 (Opus, review) · E2 = B1–B2 (Opus, B1 review) · E3 = B3+B3b (Opus, review) · E4 = B4–B8 (Opus, one review over B5/B6/B8) · E5 = B9–B10 (Sonnet) · B11 controller.
Dispatch E1 (B0): Opus, complete, 88146625d→7a7a94d98. q f64 16.193 / old f32 32 / new 16.189; sheared M 7.427/−16/7.425. Re-shoot stable; only HII shells change (3 sub-pixel shells; base1's dot was itself a false draw). Test = f32 TS transcription vs f64 (can't catch WGSL revert) — reviewer to rule keep/delete.
Task B0: complete (7a7a94d98). Review B0 (Opus) ∥ E2 (B1–B2, Opus).
Review B0: algebra exact for any symmetric M and any d; callers unchanged; f32 probe new ≤0.01 err vs old up to 1028. Fix (controller inline, uncommitted until E2 lands): oNear = o − d·(b/a), q = form(oNear,oNear) (drops bNear + unit-d contract); comment states the landmine not the incident; DELETE gaussianIntegral.test.ts (TS transcription only; wesl-shaders skill: probe numbers in the PR, not a unit test). Tool build links.
B0 review fix: 6d7721147 (controller inline), probe PASS.
Dispatch E2 (B1–B2): Opus, 71 tool uses, complete. B1 22c440753 · B2 2ad018e47. Deviations: selector in selectors.ts (ratchet); docsReference pattern widened; field defaults copy FIELD_CALIBRATION.divisors (deep-freeze); divisors patch replaces record; tool toMilkyWayTuning not renamed.
Review B1/B2 (Opus) ∥ E3 (B3 + B3b, Opus).
Review B1/B2: no blockers. Queued (after E3): drop MILKY_WAY_FIELD_TUNING_DEFAULTS divisors copy (milkyWayFieldTuningDefaults.ts:8-9); rename tool toMilkyWayTuning → toMilkyWayCloudTuning (refactor rename); spec §6 `cloud: MilkyWayTuning` → MilkyWayCloudTuning; MilkyWayCloudSliderKey.d.ts stale parenthetical; re-wrap milkyWayAggregatePass.ts:47-49. B9 rule: spread divisors from live state. Note: entering an exhibit resets renderer to 'v1' (spreads initialState) — acceptable, debug-only.
Dispatch E3 (B3+B3b): Opus, complete. B3 df2cce860 (deriveFieldView + milkyWayInverseModelCached; mutation-checked; up = basis.up not rolledUp; eye tol 1e-6 vs f32 camPos) · B3b ab403424c. FINDING: 1.6667 kpc/unit was RIGHT (radius 1.05 → outer 10.5 units; 17.5/10.5); the 1.75 claim was a plan misreading; literal now derived from MILKY_WAY_MODEL_SCALE; tool look unchanged (0.002%). B3/B3b review folded into the E4 review.
Dispatch E4: commit 1 = B1/B2/B3 review fixes (+ MILKY_WAY_MODEL_SCALE → src/data/milkyWay/, plan Units RISK corrected), then B4–B8 (Opus).
Dispatch E4: Opus, 138 tool uses, complete. fixes 012c0e177 · B4 a2829f847 · B5 2ee8c3d6d · B6 c7a475160 · B7 d047325ed · B8 d7964acee. npm run build PASSES (field shaders link in the app). FIRST LIGHT: v2 draws in the app, no console/GPU errors, v1↔v2↔both cycling clean (scratchpad mwclose-{v1,v2,both}.png). Extra files: FieldHostSlotDeps.d.ts, fieldTargetRowId.ts, milkyWayFieldComputeName.ts, milkyWayFieldHostTuningFor.ts.
Review B3–B8 (Opus) ∥ E5 (B9–B10, Sonnet).
Review B3–B8: no blocking. Lifecycle, one value, gates, dome faces, render-wake all verified. Queued fix round (after E5): M1 host destroy leaves an ISM readback in flight → readback queue cancel() before renderer.dispose() (createGalaxyFieldHost.ts:121); M2 deriveFieldView test via deriveView dome face; M3 cloud liveness in 3 places → one predicate (parts.cloud ∧ alpha) shared by aggregate/upsample + fix milkyWayCloudLiveness header; M4 plan line ~997 rolledUp→up; nits (FieldHostSlotDeps typo, spanTimestampWrites tri-state doc, ragged wraps MilkyWayRuntime.d.ts/create.ts). Extra files judged earned.
Plan: B3b pcToUnits task added; D1 had ticked every "Commit." box in A5–B11 — un-ticked (9a68357ca).
Fix round: M1 b8e8194bb readback queue cancel() before renderer.dispose() (failing tests first: queue + host order).
Fix round: M2 4fb537dba deriveFieldView test through deriveView with a dome face (basis + frustum).
Fix round: M3 3b4baabd3 isMilkyWayCloudLive (parts.cloud ∧ alpha) shared by aggregate/upsample/dust; milkyWayCloudLiveness header rewritten.
Fix round: M4 + nits a0070c5cb plan basis.up, FieldHostSlotDeps typo, spanTimestampWrites tri-state comment, header wraps.
Fix round: extras d22b20983 tool draws extras, app never does → APP_FIELD_TARGET_IDS (no extras row/slider), GalaxyFieldRenderTargets.extras optional; ~66 MB at 4K saved.
Review fix round 2: 30a32a9cf comments + RENDERER.md say v1 dust never extincts the field (placement only); spec §2 records 'both' = v1 without dust; host tuning comment states the units fact in place.
Review fix round 2: b690830cf AppFieldTargetId type; divisors + slider keys narrowed, defaults seeded without extras; deleted fieldTargetRows change-detector, Object.freeze + identity claim, duplicate slot test.
Review fix round 2: 2aa450172 GalaxyFieldHostDeps.targetIds → planFieldFrame lists only allocated targets (app APP_FIELD_TARGET_IDS, tool FIELD_TARGET_IDS); fieldTargetOf throws on a miss instead of two silent skips.
Review fix round 2: 9e4eb1227 milkyWayFieldSliderPatch extracted (npm run refactor) into tuning/utils, test mirrored.
Review fix round 2: 2a43a0122 MilkyWayTuningSection uses DebugTuningSection twice (cloud + renderer select; field + dust toggle), container memoises fieldValues, readout span dropped; Playwright shot of v1/both checked.
Deletion audit safe-now: 0e9292e78 fieldValues memo + prop inlined, MilkyWayCloudSliderField alias and wrong only-reader comment dropped, 4 restating tests cut (selectors table, renderer reducer, field key parity, PC_PER_UNIT), field span test moved to milkyWayFieldSliderFields.test.ts; -52 LOC.
- B11 (controller): first light v1/v2/both outside + in-disc passed (user dash Jae1, 2026-11-11); v1 = main (178/1.44M px twinkle); perf gate v1 main vs branch within noise (scratchpad mw-perf-gate/); field cost v2 6-8 ms real GPU at MW poses vs v1 ~2 ms (mw-perf/), per-target in mw-perf-targets/, no stall (mw-stall/); invMeanNorm first-landing pop not observed. Deletion audit -52 LOC 0e9292e78; rename cf77de452.
