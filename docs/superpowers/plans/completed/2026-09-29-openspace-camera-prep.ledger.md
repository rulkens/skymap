# SDD ledger — plan: docs/superpowers/plans/2026-09-29-openspace-camera-prep.md

Spec: docs/superpowers/specs/2026-09-29-openspace-camera-mode-design.md. Draft PR #830. Branch worktree-openspace-camera-mode, BASE f30ef5d57.
Asks (AqJE): approved; dispatches = camera chain D1 (T1+T2) → D2 (T3) → D3 (T4+T5), D4 (T6) in parallel with the chain; no perf gate.
Pre-flight: T1 & T3 both edit cameraDrivers.ts (disjoint lines, serial chain). T6 files are disjoint from T1–T5. No conflicts.

D1 (T1+T2) opus, BASE f30ef5d57 — dispatched
D4 (T6) opus, BASE f30ef5d57 — dispatched in parallel (file-fenced)
D4 (T6) done 8b8dd0fbe, opus 35 tool uses; deviations: methods-not-arrows in PersistedValue (variance), splashStorage.test deleted (moved). Review dispatched.
Task 6: complete (8b8dd0fbe, review clean). IDE togglePalette error was stale.
Task 6: minor (deferred): persistValues.test.ts:73-76 'skips null' test near-restates code — final review to triage
Task 6: minor (deferred): PersistedValue methods drop readonly (variance, commented)
D1 done: T1 d32c5302e, T2 e3624415f (opus, 21 tool uses); deviation: commitOnEdge.test.ts compile fallout. Typecheck clean at e3624415f.
Task 2: complete (e3624415f, not review-tagged)
Task 1: complete (d32c5302e, review clean; sonnet reviewer)
D2 (T3) done 0cc45ee66 opus. Deviations: ':180 tween' is actually followApproach ease; tweenToClip/evaluateClip DROP offset (focus tween snaps?); shell renderers switched to orbitForwardOf (f32 round-off at zero offset); approachTiltedPose carries (implementer ruling).
D3 (T4+T5) opus dispatched at 0cc45ee66, in parallel with the T3 review (fenced)
Task 3: review Spec ❌ — tween row snaps lookOffset (tweenToClip drops it); misnamed test. Fix round 1 → resumed T3 implementer.
Task 3: minor (deferred): shell renderers → orbitForwardOf is ulp-level, sound (old subtraction was the wrong one)
PR 2 note: nothing clamps orbit pitch + offset pitch past zenith (imagePlaneBasis flips); approachTiltedPose tilt reads τ+offset pitch then engage drops offset (one-time snap).
Task 3: fix round 1 → 6abea10ef (tween row eases offset by 1−easeOutCubic; real tween test). Task 3: complete (0cc45ee66..6abea10ef; lean protocol: one round, no re-review)
D3 done: T4 341a02f4e, T5 9be5211a4 (opus). Deviations a–g in agent reply: PITCH_LIMIT→data/camera/pitchLimit.ts; SurfaceStepCtx extracted, no NudgeCtx; world/site nudge synthesize pixel steps; body roll uses 'strafe' settle (roll beats look's tilt write); orbit [0,0] is non-identity.
Ruling: T4+T5 mid-branch review folded into the final whole-branch review (last tasks; one reviewer reads the same diff with both task contracts) — saves one review seat — cost if wrong: a T4/T5 defect gets one fix round instead of two.
PR 2 note: navigator must omit zero axes from ArmDelta (orbit [0,0] breaks by-reference identity).
CI run 36735151350 RED: 1/1425 files — noInlineTypes ratchet still allow-lists surfaceStep.ts (fixed by extraction).
Final review (opus): 1C 2I 7M → final-review.md. Fix wave dispatched (opus): C1 ratchet line, I1 world nudge zoom via absoluteRung zoom path (frameAlignedRoll), I2 body roll applied after settle (reject deviation d), M1, restating tests, spec drift.
Ruling: delete PersistedValue.skip + its test (M1) — no reducer writes null, dead guard carried from persistSplashVersion — cost if wrong: a null seenVersion would be written as 'null' and parse back to null (harmless).
Ruling: reject T5 deviation (d) roll-forces-strafe; roll applied after the orbit/look settle — per final review I2 — cost if wrong: none identified (roll moves neither eye nor forward).
Fix wave: 1130007e9 (code) + f957d03d1 (spec). Lean protocol: no re-review; CI is the gate. Pushed.
CI GREEN on f957d03d1 (run 36736620587). Diff vs f30ef5d57: src +673/−252 (50 files), tests +536/−137 (18), docs +11/−11. Awaiting user smoke → /feature-done → merge on word.
Dev server :5173 (shell bgsf23zx4) running from this wt for the smoke check. Pending dash ask onhC (smoke). Next on 'all unchanged': /feature-done (no deletion audit on prep PR) → squash-merge #830 on explicit word → PR 2 plan (writing-plans) from spec §4–§10 + the PR 2 notes above.
Task 4: complete (341a02f4e; reviewed in final review)
Task 5: complete (9be5211a4 + fix 1130007e9; reviewed in final review)
Smoke: user attested 2026-10-04 (all unchanged). /feature-done READY: 1422 files / 14891 tests pass, typecheck clean. Plan moved to completed/; spec stays in specs/ for PR 2.
