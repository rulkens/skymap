# SDD ledger — plan: docs/superpowers/plans/2026-09-14-camera-frame-ladder-prep.md

Spec: docs/superpowers/specs/2026-09-14-camera-frame-ladder-site-rung.md (on main via #707 f480efd25).
Execution branch: worktree-camera-frame-ladder-prep (wt .claude/worktrees/camera-frame-ladder-prep), cut from main f480efd25.
Parallelism: 2 (user ruling). Draft PR: opened by the controller after Task 1 lands, --base main.
No deletion audit on this prep PR (user ruling 2026-09-14) — Task 17b is SKIPPED; 17a ratchet + 17c comment audit run.

## Pre-flight scan

| Pair | Produces / consumes | Finding |
| --- | --- | --- |
| T1→T2 | frameKey/sameFrame(PoseFrame) | match |
| T1→T3 | isWorldArm(framed) type guard; all 12 sites hold FramedCameraPose | match |
| T2 ∥ T3 | both edit replayInput.ts (205-209 vs 234/268) | disjoint hunks; parallel-safe via cherry-pick |
| T4→T5 | RungRow/ClimbRow/ClimbableKind/HostBody → CAMERA_RUNGS shape | match |
| T5→T6 | foldToWorld(framed, RungBasisCtx); T6 builds RungCtx ⊃ RungBasisCtx | match |
| T6→T7 | T7's hostOf sites need the ctx T6 threads; both edit replayInput/projectFramePose/watchFlyToLonLat/clipFrameChannels | forced order T6 then T7 |
| T6 ∥ T8 | projectFramePose :108 vs :127-152 | disjoint hunks; parallel-safe |
| T7→T9 | T9 moves regimeArmFor engage/release "verbatim" — verbatim = post-T7 text (hostOf at :42-44) | note in T9 dispatch |
| T8→T10 | centreLookingArm(eye, centre, poseBasis, roll) → FramedCameraPose | match |
| T9→T10 | stepRung(current, RungCtx): PoseFrame; regimeArmFor still called until T10 | match; T9's test move leaves regimeArmFor untested for one task — acceptable |
| T11→T12→T13 | SurfaceGestureMemory → MemOf.body → step memory; CameraRuntime.gesture retyped twice | forced order |
| T13→T14 | rowFor(frame).step at drag/zoom sites; declined kinds return pose by reference | match |
| T15→T16 | RungChannels encode(world, frame, ctx)/decode; fromBodyFixedChannels deleted in T16 | match |
| T6/T7→T15 | clipFrameChannels edited partially then moved in T15 | forced order |
| T2→T16 | frameKey early-out at evaluateClip:549 | match |
| T13 ∥ T15 | both grow RungRow.d.ts + bodyRung.ts | NOT parallel-safe → serial |
| T14 ∥ T15 | both edit absoluteRung.ts | NOT parallel-safe → serial |
| T5 self | test "hostOf answers the ground radius, never a bounding hull" against one roster row | Ruling: keep — it guards §2.6.6 (roster radiusM vs mesh bounding hull), a real bug class, not a constant restatement — cost if wrong: one low-value test |
| T17 self | ratchet allow-list = rungs/ dir; expected offenders rungKindOf/frameKey/isWorldArm/bodyRung | consistent; `absoluteArm` builds a literal, no `===` |
| Global | frameFilePurity projectFramePose budget 1; noStoredRegimeFlag allow-list empty | no task raises either |

Ruling: waves — W1 T1 · W2 T2∥T4 · W3 T3∥T5 · W4 T6∥T8 · W5 T7 · W6 T9∥T11 · W7 T10∥T12 · W8-11 T13→T14→T15→T16 serial (pipelined reviews only) · W12 T17. — shared-file pairs serialize per feedback_sdd_parallel_tasks — cost if wrong: a cherry-pick conflict I resolve by re-dispatch.
Ruling: parallel implementers run in isolation worktrees off the execution HEAD, commit on their own branch, no push; controller cherry-picks -x in task order. — cost if wrong: duplicate commits to drop.
Ruling: the controller pushes and opens the draft PR after Task 1 (implementers never push). — standing user policy (draft at start).

## Task 0 gate
Task 0: complete — tsc clean (both projects); npm test: 1340 test files passed, 9264 tests passed; fixtures clean. No commit.

## Task log
Task 1: implementer DONE ef1edb374; review dispatched (sonnet) on review-f480efd25..ef1edb374.diff.
Draft PR #710 opened (--base main) https://github.com/rulkens/skymap/pull/710; branch pushed.
Task 1: review — Important: comment budget over in RungKind/FrameOf/FramedCameraPose/frameKey; Minor (deferred): frameKey.ts and isWorldArm.ts re-check `=== 'absolute'` rather than going through rungKindOf (same discriminant; TS narrowing).
Task 1: fix round 1/5 dispatched (resumed implementer; path-limited commit because Task 2 shares the worktree).
Wave 2 dispatched: Task 2 (this worktree, sonnet, BASE ef1edb374) ∥ Task 4 (isolation worktree, sonnet, base ef1edb374; cherry-pick on return).
Task 1: fix round 1/5 (1 addressed, 0 open — comment budget; commit 976ee0535)
Task 1: complete (commits f480efd..976ee05, review clean after 1 fix round)
Task 4: implementer DONE c9b9cd75 (agent wt) → cherry-picked as 4a6fb9fad; agent worktree + branch removed.
Task 4: minor (deferred): RungBasisCtx.d.ts header 5 lines over 8 code lines — borderline, trim if touched again.
Task 4: complete (commit 4a6fb9fad, review clean)
Task 2: implementer DONE 7195f6746; review dispatched (sonnet). Implementer flagged the T1 fixer sharing the worktree — expected (controller's path-limited fix), isolation of T4 held.
Task 5: dispatched (isolation worktree, opus, base 4a6fb9fad). Task 3 waits for Task 2's review (shared replayInput.ts).
Task 2: complete (commit 7195f6746, review clean)
Task 3: dispatched (this worktree, sonnet, BASE 4a6fb9fad + plan-tick docs commit 5c2a887de).
Task 3: implementer DONE d32848e66; review dispatched (sonnet).
Task 3: complete (commit d32848e66, review clean)
Task 8: dispatched early (this worktree, sonnet, BASE d32848e66) — disjoint from Task 3's files; Task 6 follows Task 5.
Task 8: implementer DONE 5e54b6edc (concern: `world.roll ?? 0` at the call site, not char-verbatim); review dispatched (sonnet) with that as a named risk.
Task 8: complete (commit 5e54b6edc, review clean; `?? 0` branch verified dead — toWorldArm always sets roll)
Task 5: implementer DONE a3c0ae1b7 (agent wt) → cherry-picked as 3c47e64e9; agent worktree + branch removed. Concerns: import cycle (getter table workaround), hostOrThrow message reworded, foldToWorld not via refoldTo. Review dispatched (opus) with all three as named rulings.
Task 5: review Approved. Reviewer rulings adopted: getter table is the correct break of a real init-order cycle (keep); hostOrThrow wording unasserted anywhere (keep); foldToWorld via climbRowFor().toParent is compile-loud at a third rung (keep; feature-plan note).
Task 5: minor (deferred): rowFor.test.ts:30 `parent` literal assertion restates ParentOf — delete at T17; refoldTo.ts:22 raw `target === 'absolute'` → `rungKindOf`; refoldTo hard-codes world as meeting rung (compile-loud at 3 rungs — feature-plan note).
Task 5: complete (commit 3c47e64e9, review clean)
Task 6: dispatched (this worktree, opus, BASE 3c47e64e9). Agent hit a 429 then a 600 s stall mid-edit; resumed twice with edits intact.
Task 6: implementer DONE 487fd6b09 (concerns: relocated foldToWorld by-ref test; `focus.id as BodyId`; replayInput third param keyed object). Review dispatched (opus) with those as named rulings. Task 7 waits (shared files).
Task 6: minor (deferred): foldToWorld.test.ts lacks the sibling module header; `focus.id as BodyId` is a SelectionRow typing gap (id: string) — out of scope, adjacent finding to OFFER the user at the end.
Task 6: complete (commit 487fd6b09, review clean)
Task 7: dispatched (this worktree, sonnet, BASE 487fd6b09).
Task 7: implementer DONE c674cf2cc — 8/9 sites; regimeArmFor left untouched (no poseBasis/upBasis in scope for a RungBasisCtx).
Ruling: regimeArmFor's host site (7) is substituted in Task 9 when its logic becomes bodyRung.release (which receives a RungCtx); Task 10 deletes the file. Not a gap. — cost if wrong: none, the file dies two tasks later.
Task 7: review dispatched (opus) with the replayInput shared-hostOf collapse as a named risk. Wave 6 (T9 ∥ T11) waits on the verdict.
Task 7: review Approved. Ruling: replayInput's two host sites collapsed onto one hostOf — site 11's pole fallback deleted; reviewer proved it dead (184/184 roster ids carry a derived state). Keep. — cost if wrong: a roster body without a state would early-return instead of stepping at the pole.
Task 7: minor (deferred): frameContext.ts `as ReadonlyMap<BodyId, BodyState>` on deriveBodyStates' string-keyed return — real fix = narrow deriveBodyStates' return type; adjacent finding to OFFER.
Task 7: complete (commit c674cf2cc, review clean)
Wave 6 dispatched (BASE c674cf2cc): Task 9 (isolation worktree, opus) ∥ Task 11 (this worktree, opus).
Task 9: implementer DONE 894de2630 (agent wt, NOT yet cherry-picked — Task 11 still editing this tree). Concerns for Task 10: stepRung's single-pose input vs today's frame/eye pair; release returns row.parent; Object.values per frame. Review dispatched (opus, reading the agent worktree).
Task 11: implementer DONE 39f56610b (full suite 1346/9320 green; concerns: cameraDebugSnapshotOf untouched/engine.ts edited; surfaceGestureEdge prev param + makeSurfaceDriver seed dropped; EMPTY_TILT_MEMORY in src/data/camera; test uses 'sun'). Review dispatched (opus).
Task 9: cherry-picked as 86507d381 on top of 39f56610b (agent worktree kept until its review returns). Combined-tree sanity run (tsc + golden + new tests) in background.
Task 9: review Approved. Reviewer rulings: release→row.parent reproduces today's answer in every branch; Object.values per frame is fine (getters require in-call read).
Task 9: minor → CARRIED INTO TASK 10 (load-bearing for the feature): stepRung.ts returns after `release` on any non-world arm and never reaches the child loop — a rung parented on 'body' could never engage. Task 10 fixes: ask release when the row has a parent, then fall through to the child loop (still ≤ one rung per call).
Task 9: minor (deferred): cameraDebugSnapshotOf.test.ts:5 cites regimeArmFor.test.ts (gone) — fix in T10 or T17; bodyRung.ts header restates 3 lines of regimeArmFor's (resolved when T10 deletes it).
Ruling for Task 10 (from T9 review): feed stepRung `refoldTo(displayed, intent.base.frame, ctx)` — exact in 3 of 4 tag/pose combos; the corner body-tag-with-differing-displayed-frame must be shown unreachable or kept out of the refold (else hostOrThrow can throw where today's predicate holds). Golden traces are the arbiter; halt if settle moves.
Task 9: complete (commit 86507d381, review clean); agent worktree + branch removed.
Task 11: review Approved; all four concerns ruled in the implementer's favour (cameraDebugSnapshotOf inputs already flat; dead `prev`/`seed` params; EMPTY_TILT_MEMORY in src/data ok; 'sun' fine).
Task 11: minor (deferred): TiltMemory.d.ts 3 comment / 5 code (trim header to one line at T17); empty-memory twins carry an identical comment (T12 touches one); surfaceStep.ts:123 allocates TiltMemory on every drag step (incumbent behaviour, out of scope); declined-drag test lost `up.tilt` identity assertion (one-line parity at T17).
Task 11: complete (commit 39f56610b, review clean)
Combined T9+T11 sanity: tsc clean; goldenTrace/poseFold/stepRung/notedTiltMemory 23/23; fixtures clean.
USER RULING 2026-09-15: stop intermediate (per-task) reviews; one final whole-branch review only. Tasks 10+ land on implementer DONE + controller sanity (tsc, golden traces, fixtures clean).
Wave 7 dispatched (BASE 86507d381): Task 10 (this worktree, opus; carries the refoldTo ruling + the stepRung child-loop fix + the stale test citation) ∥ Task 12 (isolation worktree, opus).
Task 10: implementer DONE 06dc7b8e9. Deviation from the T9-review ruling: the body-regime-with-differing-displayed corner IS reachable (poseFold "absolute arm inside the band"); refoldTo KEPT because any formulation avoiding it would hand stepRung an 'absolute'-tagged pose and run engage where regimeArmFor ran release (silent mid-tween release inside the band, poseFold.test.ts:207). Ruling: ACCEPT — refoldTo's output feeds only the frame tag; old code threw at the same sub-case one line later; nine poseFold cases + both traces green. — cost if wrong: an unresolved host throws where the predicate once held (already true pre-branch). Note: toWorldArm now runs twice/frame while engaged (world + release) — final-review/feature note. Extra: two stale citations fixed, prettier reflow in noStoredRegimeFlag.test.ts.
Task 10: complete (commit 06dc7b8e9, no review per user ruling)
Task 12: implementer DONE c7c968b65 (agent wt) → cherry-picked as b0b5a949b; agent worktree + branch removed. Envelope key = projected.register.frame, checked at write; identity kept when key AND value unchanged; `??` bridge at replayInput call site (`prev.gesture.value ?? EMPTY_SURFACE_GESTURE_MEMORY`) because MemOf['absolute'] is null — final-review note. settleGoldenTrace.test.ts touched 2 lines (fixture shape) — final review verifies no assertion change.
Task 12: complete (commit b0b5a949b, no review per user ruling)
Task 13: dispatched (this worktree, opus, BASE b0b5a949b). Serial from here: 13 → 14 → 15 → 16 → 17.
Combined T10+T12 sanity: tsc clean; goldenTrace/poseFold/stepRung/stepCameraRuntime 27/27; fixtures clean.
Task 13: implementer DONE 74d19c340 (full suite 9324 green, fixtures clean). D5 DEVIATION: `step` grew a TiltMemory slot — `step(memory, tilt, framed, input, ctx) => { pose, memory, tilt }` — because surfaceStep reads AND writes the tilt (its writes are settleGoldenTrace's `memory` column) and §2.4's signature had nowhere to carry it. Ruling: ACCEPT — tilt is deliberately not rung memory (keyed by host, read in the world arm, ruling 18) so it cannot ride MemOf; a separate pass-through slot is the honest shape. Spec §2.4 + plan "Deviations" must be amended in this PR (Task 17) and the site-rung plan's `step` contract inherits it. — cost if wrong: one extra parameter every row ignores. Other notes: `??` bridge now at stepCameraRuntime (dissolves in T14); world-arm gesture edges no longer write the key-wiped gesture memory (inert, unread); absoluteRung has an identity `step` until T14.
Task 13: complete (commit 74d19c340, no review per user ruling)
Task 14: dispatched (this worktree, opus, BASE 74d19c340).
USER: "pause" then "stop your work now" 2026-09-15 — Task 14 implementer KILLED mid-edit. Head 74d19c340 (T0–T13 committed + pushed). UNCOMMITTED partial T14 edits in replayInput.ts, rungs/absoluteRung.ts, stepCameraRuntime.ts (the agent had moved applyWorldStep into absoluteRung.step and was about to remove the stepCameraRuntime `??` bridge). On resume: either finish T14 from those edits (re-dispatch with "edits in tree, continue") or `git checkout -- <the three files>` and redo. Then T15 → T16 → T17 → final whole-branch review (opus).
Task 14: RESUMED 2026-09-15 after account switch — re-dispatched (opus, this worktree, edits in tree) from the uncommitted partial edits, BASE 74d19c340.
Task 14: implementer DONE 7b596bb96 (inherited edits sound; two type fixes). Final-review notes: `??` bridge MOVED not dissolved — sole coercion `gestureMemory ?? rowFor<'body'>(from.frame).emptyMemory` replayInput.ts:162 (rowFor can't infer K from FrameOf[K]; dissolves when the drain carries the {key,value} envelope); stepRow/from re-tag off the narrowed 'absolute' tag rather than absoluteArm (§7 ruling wanted before site rung); world-arm pointer edges now write gestureMemory=null (correct per envelope contract, unobservable — engine.ts:639 optional-chains); `moves` boolean carries three jobs; at-rest world-arm zoom is the one lane bypassing the table.
Task 14: complete (commit 7b596bb96, no review per user ruling)
Ruling: T15+T16 dispatched as ONE grouped implementer (serial-dependent, same clip-channel path) per the lean protocol — cost if wrong: one larger diff to bisect.
Task 15+16: implementer DONE_WITH_CONCERNS — 1066ac05a (T15 channels cells) + d09b93774 (T16 convertChannels via table); full suite 1346/9327; fixtures clean.
Ruling: two enabling edits outside the briefs ACCEPTED — `FramedPose` now distributes over K (else rowFor(frame).channels.decode yields an uncorrelated record; neither task compiles; fallout = explicit type args on replayInput's two stepRow calls) and `absoluteArm` narrowed to return FramedPose<'absolute'>. — cost if wrong: a type-level change the final review re-judges.
Ruling: `absoluteRung.channels.decode` forwards to `absoluteArm` (kept: spec §7 single world-arm constructor, many callers) — 17b suspect noted for the FEATURE's deletion audit, not this PR. — cost if wrong: one duplicated one-liner.
Task 15+16: final-review notes: framedClipArm fabricates a RungBasisCtx (upBasis: to) because DriverCtx has no upBasis and no decode cell reads a basis; bodyRung.channels.encode drops ctx.upBasis into toBodyFixedChannels' single basis param — byte-identical today, silent if bases diverge. fromBodyFixedChannels + clipFrameChannels fully gone.
Task 15: complete (commit 1066ac05a, no review per user ruling)
Task 16: complete (commit d09b93774, no review per user ruling)
Task 17: dispatched (this worktree, opus, BASE d09b93774) — 17a ratchet + 17c comment audit + deferred minors + D5 docs amendment; 17b SKIPPED.
Task 17: implementer DONE_WITH_CONCERNS — 431c50806 (17a ratchet; six out-of-rungs offenders routed through the vocabulary in the same commit: replayInput, frameContext, projectFramePose, logCameraState, cameraDebugSnapshotOf, cameraDofAnglesOf), 707241fc7 (17c + deferred minors), 168dccc52 (D5 docs). Full suite 1347/10066 (Task 0: 1340/9264; +739 = oneTagReader it.each over 369 files).
Ruling: ratchet flag (1) EXEMPTS `rungKindOf(x) === 'absolute'` — it compares the vocabulary's RungKind, not the raw frame tag; without it the sanctioned route is impossible outside rungs/. Final review re-judges. — cost if wrong: one over-loose ratchet predicate.
Ruling: the six offender fixes ACCEPTED as prep scope (they are the 46-site sweep's stragglers); cameraDofAnglesOf has a debug-only delta in the declared-unreachable unresolved-host case — final review verifies. — cost if wrong: a debug-panel number in an unreachable state.
Ruling: refoldTo/frameKey keep raw `=== 'absolute'` (rungKindOf kills narrowing, probed); both are allow-listed rungs/ files. evaluateClip.ts 92-line header left (pre-existing; mass-rewrite ban).
Task 17: complete (commits 431c50806..168dccc52, no review per user ruling)
FINAL REVIEW dispatched (opus) over f480efd25..168dccc52.
FINAL REVIEW: With fixes — 0 Critical, 2 Important, 9 Minor (final-review.md). Traces/tsc/full suite verified independently by the reviewer. DoD: 11 mechanical items met; 5 manual observable checks = the open gate (user).
Ruling: ONE fix wave = Important 1 (ratchet blind to `switch/case 'absolute'`, `typeof frame === 'string'`, `const { body } = frame`), Important 2 (stepRung.ts:19-21 comment claims a guarantee the code doesn't give), Minor 4 (one comment at hostOf.ts naming the 184/184 premise), Minor 6 (sharpen framedClipArm ctx comment), Minor 8 (hostOf.test.ts:36 radius literal → assert against the roster row; reviewer disagreed with T5's keep — adopted), Minor 9 (comment budget trims: stepRung, rungKindOf, logCameraState header), Minor 10 (revert stray reflow site-rung.md:746-749). — cost if wrong: one more small commit.
Ruling: NOT fixed here, carried as feature notes — Minor 3 (toWorldArm twice per engaged frame), Minor 7 (absoluteRung.channels.decode forwards to absoluteArm → feature deletion audit). Adjacent findings to OFFER the user — Minor 5 (toBodyFixedChannels now requires a roster row via hostOrThrow + utils→services import), Minor 11 (`focus.id as BodyId` = SelectionRow.id: string gap), T7's frameContext `as ReadonlyMap` cast.
Final fix wave: DONE db7e7c4b7 (7 items; src changes comment-only; ratchet's three new spellings demonstrated failing). Notes: hostOf.ts now 4 comment / 7 code (marginal, accepted for the premise); LANDMINE the site-rung.md dedent at :746-749 is prettier's own output for a multi-line inline code span — reverted by hand, so `prettier --write` on that file will re-dedent (CI has no format:check gate). Scoped re-review dispatched (sonnet) over 168dccc52..db7e7c4b7.
Scoped re-review: 6/7 ADDRESSED; new breakage none. Residual: stepRung.ts still 11 comment / 21 code (fix report claimed 10/21; header −1, loop comment +1). Ruling: PARKED — one line over a soft budget on the file the feature PR rewrites next; no second fix wave. — cost if wrong: one comment line.
Branch pushed to #710 at db7e7c4b7. NEXT: user's manual "nothing moved" pass (DoD's five observable checks) → /feature-done (prep plan → completed/; spec STAYS active, §4 feeds the feature PR; archive this ledger per sdd-execution Rule 3) → mark ready → user squash-merges.
/feature-done 2026-09-15: READY (tsc clean; 1347 files / 10065 tests; DoD 16/16 ticked incl. user visual pass on Earth). Plan → plans/completed; spec STAYS (site-rung feature consumes §4); ledger archived; leanness audit SKIPPED by user ruling.
