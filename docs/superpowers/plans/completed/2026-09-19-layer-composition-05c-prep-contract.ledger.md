# SDD ledger — plan: docs/superpowers/plans/2026-09-19-layer-composition-05c-prep-contract.md

Worktree: `.claude/worktrees/layer-composition-05c-zoa`, branch `worktree-layer-composition-05c-zoa`, draft PR #759 (prep PR; the ZoA Layer PR stacks on it).
Protocol: lean (`docs/superpowers/conventions/sdd-execution.md`).

## Plan-start answers (2026-09-19)
- Parallelism: serial, one worktree (D2/D3 both touch `Layer.d.ts`).
- Perf gate: no — no per-frame work changes.

## Rulings carried in
- Spec §9 "(e) 05c" = scope. P3 via `state.layerTargets` seeded in `engine.ts`, NOT a `GpuHandleConstructDeps` field (user, 2026-09-19).
- `composeSelectionRows.ts` focus-id check is not a merge — left out of P0.

## Log
- D1 (Task 1, P0) — controller inline, **complete** `d750995ee`. 3 sites → `concatUniqueRows`; 65 tests green in utils/object + phases.
  Env note: worktree has no node_modules (resolves from main); main lacks `xatlas-wasm` (#754) → 2 tools-only typecheck errors in `tools/scene-recon/atlas/packCharts.ts`. Not ours; tell user.
  → user ran `npm install` on main 2026-09-19; typecheck:fast now clean in both projects.
- D2 (Tasks 2–3, P1) dispatched — Sonnet, BASE d750995ee. Status: running (background; its brief
  still says "ignore 2 packCharts errors" — now moot). ON RETURN: verify contract types match the
  plan's P1 section verbatim, `grep -rn "LayerUi\b" src tests` empty, typecheck; log here.

- D2 **complete** — Sonnet, 86 tool uses, d750995ee..91e538ec4 (`9cd34366f` T2, `91e538ec4` T3). No deviations.
  Implementer gate: typecheck:fast clean, npm test 8909/8909, build clean, ratchets unchanged.
  Controller-verified: LayerUiSlots/LayerUiEntry/LayerSettingsRow match P1 verbatim; `layerUiContents` filters by slot in layer→entry order.
- D3 (Tasks 4–5, P2+P3) dispatched — Sonnet, BASE 91e538ec4, brief pins the `state.layerTargets` ruling. Status: running.
  ON RETURN: check `GpuHandleConstructDeps` diff empty; `LayerLabels` shape; `state.layerTargets` seed in engine.ts; then final review (Opus).

- D3 **complete** — Sonnet, 129 tool uses, 91e538ec4..8fc9f1096 (`e2a40201a` P2, `8fc9f1096` P3). Implementer gate: typecheck both, 8914 tests, build.
  Deviations accepted (fixture casualties): `initGpu.hdrCapabilityWiring.test.ts` mock gained `renderTargetRows` + `layerTargets: []`; `runFrame.test.ts` base state gained `label3DProducers: []`, `makeLayer` uses `screenLabels`/`worldLabels`.
  Controller-verified: `GpuHandleConstructDeps` diff EMPTY; `LayerLabels` matches P2; `layerTargets` seeded engine.ts:326; registry row :98 composes. Nit for review: createLayers comment "(d) ships a single world producer" is a stale step ref.
- Merged origin/main (#757, #758) as `5e3f3fcbc`; typecheck clean, 8919 tests, build clean; pushed.
- Final whole-branch review dispatched — Opus, range a88b363af..8fc9f1096 (merge excluded); report → `final-review.md` here. Status: running.
  ON RETURN: confirm Critical/Important against code, rule, dispatch one fix round (Sonnet) if needed; then ask user for Task 6 smoke.

- Final review **complete** — Opus, 28 tool uses: LAND, 0 Critical / 0 Important / 9 Minor (`final-review.md`). All four scepticism items clean (companion keys 1:1, shallowEqual stable, no vacuous fixtures, label3D walk only after startLoop with `[]` seed).
- Fix round dispatched — Sonnet, BASE 5e3f3fcbc, all M1–M9 (M8 useMemo applied, M9 readonly added), one commit, pushes. Status: running.
  ON RETURN: spot-check createLayers.ts:144 comment + LayerLabels doc; then ask user for Task 6 smoke (dev server: user runs `! npm run dev` in this wt).
- Fix round **complete** — `55ed0e688`, M1–M9 all applied (M8 also memoised `mainSections`), pushed. Gate: typecheck, 4183 scoped tests, build. Controller spot-checked M1 + M4.
- **AWAITING USER**: Task 6 smoke (checklist posted in chat = plan Task 6). Then /feature-done → ready → CI → merge on word.

## Queued sequence (agreed)
1. D2 returns → controller check → D3 = Tasks 4–5 (P2 labels {screen, world}; P3 `state.layerTargets`
   seeded in engine.ts, GpuHandleConstructDeps UNTOUCHED), Sonnet, serial, same worktree.
2. One whole-branch review (Opus) → fix round if needed. NO deletion audit (prep PR).
3. Task 6 manual smoke (user): Settings + Debug panels unchanged, galaxy labels + ZoA lettering render, resize works.
4. /feature-done on the prep plan (spec STAYS in specs/) → mark #759 ready → CI → merge ONLY on user's word via
   `gh api -X PUT repos/rulkens/skymap/pulls/759/merge -f merge_method=squash`.
5. Then the 05c ZoA Layer plan (feature PR) in this same worktree after pulling main; design rulings in
   memory `project_layer_composition.md` "05c ZoA — brainstorm rulings".
- **Task 6 smoke PASSED** — user attested all checks 2026-09-19 (dev :5175).
- /feature-done READY: 8919 tests, typecheck clean, 43/43 boxes; plan + this ledger archived. Spec STAYS (umbrella).
