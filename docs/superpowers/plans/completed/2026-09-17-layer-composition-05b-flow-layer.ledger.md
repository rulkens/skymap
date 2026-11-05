# SDD ledger — plan: docs/superpowers/plans/2026-09-17-layer-composition-05b-flow-layer.md

Worktree: `.claude/worktrees/layer-composition-05b-flow`, branch `worktree-layer-composition-05b-flow`, PR #750 (draft).
Protocol: lean (`docs/superpowers/conventions/sdd-execution.md`) — CI is the gate, one whole-branch review at the end.

## Plan-start answers (2026-09-17)

- Parallelism: **just this PR**. Serial dispatches in this worktree, no isolation agents.
- Perf gate: **no**. Pure relocation — same renderer, same compute dispatch, same gates.

Ruling: no mid-branch `review: yes` review — the plan carries no such tag, and the
protocol puts tagging at authoring time so the controller does not decide it ad hoc.
Cost if wrong: a contract defect in Task 1 (`executeFrame` resolve, `Layer.ui` reshape)
surfaces only at the whole-branch review instead of mid-branch — one extra fix round.

## Dispatch grouping (3 dispatches, 7 tasks)

- **D1 = Task 1** — the contract extensions (`computes`, `ui: { settings, debug }`). Core-only; shares no file with the rest. 2 commits.
- **D2 = Tasks 2–4** — relocate the modules, mint the Runtime, write the Runtime-bound contributions. All inside `src/layers/flow/`. 3 commits.
- **D3 = Tasks 5–6** — form + compose the Layer, then delete core's holdings. Same mental model; the deletions only typecheck once composition lands. 2 commits.
- Task 7 (manual smoke) is the user's, not a dispatch.

## Pre-flight conflict scan

| Pair | Shared surface | Finding |
|---|---|---|
| T1 → T2 | `src/services/engine/frame/computes/flowCompute.ts` created by T1, moved by T2 | Clean — the Moved table names it explicitly and says T1 creates it out of `encodeFlowCompute.ts`. |
| T1 → T5 | `Layer.computes?`, `Layer.ui` | Clean — T5 consumes exactly what T1 produces. |
| T1 → T6 | `computes/index.ts` (`CORE_COMPUTES`) holds flow's row temporarily | Clean — T6 Step 1 deletes it by name. |
| T2 → T4 | `flowCompute.ts`, `flowFieldPass.ts` moved by T2, rewritten as factories by T4 | Clean. |
| T3 → T4/T5 | `FlowRuntime` | Clean — T4 and T5 both close over it. |
| T5 → T6 | `gpu.flowFieldRenderer` still read by core until T5 composes the Layer | Clean by ordering; T6 is explicitly "delete what core no longer holds". |
| T1 self | Part A tests vs Part B no-test | Consistent — Part B is a type reshape the compiler checks end to end. |
| T6 self | `shouldKeepTicking` flow term deleted, covered by `Layer.frame` | Consistent; T7 smoke attests it. |

Scan clean — no rulings needed.

## Log
- D1 (Task 1, contract extensions) dispatched — Sonnet, BASE bde739ecd. Status: running.
- D1 (Task 1) **complete** — Sonnet, 166 tool uses, bde739ecd..fffef54f6, 2 commits (`d5e4d6d1c` Part A, `fffef54f6` Part B), 32 files, +468/−209. typecheck:fast clean; full suite 8693/8693 (3 pre-existing `earcut` failures in `tools/scene-recon`, unrelated).
  Deviations named by the implementer, all accepted:
  1. `frameFilePurity` ratchet gained a `frame/computes` sweep (mirroring `frame/passes`) and `frame/executeFrame`'s row shrank 6→5 (the deleted `COMPUTE` table was one of its strays). Ratchet moved in the shrinking direction — correct.
  2. `checkFrameOrder` grew a `computes` param, forcing its one prod call site (`startLoop.ts`) and six test fixtures to pass `computes: CORE_COMPUTES`. Compile casualties of the contract change, not scope creep.
  3. `checkFrameOrder` counts passes and computes in SEPARATE maps — `flow` legitimately names both a pass and a compute row, and a shared counter would misread that intentional pair as a duplicate. Good catch; matches `computeTimingSlotName`'s header.
  4. `SettingsPanel.test.tsx` stub updated to `ui: { settings }`.
  5. `encodeFlowCompute.test.ts` kept at its old path, contents re-pointed at `computes/flowCompute.ts`. Carried into D2 as a hand-rename (`move-files` will not drag a test whose name no longer mirrors its source).
  Contract check by controller: `LayerUi` and `ContentCompute` match the plan's pinned shapes verbatim.
- D2 (Tasks 2–4, relocate + Runtime + contributions) dispatched — Sonnet, BASE fffef54f6. Status: running.
- D2 (Tasks 2–4) **complete** — Sonnet, 178 tool uses, fffef54f6..57debd071, 3 commits (`cec49388d` relocate, `46461a6b3` Runtime, `57debd071` contributions). Full gate run by the implementer: typecheck:fast, real `tsc`, `npm test` 8763/8763, `npm run build` incl. flow-workbench — all green.
  Deviations named by the implementer:
  1. `create.ts` takes no `fadeBgl` — the plan's Task 3 prose was wrong about `createFlowFieldRenderer`'s signature (`{ device, targetFormat }`; flow's fade opacity is a plain `draw()` argument). Implementer followed the code. **Plan defect, not an implementation deviation.**
  2. Three TEMPORARY core shims added (`flowFieldPassCore` in `passes/index.ts`, `flowComputeCore` in `computes/index.ts`, `assetWiring.ts`'s slot factory reading `state.gpu.flowFieldRenderer!`). Unavoidable: core's registries are module-level constants evaluated before any `FlowRuntime` exists, and Task 4 precedes Task 5. Each marked TEMPORARY pointing at Task 6. Carried into D3 as a hard deletion requirement.
  3. `layerImportBoundary` ratchet GREW by four transitional rows. See ruling below.
  4. Fixed two build breaks Task 1 left behind (`tools/flow-workbench/src/createFlowHarness.ts` still imported the deleted `encodeFlowCompute`; `initGpu.hdrCapabilityWiring.test.ts` had a stale `vi.mock` path). D1 never ran `npm run build`, which is why they survived — worth remembering: the frame-contract tasks need the build, not just tsc.
  5. `encodeFlowCompute.test.ts` hand-renamed to `tests/layers/flow/computes/flowCompute.test.ts` as briefed, then rewritten for the factory shape.
  6. Environment only: `earcut` was in package.json/lock but absent from `node_modules` (fallout from the just-merged #746). Restored with `npm install earcut@3.2.3 --no-save`; no manifest change.

  Ruling: the `layerImportBoundary` ratchet may grow MID-BRANCH and must return to main's exact shape by Task 6.
  Why: Task 2 relocates flow's modules before Task 5 forms the Layer, so between them core necessarily
  imports from `src/layers/flow` — there is no task ordering that avoids it without merging the two tasks.
  The convention's "only ever shrinks" is a property of the branch, not of every intermediate commit.
  Cost if wrong: a transitional row survives to main and permanently licenses core→Layer reach for four
  engine files. Guarded by making "`git diff main...HEAD -- tests/conventions/layerImportBoundary.test.ts`
  is empty" an explicit D3 completion condition, re-checked by the controller before the final review.
- D3 (Tasks 5–6, form + compose, then delete core's holdings) dispatched — Sonnet, BASE 57debd071. Status: running.
- D3 (Tasks 5–6) **complete** — Sonnet, 178 tool uses, 57debd071..714d4aba0, 2 commits (`d87a6cbd2` form+compose, `714d4aba0` delete core's holdings). Implementer gate: `npm test` 8774/0, `npm run typecheck`, `typecheck:fast`, `npm run build` all clean.
  Controller-verified DoD items: `layerImportBoundary` diffs to zero vs main (all four transitional rows gone — the ruling above held); `grep -rn "flowFieldRenderer" src/services` → one prose citation in `atmosphereShellRenderer.ts` only; `grep -rn "FlowTuningSection" src/components` → empty; `layer.ts` declares `ui: { settings, debug }`; `INITIAL_SETTINGS` byte-identical to main (implementer dumped both trees via a detached worktree and diffed sorted-key JSON).
  Deviations named by the implementer, all accepted — every one a consequence of deleting core's flow holdings:
  1. Seven unrelated test files trimmed of a now-nonexistent `state.gpu.flowFieldRenderer` field/mock.
  2. `executeFrame.computes.test.ts`'s `runtimeOf(state)` helper rewritten as `makeRuntime(...)` — `flowCompute` no longer reads `state.gpu`.
  3. `runFrame.test.ts`'s `'runFrame — flow field reconcile'` describe deleted (pinned the deleted `reconcile` line); claims coverage moved to `tests/layers/flow/frame.test.ts`.
  4. Two `shouldKeepTicking` tests deleted (pinned the deleted flow disjunct); claims coverage moved to the same file.
  5. `tests/helpers/engine/makeFadeBridgeState.ts` gained `flowFadeRows(FLOW_RUNTIME)` so `syncVisibilityFades.test.ts`'s `'flow'` intent-key assertion keeps a row after `FADE_LAYERS` lost it. Good catch — without it that assertion would have gone vacuous rather than failed.
  Items 3, 4 and 5 are the branch's real regression risk (deleted tests + a stub that could make an assertion vacuous) and are called out to the final reviewer by name.
- Branch merged `origin/main` (597d0fe58, #751) as `bcee0a83e` — per the CI-stale-on-main-move landmine, PR checks never settle if main moved under the PR. typecheck:fast clean post-merge; full suite running.
- Final whole-branch review dispatched — **Opus**, range b98509bdd..714d4aba0 (the branch's own seven commits; the merge's contents excluded). Mandate: spec fidelity + slop, with the deleted tests and the fade-row stub flagged for specific scepticism. Status: running.
- Post-merge gate (bcee0a83e): `npm test` 8785/8785 across 1304 files, typecheck:fast clean.
- Final whole-branch review **complete** — Opus, 62 tool uses. Verdict: land after fixing 1 Critical. 1 Critical / 0 Important / 12 Minor. Report at `final-review.md`.
  Verified clean by the reviewer: `layerImportBoundary` diff empty; `frameFilePurity` only shrank; no flow holding survives in core; the deleted `runFrame`/`shouldKeepTicking` tests' coverage genuinely moved to `tests/layers/flow/frame.test.ts`; `makeFadeBridgeState`'s `fieldLoaded: () => true` stub is NOT vacuous. All three of my flagged scepticism items came back clean.

  **C1 (confirmed by the controller against the code, not taken on report):** `Layer.frame`'s single boolean braids two meanings, and its own doc comment says so — "keeps the loop awake AND defers sky captures". `ctx.layersAnimating` feeds both `shouldKeepTicking` ("keep ticking") and `scheduleSkyCaptures`'s `rosterSettling` (whose comment at `:32-34` says "a Layer still SETTLING — a thumbnail's async 400 ms load fade"). `galaxyCatalog`'s vote is `hasInFlightWork()`, transient, so the two readings coincided until now. Flow's new vote is constant-true while enabled, so `rosterSettling` never clears → `scheduleSkyCaptures:67` never short-circuits and `:96-97` pins `bakedSettings = null` → the sky cubemap re-bakes 6 faces every frame inside `solarSystemSky` (fullAt 500 AU, the DEFAULT Earth home) or the Sgr A* band, defeating `rebakeOnSettings: false` and #667's static bake. Impossible on main, where flow's keep-alive was a private `shouldKeepTicking` disjunct that never reached `layersAnimating`; Task 6 deleted it and absorbed it into the Layer vote.

  Ruling: **un-braid into two named votes** — `Layer.frame` returns `LayerFrameVote { awake, settling }`; `ctx.layersAnimating` splits into `layersAwake` / `layersSettling`; `shouldKeepTicking` reads the first, `scheduleSkyCaptures` the second; `settling` folds into `awake` at the fold site so the implication holds structurally. Flow votes `{ awake: enabled && slotReady, settling: false }` — it sits in no capture roster and so can never make a bake stale. galaxyCatalog votes both from `hasInFlightWork()`.
  Why: the two concerns vary independently (the convention's un-braid rule), and the cheaper alternatives are both wrong — dropping `layersAnimating` from `rosterSettling` regresses the thumbnail case #667 was built for, and returning flow's keep-alive to a core `shouldKeepTicking` term puts flow settings back in core and defeats the Layer.
  Cost if wrong: a late contract change touching `Layer.frame`, both Layers that declare it, `runFrame`, `frameContext`, `shouldKeepTicking` and `scheduleSkyCaptures` — reviewed once, not twice, since the lean protocol allows no re-review. A wrong split shows up as either a loop that parks while flow animates, or a sky bake that goes stale on thumbnail arrival.
  Two further rulings on the Minors: `INITIAL_SETTINGS` key-order drift is acceptable (deep-equal is what matters; nothing iterates settings positionally, the tour snapshot merge is key-addressed) — the plan's DoD line is corrected to say deep-equal, which is what was actually verified; the two change-detector tests are deleted rather than kept.
- Fix round dispatched — **Opus**, FIX_BASE bcee0a83e, C1 + the 12 Minors, two commits. Status: running.
- Fix round **complete** — Opus, 80 tool uses, bcee0a83e..d3d9017a0, 2 commits (`2508799ac` C1 un-braid, `d3d9017a0` minors). Implementer gate: `npm run typecheck` both projects clean, `npm test` 8786 pass, `npm run build` clean incl. flow-workbench (the `?static` specifiers link).
  Controller-verified: `LayerFrameVote` matches the ruling; `runFrame:223` folds `settling` into `awake` structurally as specified; every consumer repointed (`shouldKeepTicking` → `layersAwake`, `scheduleSkyCaptures:35` → `layersSettling`); flow votes `settling: false` with the capture-roster reason in the comment; galaxyCatalog votes both from `hasInFlightWork()`. Independent `npm run typecheck` clean, tree clean.
  Regression test verified present AND two-sided in `renderFrame.cubemapCaptures.test.ts`: `:413` 'a Layer awake forever but never settling (flow) leaves the bake recorded and sweeps once' (the C1 case, implementer reports it mutation-verified — fails if the scheduler is pointed back at `layersAwake`) alongside `:395` 'a Layer alone still settling forces a sweep', so neither direction can rot alone.
  Minors: 9 of 12 fixed; 3 left as taste and named (M6 relocated files' pre-branch headers on byte-identical moves, M10 DebugPanel's `APP_COMPOSITION` import as a pre-existing shape, M5's plan-faithful ratio rows). Accepted.
  Adjacent, found and NOT fixed: `singleton-overlay-layers.md` also cites `@types/engine/data/FlowFieldStore.d.ts` and `state.data.flow.setLoaded()`, both deleted in #309 — pre-existing doc rot, offered to the user rather than swept into this PR.
- Deletion audit **complete** — Opus, 36 tool uses. 4 safe-now (≈−41 LOC) / 6 needs-a-ruling. Report at `deletion-audit.md`. Contract verdicts closed: `Layer.computes`, `Layer.ui.debug` and `LayerFrameVote` all earn their keep; only the ctx mirror of the vote was surplus.
  Two safe-now items verified by the controller against the code before applying:
  · `EngineAssetSlots.flow` was a permanently-null field with no writer (`buildSlotsFromRegistry` skips keys already in `state.layerSlots`) and no reader (`slotFor` consults `layerSlots` first and returns). **A Task 6 miss** — `filaments` set the precedent of removing its equivalent, and this is precisely the "a field left behind is a second dead path" the task existed to prevent. Passed both the implementer and the whole-branch review.
  · `ReadyFrameContext.layersAwake` was write-only. **My C1 ruling's error**: I specified splitting the ctx field into both halves, but `shouldKeepTicking` takes its value from `runFrame`'s local via the `anim` bag, never through the ctx — only `layersSettling` needed a ctx field. `LayerFrameVote.awake` itself is correct and stays.
- Safe-now bin applied — Sonnet, 52 tool uses, d3d9017a0..7611e74a1, one commit `7611e74a1`, 26 files, −39 net (51 deletions / 12 insertions; the insertions are rewrapped comment lines from the budget trims, no new functionality — implementer flagged the variance from the audited "−41, zero additions" rather than hiding it). `npm run typecheck` clean (controller re-ran it independently), `npm test` 8786 passing, and `renderFrame.cubemapCaptures.test.ts` run standalone 14/14 to confirm the `{ awake: true }` C1 regression test still passes with the fixture field gone.
  Controller check: the surviving `layersAwake` references are all the `anim`-bag path, which is the one with a reader. `ctx.layersAwake` is gone.
- **AWAITING USER**: (a) Task 7 manual smoke, dev server on :5175 (background shell bry0diri4); (b) rulings on deletion-audit R1–R6.
- **USER RULING 2026-09-17: "dont do any of the deletion audit."** R1–R6 are DROPPED — not deferred, not backlogged. No further deletion work on this PR. The safe-now bin (`7611e74a1`) had already landed and been pushed when the ruling came; left in place, with an offer to revert it if the user meant that too.
- **USER RULING REVISED: R4, R5 and R6 are IN; R1, R2, R3 stay dropped.** All three are test deletions (the `flowAssetRows` identity-assertion file; two of three `flowFadeRows` tests, keeping the runtime-reading `guard` one; the `state.computes` order pin in `createLayers.computes.test.ts`, keeping the duplicate-name test). Dispatched — Sonnet, BASE 7611e74a1, one commit. Status: running.
- **R3 added mid-dispatch** by user ruling; sent to the running agent. R1 and R2 stay dropped. R3 is a FOLD not a delete — `layer.test.ts`'s assertions move into `create.test.ts` to share its `mockDevice` setup, and the pass/compute NAME assertions must survive the fold (they are the only test-time pin on the names `FRAME_ORDER` matches).
- R3–R6 **applied** — Sonnet, 23 tool uses, 7611e74a1..d08cc952f, one commit `d08cc952f`, 5 files, +16/−105 (net −89). Tests 8786 → 8782 (−4 cases: R4 −1, R5 −2, R6 −1; R3's fold nets 0 — its one test moved rather than died). typecheck clean, controller re-ran it independently.
  Controller check on the R3 fold: `create.test.ts:74-81` now carries the name assertions (`passes`/`computes`/`assets`/`fades` each exactly `['flow']`), so the pin on the names `FRAME_ORDER` matches survived as required. R6 also removed the now-unused `CORE_COMPUTES` import and trimmed the module header's stale ordering claim.
  R1 and R2 remain dropped per the user's ruling.
- Branch total after all deletion work: `d08cc952f`, pushed.
- **AWAITING USER**: Task 7 manual smoke, dev server :5175 (background shell bry0diri4). Then `/feature-done`, then merge.
- Merged origin/main (b14487242, #743) as 4000fd167, pushed. Gate: typecheck both projects clean, build clean, npm test 8810/8810.
- **Task 7 smoke PASSED** — user attested all checks 2026-09-18 (dev :5174), incl. Settings Flow section's new position and Debug section unchanged.
- /feature-done READY; plan moved to completed/ with this ledger. Umbrella spec 2026-09-09-layer-composition-design stays active (covers later Layers).
