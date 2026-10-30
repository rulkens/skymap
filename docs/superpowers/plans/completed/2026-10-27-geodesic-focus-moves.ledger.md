# SDD ledger — plan: docs/superpowers/plans/2026-10-27-geodesic-focus-moves.md

Spec: docs/superpowers/specs/2026-10-27-geodesic-focus-moves-design.md
Branch: worktree-review-pr-531-focus-move · draft PR #945 · merge-base 5bf0ac07a · plan commit 9f3b84c61
Start answers (2026-10-27): serial, this plan only; perf gate SKIPPED (owner).
Dispatch groups: A = Tasks 1–2 · B = 3–4 · C = 5–7 · D = 8–9.

## Pre-flight scan

| pair / task | produces → consumes | finding |
| --- | --- | --- |
| T1 → T4 | CompositeTrack {channels, sample→CompositeSample} → buildGeodesicTrack | consistent |
| T2 → T6 | FocusMotion (eased arm) + FOCUS_MOTIONS keyed by FocusMotion['style'] → geodesic arm + row | consistent |
| T2 ↔ watchFocusTweenSaga | focusTweenDescriptor gains `motion` param | **T2 Files omit `watchFocusTweenSaga.ts:97`** — see Ruling 1 |
| T2 → T7 | FOCUS_TWEEN_MS readers after T2: goHome (until T6), follow, tests | T7 is grep-driven; consistent |
| T3 → T5 | `focusMoveDefaults.ts`: DEFAULT_GEODESIC_TUNING (T3), DEFAULT_FOCUS_MOVES appended (T5) | consistent |
| T5 → T6/T7/T8 | `state.settings.focusMoves` (reducerPath), selectFocusMoves, setEasedDuration(ms) | consistent |
| T4 → T6 | `geodesic(to, tuning, fovYRad, over)` helper | consistent |
| T1 self | renames keep `buildPathTrack` name | consistent |
| T2 self | test 10→1000 lin + linear @500 ms = 505 | correct (space:'lin') |
| T3 self | ms duration, minMs>maxMs ⇒ minMs | consistent |
| T6 self | "ignores live FOV" test | weak but real: guards motion.fovYRad over ctx.projection |
| T8 self | seconds on screen, ms dispatched | consistent |

Ruling 1: Task 2 also edits `src/state/selection/watchFocusTweenSaga.ts:97` to pass `{ style: 'eased', durationMs: FOCUS_TWEEN_MS, ease: 'easeOutCubic' }` — the new `focusTweenDescriptor` signature forces it — cost if wrong: none, type-driven.
Ruling 2: review cadence = one mid-branch review per dispatch group covering its `review: yes` tasks (A, B, C), not one per task; D (untagged) rides the final review — 7 tagged tasks × a review each would rebuild the per-task chain the lean protocol retired — cost if wrong: a cross-task bug in a group surfaces one review later.
Ruling 3: implementers on Opus for A–C (all tagged review: yes, camera/state maths per sdd-execution Models), Sonnet for D.

## Progress
Task 1: implemented d0ada710c (Opus; deviations: generic CompositeTrack<S>, validator own file + 'composite window' text, docs/animation/clip-primitives.md)
Task 2: implemented 62273af8f (deviations: driverGoldenTrace/poseFold fixtures now declare the ease that actually ran)
Group A review dispatched over 9f3b84c61..62273af8f
Group A review: 1 Important (row lookup breaks on the 2-arm union — Task 6 would need a cast) + 9 Minor; behaviour preservation VERIFIED equivalent
Group A: fix round 1 sent (Important + minors 2–7) to the A implementer
Ruling 4: FocusMoveStyle.d.ts stays dead until Task 5 (plan-mandated); Task 6 adds a type-equality check vs FocusMotion['style'] — cost if wrong: one dead file for 3 commits
Ruling 5: evaluateClip single-slot sample cache resamples ~3x/frame on a flyPath-then-geodesic clip — accepted, a few cosh per frame — cost if wrong: negligible
Adjacent (pre-existing, offer to owner): a composite governs forever after startSec, so seq([flyPath, dollyTo]) silently drops the dollyTo on a declared channel; validator checks only in-window overlap
Group A: fix round 1/1 (Important + 6 minors addressed; commit 57af59e08; rowOf accessor verified against a dummy 2nd arm). No re-review per lean protocol.
Task 1: complete (commits 9f3b84c61..d0ada710c, fixes in 57af59e08)
Task 2: complete (commits d0ada710c..62273af8f, fixes in 57af59e08)
CI green at 62273af8f.
Group B dispatched (Tasks 3–4) from 57af59e08
Owner ruling (ask p13d): adjacent composite-hold bug FIXED IN THIS PR, validator throws — own commit, after Task 4 (same files), by the group B implementer. Must compile every shipped clip (tests/data/animation/clips) to surface any clip silently relying on the drop.
Task 3: implemented bd470a6e7 (FOV test re-picked inside the clamp; extra #531 tests kept)
Task 4: implemented fe9464db4 (limitation: a geodesic flies out of the clip start, so seq([flyPath, geodesic]) snaps target/distance back — same class as the adjacent hand-off question R4Tx)
Group B review dispatched over 57af59e08..fe9464db4
Group B review: port fidelity, units, effect PASS; 0 Critical/Important, 7 Minor (2 blind tests, 1 missing zero-duration test, 4 comment trims) — all sent to B implementer as one fix commit
Owner ruling (ask R4Tx, supersedes p13d): composite hand-off = CONTINUE from the path's end (not throw). Uniform rule: each composite channel continues from whatever wrote it last — base after composite gets from=final sample; composite start = compile-time running value. One helper. Sent to B implementer as its own commit; STOP if any shipped clip's sampled pose changes.
Group B: fix round 1/1 (7 minors addressed; commit 6cfb97db0)
Task 3: complete (commits 57af59e08..bd470a6e7, fixes in 6cfb97db0)
Task 4: complete (commits bd470a6e7..fe9464db4, fixes in 6cfb97db0)
Hand-off fix: STOPPED pre-commit (uncommitted in wt + scratchpad continuation.patch). 61/63 shipped clips identical; neighbourhoodFlythrough (clip:tourNeighbourhood, tour:grandTour:5:dwell) gains its authored dwellDrift yaw spin (max yaw Δ 0.838 rad). Owner asked (Centaurus A drift). Limitation: composite start pose read in walk order — a base segment in a LATER all() sibling isn't counted.
Owner ruling (ask 6Ztb): Centaurus A dwellDrift plays as authored — accepted. Hand-off commit to finish with tests + a pin on the neighbourhood drift.
Hand-off fix: committed 3cff263b8 (4 tests; MUTATION-VERIFIED by controller: all 4 fail with the src change reverted). Walk-order limit left, documented at startPoseAt (two-phase build needed). Unreviewed → final review must cover it.
Group C dispatched (Tasks 5–7) from 3cff263b8
Tasks 5–7: implemented 6d3202503, b5db30020, 166c42df2 (deviations: follow duration captured as memory.durationMs ?? setting beside from; FollowMemory set in missionPose/replayInput; geodesic clip inline in focusMotions.ts, no geodesicFocusClip.ts; stale focusTweenDuration pointers fixed)
Group C review dispatched over 3cff263b8..166c42df2
Group C review: frozen plan, one-number duration, scope, persistence PASS; deviation 1 verified NOT a live-slider leak (from/durationMs paired in every prod writer). 1 Important (FOV test can't fail: setFovDeg after memoised compile) + 7 Minor — all sent to C implementer as one fix commit.
Ruling 6: eased duration 0 guarded in ONE home (setEasedDuration floors at 1 ms), not per reader — cost if wrong: none; the slider min is 100 ms.
Group C: fix round 1/1 (Important + 7 minors; commit dfec3aace; FOV test mutation-verified by implementer). Guard is from===null||durationMs===null (recaptures both; prod writers always pair them).
Task 5: complete (3cff263b8..6d3202503, fixes dfec3aace)
Task 6: complete (6d3202503..b5db30020, fixes dfec3aace)
Task 7: complete (b5db30020..166c42df2, fixes dfec3aace)
Group D dispatched (Tasks 8–9) from dfec3aace (Sonnet)
CI RED at dfec3aace: docsReference.test 'has a row for every value…' — new focusMoves.* paths lack a website docs row. Routed to D implementer as part of Task 8: docs row for focusMoves.style + NOT_IN_PANEL /^focusMoves\.(eased|geodesic)\./. Site copy drafted by controller (owner may reword).
Task 8: complete (dfec3aace..1d7d63f82; one 5-row slider table; + website docs row & NOT_IN_PANEL exemption) — rides final review (untagged)
Task 9: complete (1d7d63f82..41e9a0be7) — #531 followBody paragraph to check in final review
Final review dispatched over 5bf0ac07a..41e9a0be7
Final review: spec fidelity PASS; hand-off correct w/o frames; no other shipped clip changes; 2 Important (frame-tagged seg after composite → validator throws; backlog misses #531 pin + per-frame tuning lessons) + 11 Minor — ONE fix wave sent to B implementer. Pre-merge: owner eye checks (ask Qsah), CI green, owner OK on site copy.
Final fix wave: d1ac32c26 (13 items; frame-tagged throw widened to before/after; shipped-clip snapshot re-run: only the accepted drift).
CI RED at 41e9a0be7: noInlineTypes (fixed by d1ac32c26 item 9) + docsProject Debug page row — controller added the row inline (3c commit).
Deletion audit (opus, legacy): ~35–45 src + 45–70 test LOC. Safe-now bin: inline focusMoveEase, merge slider tables (+ prettier), drop duplicate geodesic overlap test, reflow validator header. Needs-ruling asked: eased ease field, over required, resolveFocusMotion test, zero-over test. Left: GEODESIC_EASES allow-list (deny-list would admit a new non-monotone family), FollowMemory.durationMs (spec §3.6), derived channels.
Owner rulings (ask Dh8K): KEEP eased ease field, KEEP geodesic over fallback, KEEP resolveFocusMotion test, KEEP zero-over test. Safe-now bin dispatched (Sonnet).
Deletion cuts: 593a2ff25 (−25 LOC net).
DoD audit: READY (CI green at 94d55acb4; checkboxes 50/50; no new TODOs; smoke partially attested by owner: Sun↔MW geodesic good, planets stay Eased).
