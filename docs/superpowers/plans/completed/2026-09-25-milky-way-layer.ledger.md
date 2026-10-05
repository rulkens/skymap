# SDD ledger — plan: docs/superpowers/plans/2026-09-25-milky-way-layer.md

Spec: docs/superpowers/specs/2026-09-25-milky-way-layer-design.md · Draft PR #826 · branch worktree-milky-way-layer-v2
Answers (user, 2026-09-25): execution = lean SDD (dispatch A = T1–T2, dispatch B = T3–T4, T5 inline, one final review; mid-branch reviews for review:yes T2, T4); parallelism = this plan alone; perf gate = none.

## Pre-flight scan

| Pair / task | Shared file or interface | Finding |
|---|---|---|
| T1 → T2 | `milkyWayCloudRenderer.ts` (T1 extracts the const, T2 moves the file) | consistent: T1 must land first; same dispatch A |
| T2 → T3 | `layer.ts` (T2 creates it, T3 adds members); `engine.ts` (T2 :161,188-192 seeds, T3 :30,330-333 label) | consistent, disjoint line ranges |
| T3 → T4 | `layer.ts` members | consistent |
| T2 → T4 | `MilkyWayRuntime` (T4 reads none) | none |
| T5 vs T2–T4 | docs name paths that T2–T4 produce | consistent: T5 runs last |
| T1 self | const + tool imports | consistent |
| T2 self | the `MilkyWayCloudRenderer.d.ts` move depends on the refs check | consistent (conditional by design) |
| T3 self | the label style/visibility moves are conditional | consistent |
| T4 self | text says "three `ui` entries" but lists two (debug + detailCard) | Ruling: two `ui` entries (debug, detailCard) — the text miscounts, and the list plus the ZoA template define it — costs nothing if wrong (the compiler and review catch a missing slot) |
| T5 self | no test by design | consistent |

## Progress
Dispatch A (T1–T2) sent, BASE 8755411d2, Sonnet.
Task 1: complete (8755411d2..e439e8c49, no review tag). Task 2: mid-branch review dispatched (Opus) on e439e8c49..f2e9de3a6; typecheck:fast green at f2e9de3a6.
Task 2: complete (e439e8c49..f2e9de3a6, review clean: Spec ✅, Approved). Deviation (c) is test-only: MAX_PROGRAM expands over FRAME_ORDER_PASS_NAMES stubs.
Task 2: minor (deferred): layer.ts:3-4 header false/process narration (dispatch B rewrites layer.ts header)
Task 2: minor (deferred): stale comments naming deleted state.gpu MW fields — GpuHandleRow.d.ts:8, renderFrame.test.ts:258, renderFrameSplitBaseline.test.ts:318, runFrame.test.ts:177-181
Task 2: minor (deferred): renderTargets.ts:47-49 diff narration; two headers point at a removed renderTargets row
Task 2: minor (deferred): runFrame.test.ts:875 + passes.test.ts "moved to" notes — delete
Task 2: minor (deferred): @types half-move — MilkyWayPickRenderer/MilkyWayCloudDrawArgs also Layer-only readers; move all or none
Task 2: minor (deferred): frame.test.ts third case asserts two constant falses — delete
Task 2: minor (deferred, optional): timedSlotsOf.test.ts could reuse FRAME_ORDER_PASS_NAMES stubs
Task 2: minor (deferred): oversized headers carried from moved files — /feature-done comment sweep
Dispatch B (T3–T4) sent, BASE f2e9de3a6, Sonnet.
Tasks 3–4: implemented a357fc062, 5c43a3d4f + fix a21b592ed; deviations: css git mv + hand paths; DebugPanel MW section order now composition order; extra fixtures. Mid-branch review dispatched (Opus) f2e9de3a6..a21b592ed.
Task 5: complete (inline, 881dd10bd); RENDERER.md had no stale MW path.
Tasks 3–4 review: Spec ❌ (I1), Needs fixes. I1: #focus=milkyWay boot deep link now waits for first catalog (Layer selection row appended after the boot hash read). I2: 4 stale "watchTierSaga re-seeds starCount" comments (MilkyWayTuning.d.ts:68, MilkyWayCloud.d.ts:13, milkyWayCalibration.ts:39, v1/README.md:83).
Ruling: I1 fixed in core — resolveFocusRefDeferringSaga also wakes on engineStatusChanged (wireSlots dispatches 'loading' right after createLayers), restoring boot-window resolution for every Layer-owned selection row (MW, ZoA) — keeps spec's behaviour-neutral promise — costs one redundant re-resolve per status change if wrong.
Tasks 3–4: minor (deferred): re-seed saga comments over budget; "moved verbatim from" headers (fade rows + 2 tests); engine.ts:321 core comment names milkyWay; watchTierSaga negative assertion skipped (ratchet covers).
⚠️ tier change before createLayers skips reseed — controller check pending.
Fix round 1/5 for Tasks 3–4 dispatched (fresh Sonnet; dispatch B agent at ~300k context), FIX_BASE 881dd10bd.
Ruling: ⚠️ tier-change-before-createLayers parked — setTier is only put by watchTierSaga on a user requestTier (or the perf hook); the boot tier is initial state, not an action, so only a tier-chip click during the GPU-init window skips the reseed — costs a star count one tier stale until the next tier change if wrong.

## Resume map (written 2026-09-25 for compaction)
In flight: fix-round-1 implementer (Sonnet, bg) for the Tasks 3–4 review, FIX_BASE 881dd10bd. It fixes I1 (resolveFocusRefDeferringSaga + watchSelectionRowsSaga also wake on engineStatusChanged, with a failing-first test), I2 (4 stale watchTierSaga comments) and the T3–4 minors. It commits one `fix(milky-way): …` and appends `## Fix round 1` to task-3-4-review.md.
Next, in order:
1. On its return: `bash <sdd skill>/scripts/review-package docs/superpowers/plans/2026-09-25-milky-way-layer.md 881dd10bd HEAD` → scoped re-review (re-review-prompt.md, Sonnet) of I1/I2 → ledger `Tasks 3–4: fix round 1/5 …`, then `Task 3/4: complete`.
2. Final whole-branch review (Opus): review-package over `git merge-base main HEAD`..HEAD; point it at every `minor (deferred)` line above; mandate = spec fidelity + slop. Then ONE fix dispatch plus one scoped re-review.
3. Push, bg `gh pr checks 826 --watch`, report CI. Then ask the user for the eye-check (DoD smoke list in the plan). Then /feature-done (deletion audit, plan + spec → completed/). NEVER merge without an explicit "merge this PR".
4. Final message lists every `Ruling:` line in this ledger.

Tasks 3–4: fix round 1/5 — 299bde7c2 (I1 resolver wakes on engineStatusChanged + red-first test; I2 4 stale comments; M1–M3). Scoped re-review (Sonnet) in flight → task-3-4-rereview.md. On CLEAN: `Task 3/4: complete`, then Resume map step 2 (final Opus review).
Task 3: complete
Task 4: complete (re-review CLEAN, task-3-4-rereview.md)
Final review (Opus) dispatched over d415deefd..299bde7c2 → final-review.md. Next: ONE fix dispatch (Sonnet) + one scoped re-review, then push + CI.
Ruling: final-review I1 — move `milkyWayLayer` to LAST in `src/compositions/app.ts` and amend spec §5.1 to "loses equal-prominence ties to every earlier label producer (structureLabels, Layer labels such as famousLabels)" — last restores the pre-port DebugPanel order (MW after all Layer sections), and the label tiebreak the user accepted is the same kind of loss — costs one line move if the user wants it elsewhere.
Final review: 0C/3I/8M (final-review.md). ONE fix dispatch (Sonnet): I1 per ruling, I2, I3, M1–M6 per the review's table; M7–M8 + oversized carried headers dropped/→ /feature-done.
Final fix wave — 29d8428c6 (I1–I3, M1–M6; full suite 1415/14727 green). Scoped re-review (Sonnet) → final-rereview.md. On CLEAN: push, bg gh pr checks 826 --watch, eye-check ask, /feature-done.
Final re-review: CLEAN but for aggregate-target header ratio → fixed inline 6be36f9ec. Pushed; CI watch running. Next: eye-check ask → /feature-done.
Merged origin/main (blackHoles #825, #821, #819) → b8aec2278; 6 conflicts (list edits) resolved, suite 1421/14900 green; pushed, CI watch running. Eye-check asked in dash (oJ1y), dev server :5174.
CI GREEN on b8aec2278 (typecheck·test·format + Workers Builds). Waiting: eye-check (dash oJ1y) → /feature-done.
Deletion audit (deletion-audit-branch.md): ~−300 src / −235 tests. Safe-now → Sonnet agent in flight.
Ruling (user, 2026-09-26): R1 delete milkyWayVisible + test; R2 delete milkyWayLabelAlpha, band as a constant in the label code; R3 KEEP pick null-device path (match other renderers); R4 KEEP targetFormat option; MW info card richer content → backlog (facts unspecified).
Safe-now a1ea4da61 (src −202, tests −91); R1+R2 750f14cf8 (+34/−195), full suite 1419/14879 green. /feature-done READY → completion commit.
