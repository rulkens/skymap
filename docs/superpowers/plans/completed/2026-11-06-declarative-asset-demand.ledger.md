# SDD ledger — plan: docs/superpowers/plans/2026-11-06-declarative-asset-demand.md

Spec: docs/superpowers/specs/2026-11-06-declarative-asset-demand-design.md
Branch: worktree-optimize-gpu-loaded-data · base 451e9a1e0
Prep PR: #1072 (prep/gated-slots-release-gpu) — Tasks 4–7 wait for its merge + `git merge main`.

Ruling: perf gate OFF for PR A — no renderer/shader change; the evaluator replaces per-row predicates one-for-one at ~40 rows per rendered frame — cost if wrong: an unmeasured per-frame CPU regression, caught by PR B's perf pass.
Ruling: parallelism = one plan, serial dispatches in this worktree — PR B depends on A's shape — cost if wrong: none (latency only).

## Pre-flight scan
| Pair / task | Shared | Finding |
|---|---|---|
| T1 → T2 | `bandDistanceMpc` signature | consistent |
| T2 → T3 | `evaluateAssetDemand(row, ctx, entries)`, `assertAssetDemands` | consistent; T3 calls assert in createLayers |
| T3 → T4–7 | every row file + its test | T3 wraps as `fn`, T4–7 replace; consistent |
| T4 ↔ prep #1072 | `cosmicWebDensityAssetRows.ts:1-5` header | prep already rewrote the stale "load-once" header — T4's deletion line may be moot; implementer checks after merge |
| each task | self-consistency | clean |

## Dispatches
Dispatch 1: Tasks 1–3 · opus · BASE 451e9a1e0 · running
Task 1: complete (e48e06ab4)
Task 2: implemented (4efb60eb4) — awaiting mid-branch review
Task 3: implemented (4ad2d2db8) — awaiting mid-branch review
Deviations (implementer): resolveAssetDemand.ts + 3 types + WeakMap resolution cache; gates string = any item (spec); assert after visibilityEntries composed; demand+release both evaluated every pass.
Dispatch 2: mid-branch review Tasks 2–3 · opus · 451e9a1e0..4ad2d2db8
Landing: merged origin/main (prep #1072 → 6992c265f) into branch at e38fa666e; typecheck:fast clean
Review (Tasks 2–3): Spec ✅, quality Approved, 5 minors.
Task 2: complete (4efb60eb4, review clean; minors folded into dispatch 3)
Task 3: complete (4ad2d2db8, review clean; minors folded into dispatch 3)
Ruling: take minors #2 (assert item names + itemless-shown/itemed-label hole), #3 (drop the WeakMap cache + shared verdict constants — unmeasured speed-up, code is liability), #4 (two stale predicate headers), #5 (createLayers comment as a why) as one fix commit before Task 4 — cost if wrong: an unmeasured per-frame resolve cost, priced by PR B's perf pass.
Ruling: minor #1 (release throw skips enqueue/drop edges) accepted with one line in the evaluator header — no throwing release exists; PR B's size gate must not throw — cost if wrong: a stale queued fetch in PR B.
Ruling: Task 7's mid-branch review merges into the whole-branch review (it is the last task) — cost if wrong: none; the same reviewer sees the same diff.
Dispatch 3: fix commit + Tasks 4–7 · opus (resumed implementer) · BASE e38fa666e
Dispatch 3 done: fix cb2ce7772, Task 4: complete (282e32c64), Task 5: complete (5844a5825), Task 6: complete (e7bd76ed1), Task 7: implemented (eb1056819)
Ruling: density cubes now also read their section switch (cosmicWebDensity.enabled) via visibilitySwitchOf, as the draw does — fetch agrees with fade — cost if wrong: a cube with the section off but item on no longer preloads.
Task 5: hasSectionSwitch('structures') false → no behaviour change.
Dispatch 4: whole-branch review · opus · 084f2090a..eb1056819
Final review: Fix first — I1 (gaia pool not freed on release), I2 (singleton-overlay-layers.md teaches demand(ctx)), M1–M7, pre-existing dead satellites test, ⚠️ galaxy toggle-off vs selected galaxy.
Ruling: I1 fixed in this PR (release(source) on the octree pool host, called from gaia onRelease) rather than accepted — the owner asked for freed VRAM, and toggle-off release without it only buys a refetch — cost if wrong: touches octree pool code the GLADE-octree draft (#932) also edits; a merge conflict there.
Ruling: take all minors M1–M7 plus deleting the never-failing satellites gates test in the one fix wave — all cheap, M3/M4/M5 pin flagged/review-focus behaviour — cost if wrong: a few extra test lines.
Ruling: ⚠️ selection vs released catalog → fixer traces; fixes only a throw or stale InfoCard, else reports — cost if wrong: a selected famous galaxy loses its card on toggle-off (same as cold-boot-off).
Dispatch 5: final fix wave · opus (resumed implementer) · FIX_BASE eb1056819
Dispatch 5 done: I1 b3bbef2ed (~12 src lines: octreeCutGpu.release exposed, star renderer release, OctreePoolHost.renderer.release), rest 30fa9a080. ⚠️ trace: galaxy toggle-off degrades like cold-boot-off, no throw (selection row returns null for a released source).
Dispatch 6: scoped re-review · sonnet · eb1056819..30fa9a080
Deletion audit: ~205 LOC safe-now (mostly row tests restating declarations), ~16 needs-ruling.
Ruling: apply the safe-now bin as one deletion commit, including the M3 density section test the final review asked for — it restates visibilitySwitchOf.test.ts:18 + the evaluator's release-on-off test (testing.md wins over the review's "pin every flagged change") — cost if wrong: a row whose `gates` item is edited by mistake no longer fails a row test.
Ruling: keep the `release ≥ lead ≥ 1` assert — PR B adds ~6 more near literals; zero runtime cost — cost if wrong: 16 LOC.
Ruling: per-frame resolveAssetDemand cost priced by PR B's perf pass (already ruled) — cost if wrong: a small per-frame CPU cost until then.
Dispatch 7: deletion commit · sonnet (fresh)
Dispatch 7 done: 036923b78 (−233 net, tests only + 1 header + 1 backlog line)
Task 7: complete (eb1056819, whole-branch review + fix wave 30fa9a080 re-reviewed clean)
Done audit: READY pending CI + owner smoke checks; plan → completed/, spec stays (PR B).
