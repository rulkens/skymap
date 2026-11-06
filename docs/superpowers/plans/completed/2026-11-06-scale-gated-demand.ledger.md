# SDD ledger — plan: docs/superpowers/plans/completed/2026-11-06-scale-gated-demand.md

Spec: docs/superpowers/specs/completed/2026-11-06-declarative-asset-demand-design.md (PR B section)
Branch: feat/scale-gated-demand · base d500ceaba (+ docs 38e808aa4, 8fb7be511, eb7a93c6d, 429d7d30e)
Owner answers (XdbY): plan approved; perf gate ON. Parallelism: one plan, serial.
Baseline perf: scratchpad perf-before.txt (server :5174 at 429d7d30e = d500ceaba code), taken before any dispatch.

## Pre-flight scan
| Pair / task | Shared | Finding |
|---|---|---|
| T1 → T5 | `edge: 'both'`, band-items rule | T5's localBubble + famous exemption depend on T1; consistent |
| T2 → T3 | `ctx.drawPxPerRad` | consistent |
| T3 → T4 | `SizeGate`, evaluator `size` | consistent |
| T4 ↔ T5 | `demandTable.test.ts` | T4 runs it, T5 extends it; serial, fine |
| T5 ↔ T6 | `starCatalogAssetRows.ts` not in T5 | T6 alone edits it; fine |
| T6 | band vs old crossfade | T6 pastes old values as literals before deleting `starCrossfadeOpacity`; self-consistent |
| each task | self-consistency | clean |

## Dispatches
Baseline (429d7d30e): earth-surface MERGED 15.9/16.7 ms, GPU 725.5 MB (venus surface 42.7, moon surface+normal 85.4); local-group 8.5 ms; full-survey 27.8 ms; perf:cpu full-survey plan:galaxy-catalog 0.492 ms. Shot: scratchpad before-earth-boot.jpg.
Dispatch 1: Tasks 1–3 · opus · BASE 429d7d30e · done
Task 1: complete (5b3194a93)
Task 2: implemented (b26bac9fc) — mid-branch review
Task 3: implemented (8a1b0a20e) — mid-branch review
Deviations: multi-item rows gated only if ALL items in band.items; inMpc/outMpc resolution; FrameOutputs.drawPxPerRad mutable, written in place by runFrame; size holds at drawPxPerRad 0; missing body state releases; site via positionDriverOrNull(id).kind === 'surfaceFixed'; module-level body Map.
Dispatch 2: mid-branch review Tasks 2–3 · opus — Spec ✅, Changes requested (1 Important, 6 Minor, 3 ⚠️)
Ruling: drawPxPerRad moves from FrameOutputs to EngineState (beside fadesAnimating/layersLoading, runFrame-owned last-frame facts) — the spec said FrameOutputs, intent (runFrame writes, buildDemandCtx reads) kept; removes the camera-step carry + readonly break — cost if wrong: none found.
Ruling: drop maxDrawPxPerRad util + tests, inline the max in runFrame — captures never reach `views`, so the filter is speculative — cost if wrong: a future capture-in-views would inflate demand px (a load too early, never a missed load).
Ruling: one encoding for "band doesn't gate" (band: undefined); missing body and missing host both release (consistency) — cost if wrong: none (unreachable today).
Ruling: module body Map stays — negligible — cost if wrong: none.
⚠️ to trace: runFrame's early return before views (runFrame.ts ~178) vs readiness waiting on a size-gated asset (Earth surface) → possible boot deadlock; fixer traces and fixes if real.
Dispatch 3: fix round 1 · opus (resumed implementer) → 5fab8d711. Deadlock trace: none (isEngineReady checks booted/renderTargets/compositor only; boot awaits no asset slot).
Ruling: accept "size-gated rows demand from frame 2; a fully-at-rest scene after frame 1 could sleep first" — same latent class as cameraPosMpc (last frame's pose) since before PR A; boot always has fades/slot-ready wakes — cost if wrong: a size-gated texture waits for the next wake (input, 500 ms clock tick).
Dispatch 4: scoped re-review fix round 1 · sonnet · 8a1b0a20e..5fab8d711
Dispatch 4 result: 6/6 ADDRESSED, no new breakage.
Task 2: complete (b26bac9fc..5fab8d711, fix round 1/5 addressed)
Task 3: complete (8a1b0a20e..5fab8d711, fix round 1/5 addressed)
Dispatch 5: Tasks 4–5 · sonnet (fresh) · BASE 5fab8d711 → Task 4: complete (828b525b8), Task 5: complete (8b2993a1f); review at whole-branch.
Ruling: a size-only row (no shown/gates/near) counts as shown — bodies have no draw switch; a row with neither switch nor size still throws — cost if wrong: a body texture can't be toggled off by a setting (true before too).
Ruling: constellation release pose at 2 Mpc (1 Mpc sits on the 100× edge) — cost if wrong: none.
Dispatch 6: Task 6 Gaia band · opus (fresh) · BASE 8b2993a1f → 3bc5fe9a9 (old crossfade was 1−smoothstep(8,25 kpc): band identical, max diff 4.4e-16). Deviations: planner hasDistanceBand: true; crossfade→opacity rename; fieldStarSpherePass now fades with Gaia past 8 kpc (behaviour change, flag to whole-branch review).
Ruling: Task 6's mid-branch review folds into the whole-branch review (next step after perf) — cost if wrong: none.
Task 7: perf after (HEAD 3bc5fe9a9): GPU earth-surface 725.5→542.2 MB (−183; venus+moon textures gone), heap 180.6→107.6 MB; solar-system 341.5→286.2 MB; local-group/full-survey 338.5→288.4 MB. Frame: earth-surface 15.9→16.0, solar-system 9.6→10.5, local-group 8.5→8.0, full-survey 27.8→22.5 ms (all inside MERGED ±5 ms drift). perf:cpu plan:galaxy-catalog 0.492→0.434 ms; no demand row above 0.1 ms → per-frame resolve priced, no cache needed.
Dispatch 7: whole-branch review · opus · d500ceaba..3bc5fe9a9 → Fix first: 1 Critical (survey-galaxy focus by id never resolves from Earth: a galaxyCatalog ref needs a committed record, so `selected` can't lift before the load — deep links #focus=pgc-N, website "Open PGC 2", palette Enter before commit, remote focus), 4 Minor. Task 6 holds (fieldStarSphere fade ≥ 0.86, harmless).
Correction: the pending focus id IS in state (`selectPendingFocusId`); galaxy ids are claimed by prefix before load (SelectionKindRow.focusId.claims).
Owner direction (chat): loading an id of a layer that isn't loaded switches that layer on, like the layers= gate.
Ruling: (a) `selectedKinds` also holds the kind whose row `focusId.claims` the pending focus/select id — no new DemandCtx field; (b) watchSelectionRevealSaga also reveals on the pending request (claiming kind → entry `selects` → same section-switch write) — cost if wrong: a pending id of a hidden kind turns its section on before resolving (same as after resolving today).
Dispatch 8: final fix wave · opus (fresh) · FIX_BASE 3bc5fe9a9
Owner (chat): "any deep link of a layer that is not loaded should enable that layer — same with stars".
Dispatch 8 done: ba4e230fd (critical + generic lift), 98f95d3db (minors). Claims before load: pgc-/sdss-/pos@/famous names/star-/satellite- all prefix or fixed list → fine. Contract grew: SelectionResolver.claimedKind(id) (SagaContext) → owner consent ask. 3 tests already broken at 3bc5fe9a9 (createLayers.composition row without shown/gates; 2 wireSlots: no `ui`, expect survey at boot).
Ruling: fix the 3 broken tests to the new behaviour (composition row gets `gates`/`size`; wireSlots state gains `ui` and expects no survey catalogs at the Earth boot pose) — cost if wrong: none; they encode pre-PR-B boot.
Dispatch 9: broken-test fix · sonnet · BASE 98f95d3db → d5fadb5f7 (composition row 'always'; wireSlots only lacked `ui` — fixture pose is distance Infinity, survey still loads there, expectations unchanged).
Dispatch 10: scoped re-review fix wave · sonnet · 3bc5fe9a9..d5fadb5f7
Ruling: the `selected` lift becomes implicit — scale gates lift whenever selectedKinds overlaps the shown entry's `selects`; `'selected'` leaves the alsoWhen union — cost if wrong: a selected kind keeps every row of that layer loaded at any scale (intended).
Dispatch 10: re-review → all 6 ADDRESSED; residual Important: buildDemandCtx duplicated the claims walk (no multi-claim throw).
Ruling: fixed inline by the controller (<50 lines, lean protocol): `claimingSelectionRow` utils helper shared by composeSelectionRows and buildDemandCtx → 555089266 — cost if wrong: none.
Owner (xJcq): SelectionResolver.claimedKind allowed.
CI fail 1: website roadmap row 'fetch-by-scale' named the deleted backlog line → row dropped (4fb7bb7b3, shipped).
Done audit: deletion-audit dispatched · opus
Deletion audit: ~64 LOC safe-now (tests + comments), ~40 needs-ruling (Gaia parity table, starCatalogVisible inline, satellites distance tests, alsoWhen array→flag) → owner ask with smoke checks.
Dispatch 11: safe-now bin · sonnet
Done audit: READY pending CI + owner smoke checks; plan + spec → completed/.
