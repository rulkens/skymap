# SDD ledger — plan: docs/superpowers/plans/2026-08-24-inside-atmosphere-rendering.md

Spec: docs/superpowers/specs/2026-08-24-inside-atmosphere-rendering-design.md (binding authority).
Branch worktree-inside-atmosphere-rendering, PR #631. Plan committed f57c3ca85.
No harness todo tool in this session — this ledger IS the task list (sdd-execution Rule 1 noted).

## Task list

T1 sunIrradiance decoy deletion · T2 hoist camPosLocal/sunDirLocal · T3 perf baseline (human-adjacent,
needs dev server) · T4 invMvp growth · T5 WESL entry points · T6 inside pipelines · T7 layer trigger ·
T8 perf checkpoint (HALT rule) · T9 visual gate (HUMAN) · T10 cloud deck from below · T11 descent-fade
tuning (HUMAN-in-loop) · T12 verification gate.

## Pre-flight conflict scan

| Pair / task | Produces vs consumes | Finding |
| --- | --- | --- |
| T1↔T4 | Both edit packAtmosphereUniforms + sphere.wesl AtmosphereUniforms + same test. T1 → 7-arg/112B baseline; T4 consumes it → 8-arg/176B, invMvp at f32 28. | Consistent; ordering (T1 first) is the spec §7 landmine, honored. |
| T2↔T7 | T2 produces AtmosphereDrawEntry.camPosLocal/sunDirLocal; T7 consumes entry.camPosLocal for the trigger. | Consistent. |
| T2↔T4 | Both edit atmosphereShellLayer.ts (T2 destructures entry fields; T4 adds mat4d.inverse + pack call). | Compatible edits, sequential. |
| T5↔T6 | T5 produces entry-point names insideVs/fsInsideMultiply/fsInsideAdd; T6 consumes exact strings + shared shellVsModule/shellFsModule. | Consistent. |
| T6↔T7 | T6 produces draw(..., inside) + hardcoded false; T7 replaces with isInsideAtmosphereShell(camLocal). | Consistent, deliberate one-commit placeholder. |
| T4↔T6 | ATMOSPHERE_UNIFORM_FLOATS=44 exported T4, used in T6's dispatch test. | Consistent. |
| T10 | Cloud files only, disjoint from T1–T7. | Clean. |
| T1 self | Test expects rec[23]===0 after pad; packer leaves index unwritten (Float32Array zero-init). | Agrees. |
| T2 self | Mock call-count "exactly once" — one qualifying body, one list call. | Agrees. |
| T5 self | fsInsideMultiply alpha 1−coverage / fsInsideAdd alpha coverage matches the two-pass alpha contract (dst.a*= (1−c) then += c reproduces OVER). | Agrees; implementer mirrors actual fsMultiply/fsAdd regardless. |
| T6 self | Regex test is a flagged testing.md exception mirroring existing precedent. | Accepted (plan flags it; spec §9 asks for it). |

Scan verdict: no conflicts requiring pre-execution rulings.

## Progress

Task 1: complete (commits f57c3ca8..523ad8ee, review clean)
Task 1: minor (deferred): stale sunIrradiance mention in shell/vertex.wesl:25 binding comment — fix rides T5 (T5 edits vertex.wesl; carried in its dispatch)
Task 1: minor (deferred): sphere.wesl:412-415 comment list lost its bullet marker (cosmetic)
Task 2: complete (commits 523ad8ee..551f6235, review clean)
Task 2: implementer DONE_WITH_CONCERNS (commit 551f62357, suite 7555 green, tsc clean); review in flight.
  Concerns noted: tsgo/typecheck:fast binary missing in ALL checkouts (environment gap, predates branch — tsc is the gate anyway); brief's test glob names atmosphereShellLayer.test.ts which doesn't exist until T4 (harmless).
Task 3: complete (no commit — measurement only). Baseline @ 551f62357, dev server localhost:5174 (this worktree, shell bzm0v92q7):
  earth-surface MERGED TOTAL 21.2 ms/frame (p90 29.8), foreground:0·NEAR0 3.9 ms (19%).
  solar-system MERGED TOTAL 21.9 ms/frame (p90 28.4), hdr·NEAR0 4.1 ms (19%).
  Full outputs: perf-baseline-earth-surface.txt / perf-baseline-solar-system.txt in this workspace.
  Apple Silicon caveat applies (slot sums inflated); T8 compares MERGED TOTAL + foreground:0·NEAR0, same flags.
Task 4: complete (commits 551f6235..fe7dbc16, review clean)
Task 4: minor (deferred): packAtmosphereUniforms.ts:2 JSDoc opening still says "112-byte" (rest of header updated to 176/44) — T12 comment-audit sweeps it.
Task 5: implementer DONE (commit 03ba5f7b1, build + suite 7556 green); review dispatched. Rider fix (vertex.wesl comment) included.
  Implementer nuance flagged to reviewer: extraction moved the outside wall-duty discard AFTER the full march (old code short-circuited earlier) — latent perf shape change on the outside path; T8 measures it.
Task 6: dispatched (BASE 03ba5f7b1; files disjoint from T5's open review).
Task 5: complete (commits fe7dbc16..03ba5f7b, review clean)
Task 5: reviewer judgment on extraction nuance: outside-path wrong-wall fragments now run full LUT/ring work before discard — real perf-shape change, visually identical, correctly deferred to T8's measurement; a cheap-early-exit split is the named fix IF T8 regresses.
Process incident: T5 reviewer used bare `git stash` (banned — shared stack) mid-review; verified after: stash stack intact (5 foreign entries untouched), working tree clean. No damage. Future reviewer dispatches must carry the no-stash rule.
Task 6: implementer DONE (commit 1e142da31, suite 7561 green, tsc clean); review dispatched. Deviation accepted pending review: blends hoisted to named consts for referential sharing.
Task 6: complete (commits 03ba5f7b..1e142da3, review clean; blend-hoist deviation ratified by reviewer)
Task 7: complete (commits 1e142da3..86c0ee94, review clean; mock-deviation ratified by reviewer — layer dispatch logic runs unmocked, upstream cull separately covered)
Task 8: complete (measurement only). After @ 86c0ee943 vs baseline @ 551f62357, same flags:
  earth-surface MERGED 21.2 → 21.6 ms; foreground:0·NEAR0 3.9 → 3.9. solar-system MERGED 21.9 → 22.2/20.7/21.4 (3 runs); foreground:0·NEAR0 3.9 → 4.4/3.8/3.9 — the 4.4 was noise.
  Ruling: perf NEUTRAL within run-to-run noise (~0.5 ms); feature adds no measurable GPU cost; T5's outside-path discard-shape change did not materialize in numbers. For a feature (not an optimization), no-regression = pass; user sees these numbers at the T9 gate either way.
Task 9: AWAITING USER (visual gate). Dev server http://localhost:5174.
Entanglement-radar over branch diff (user-requested, 2026-08-31): 2 real knots, user approved fixing
  both on this branch — (F1) duplicated createShellPipeline/createInsideShellPipeline factories →
  fold to one parameterized factory; (F2) AtmosphereUniforms WESL↔TS layout has no parity test
  (template: nodeParamsLayout.test.ts) → add one. F3 (stale 112-byte docstring) already a T4
  deferred minor, T12 sweeps it. ONE sonnet implementer dispatched in background for F1+F2 as two
  commits; on its report: verify commits + tests, then review its diff (self or quick reviewer),
  ledger completion. Radar "already clean" list: sampleShellRay shared core, inside boolean binary,
  hoist left no stale derivation, sunIrradiance knot closed, fullscreenTri reuse.
Radar fixes: complete (F1 4f53c0cdd factory fold, byte-identical descriptors, 9/9 tests untouched;
  F2 67e88aea5 parity test drives the REAL packer with per-field sentinels against WESL-derived
  std140 offsets, mutation-verified once; typecheck clean both). Controller-reviewed both diffs:
  clean. HEAD now 67e88aea5.
PARKED 2026-08-31 (user ruling): branch must NOT land before the globe-camera refactor
  (Earth RTC surface camera, branch globe-camera, PR #634) is finished — near-surface flight is
  changing, so T9 (visual gate) and T11 (descent-fade tuning) would be judged against a camera
  about to be replaced; T10's visual/perf QA needs the same descent flying. Resume sequence when
  #634 merges: merge main into this branch → re-run T8-style perf spot check (--url from THIS
  worktree's server) → T9 → T10 → T11 → T12 → final review → /feature-done. Code state at park:
  T1-T8 complete + 2 radar fixes, suite green, typecheck clean, perf neutral.
UNPARKED 2026-09-01: #634 merged to main (9250245f8); origin/main merged into branch as 8de3e8e46.
  Ruling: T2's camPosLocal/sunDirLocal hoist onto AtmosphereDrawEntry is SUPERSEDED by #634's
  pose seam (ctx.bodyPose(bodyId).eyeRelBodyM + bodySlabCamLocal/sunDirLocal utils, metre-native)
  — resolution adopted main's structure wholesale (layer, skyview encode, drawList, entry type)
  and re-applied our three surviving deltas on top: sunIrradiance-free 8-arg packer (T1), invMvp
  via mat4d.inverse on the f64 composeBodySlabMvp result (T4), inside trigger + draw arg (T6/T7).
  Cost if wrong: none visible — camPosLocal util keeps other consumers (drawFlooredSpherePick).
  Layer test resolved as union: main's per-row suite + our inside/outside dispatch (driven through
  the mocked bodySlabCamLocal) + invMvp inversion sanity. Deep-inside drawList invariant re-added
  onto main's test base. Stale packer docstring (T4 deferred minor) fixed in the merge resolution
  — T12's sweep item done early. Typecheck clean, FULL suite 7855/7855 green post-merge.
  Post-merge perf: first solo runs read 26.2/24.1 ms (alarm) → paired A/B vs a scratch worktree
  at main 9250245f8 (perf-skill recipe, alternating runs): earth-surface main 21.6 vs branch 19.5,
  solar-system main 22.5 vs branch 20.6 — branch ≤ main, solo runs were warm-up noise.
  Ruling: perf NEUTRAL post-merge. Scratch worktree + its server removed.
  Next: T9 visual gate (USER) on http://localhost:5174 (hard-refresh; if 504 Outdated Optimize Dep,
  restart the dev server) → T10 → T11 → T12.
T9 finding (user, 2026-09-01): HARD SWITCH at the inside/outside boundary (~98.64 km altitude —
  confirms threshold sits exactly at the shell top: params top 6471 km vs HUD radius ~6372.4 km).
  Diagnosis: sampleShellRay is shared/continuous, so the pop is geometric — the 128×64 proxy's
  facet sag (~6e-4·R ≈ 4 km on Earth) puts the camera inside the POLYHEDRON while still outside
  the true sphere; near-wall (ground-haze) fragments vanish, then the trigger snaps them back.
  Ruling: move the handoff to hypot < 1.005 (render-path selector, not geometric predicate) — the
  full-screen path is exact for any camera position, both paths are pixel-identical above the sag
  band, so the switch becomes invisible. DEVIATES from spec §4.1's '< 1' — evidence-driven; cost
  if wrong: none (margin regime has no occupying bodies, depth 'always' safe there).
  Fix dispatched to sonnet implementer (isInsideAtmosphereShell + test probes 1.004/1.006 +
  fragment.wesl/layer comment touch-ups). On report: verify, review diff, re-present T9.
T9 fix round 1 landed 1786177b9 (margin 1.005) — user STILL saw a jump, now at 130.78 km = the
  new threshold. Built a headless probe (jump-probe.mts in this workspace — perf-harness pose seam,
  screenshots straddling the handoff, sharp pixel diff; splash must be clicked away, ESC kills the
  Earth focus and blanks the scene, night side hides everything: aim day side yaw 4.5273).
  Probe REPRODUCED: inside path luma 128 vs outside 69, uniform grey veil = also the user's
  'washed out' complaint. ROOT CAUSE: insideRayDir unprojected at NDC z=0 — the FAR plane under
  reversed-Z — w→0, f32 divide degenerates every pixel's ray to ~one direction → sky-view LUT
  veils the frame. FIX e7a7f9b2a: unproject at mid-frustum z=0.5; probe after: luma 67.5 vs 67.6,
  cross-handoff diff 7.5 (= sim-clock rotation drift only). Margin fix 1786177b9 stays (real,
  orthogonal). Evidence artifact (before/after captures):
  https://claude.ai/code/artifact/4e5fd214-9021-4948-b7a8-1c42f032b70c
T9 fix round 3 (user: flicker near surface, worse with depth — asked camera-rework vs fix-now;
  answer: fix now, NOT camera work — body-slab pose is already metre-native): z=0.5 unproject put
  the point ~2×near from the camera (reversed-Z z is near/dist), so p−camPosLocal became a
  metres-scale difference of unit-scale f32 vectors → shimmer growing on descent. FIX ee5485a74:
  homogeneous far-point form normalize(P.xyz − cam·P.w), sign of P.w folded in, no divide-by-w,
  no near-equal subtraction; supersedes the z=0.5 half-fix (veil AND shimmer both stem from the
  same conditioning). Probe: 6 km same-pose diff max 104→30 (zero px>30), clamped-surface pose
  bit-stable (1.03), handoff diff == temporal noise, lumas matched. Residual ~1-2Hz global luma
  oscillation (83.7↔81.3, both paths, pre-existing — clouds/twinkle?) noted, NOT ours.
T9 descent seam: USER CONFIRMED FIXED 2026-09-01 (post ee5485a74).
PACKAGING RULING (user, AskUserQuestion 2026-09-01): LAND V1 FIRST — #631 lands with the sky-view
  approximation (down-view washout = known limitation, wait for froxels); froxels = OWN spec+PR
  off post-#631 main. Froxel ground-explorer report → save to this workspace for the future spec
  (froxel-ground-report.md). Sequencing herein: T10 → remaining T9 sub-checks (night side, labels,
  Mars/Titan) + T10 QA in one user pass → T11 (globe-fade only; washout tuning OUT, froxels' job)
  → T12 → final review → /feature-done.
MERGE RULING (user, 2026-09-01, SUPERSEDES the pin-and-split idea from the same conversation):
  T10 AND T11 RIDE #631 — no branch surgery, no follow-up PR for them. Sequence: T10 lands +
  task review → user visual pass (cloud deck + leftover T9 sub-checks) → T11 (user in loop,
  globe-fade only) → T12 full gate + /feature-done → squash-merge #631. Follow-up PR = FROXELS
  ONLY (own spec, backlog detail already captured). The opus final review dispatched on pinned
  b8290f982 stays useful as an interim pass; before merge, EXTEND it with a scoped review over
  the T10/T11 commits (or re-run whole-branch) so the final gate covers the full diff.
Interim final review (opus, diff @ b8290f982): VERDICT no correctness/lifecycle/contract defects;
  7 doc/comment/test-hygiene findings (~30 lines): (1) backlog hoist detail + spec §5a claim the
  reverted T2 hoist — rewrite "superseded by #634 pose seam, still open"; (2) atmosphereShellLayer
  header lacks the two-path split + says greater-equal unconditionally; (3) plan-task refs in
  shell/vertex.wesl:70 + fragment.wesl:323 ("froxel-adjacent" factually wrong); (4) sampleShell
  identity-on-discard comment false post-extraction (zero fields at :288,292 or narrow comment);
  (5) packAtmosphereUniforms.ts:73 "cam+irr" crumb + shellRenderer.test.ts:129 Float32Array(28)
  → ATMOSPHERE_UNIFORM_FLOATS; (6) add reversed-Z unproject landmine to docs/RENDERER.md
  bitten-before section; (7) delete well-clear isInside test case + fix contradictory invMvp test
  comment. Handling: ONE batched fix dispatch (cheap model) AFTER T10 lands (avoid index race),
  then scoped re-review; reviewer confirmed T10/T11 need their own scoped pass before merge.
Task 10: implementer DONE (commit 72622160d; cull pair back/front + inside arg, insideShell on
  CloudShellDraw, fadeEndAltitudeRadii 0.037→0.0005 ≈3.2 km with rationale, new renderer test;
  full suite 7859 green, typecheck clean; perf +0.36 ms only inside ~13 km — no halt; headless
  descent QA continuous, manual look still owed to user). Task reviewer DISPATCHED (package
  review-b8290f982..72622160d.diff) ∥ final-review-findings fixer DISPATCHED (7 items, one
  commit, disjoint files). NOTE: T10 agent left a dev server on :5177 — ours is :5174.
Task 10: complete (commits b8290f98..72622160, review clean — spec APPROVED + quality APPROVED,
  zero findings; reviewer verified pipeline-pair factory idiom, insideShell threshold correctly
  unbuffered — exact mesh, no facet-sag gap — and no double-draw from inside a convex shell).
  Remaining before merge: fixer commit + scoped re-review → user visual pass (T10 QA + T9
  residuals) → T11 (user) → T12 gate → squash-merge.
Final-review sweep: complete (efbfc9099, all 8 items incl. identity-reset in wall-duty branches;
  controller-reviewed diff + WESL compile/render smoke via probe — clean; typecheck + touched
  tests green). Pushed through efbfc9099. AWAITING USER visual pass (:5174, hard-refresh):
  (1) cloud deck from below — day side, descend through ~12.7 km shell + ~3.2 km fade floor,
  no vanish/pop; (2) T9 residuals — night-side star washout/return, labels crisp, Mars + Titan
  sanity. Then T11 (globe-fade judgment only) → T12 (full suite/typecheck/comment-audit/
  deletion-audit/DoD/ledger archive) → extend final review over 72622160d+efbfc9099? (already
  self-covered: T10 had its own clean review, sweep controller-reviewed — judge at T12) →
  squash-merge #631 → froxel spec next (backlog detail seeds it).
T10 visual QA: USER CONFIRMED 2026-09-01 within camera limits ("can still not look up" — the
  look-up-at-deck-from-below view is unreachable with the orbit camera, same accepted gap as
  horizon viewing; re-judge after RTC camera spec 2 lands free-look).
User ruling (mid-T9): washout follow-up = PROPER FROXEL aerial perspective, not tuning — needs
  brainstorm/spec (design pass AFTER the jump settles); sequencing: T9 re-check → froxel spec/plan
  → visual gates (T11 tuning pre-froxel would be wasted). Horizon viewing: impossible with orbit
  camera (always looks at pivot) — accepted T9 gap until RTC camera spec 2; XR head-look is the
  interim horizon test.

## Resume map (if compacted)

In flight: T6 task reviewer (handling: clean → ledger `Task 6: complete`, dispatch T7 implementer
with BASE 1e142da31, brief task-7-brief.md, standard implementer contract + no-stash rule + note
that tsgo is not installed; findings → fix loop, resume T6 implementer rounds 1-3).
Dev server for this worktree: http://localhost:5174 (background shell bzm0v92q7) — T8/T10 perf runs
MUST pass --url http://localhost:5174, same flags as T3 (--scenario earth-surface / solar-system,
--frames 30). Baselines + full outputs in this workspace.
After T7 clean: T8 perf checkpoint (halt rule; compare vs T3; also judge T5's outside-path
discard-shape change) → T9 visual gate (USER) → T10 (brief not yet extracted — run task-brief 10)
→ T11 (USER in loop) → T12 (comment-audit incl. deferred minors above; sdd-execution Rule 3:
archive this ledger to docs/superpowers/plans/completed/ BEFORE rm -rf workspace; then /feature-done).
Task board artifact (update on task close): https://claude.ai/code/artifact/0d1a0d78-093b-4384-8d7a-0db662add957
Implementer dispatch boilerplate carried so far: worktree path, brief+report paths, no subagents,
no push, no git add -A, Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>, house rules, tsgo absent.
Task board artifact: https://claude.ai/code/artifact/0d1a0d78-093b-4384-8d7a-0db662add957 (mirror of this ledger).
