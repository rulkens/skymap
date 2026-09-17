# Ledger — docs/superpowers/plans/2026-09-17-settings-fragments-to-rtk-slices.md

Worktree: `.claude/worktrees/settings-rtk-slices` · branch `worktree-settings-rtk-slices`
Draft PR: #745 · base `main` @ 845720549

Step 2 of the agreed Layer-composition order (see the user's
`project_layer_composition` memory). Behaviour-neutral refactor; no spec.

## Settled before dispatch (probes run in this worktree, read-only)

- `combineSlices(...tuple as const)` preserves the per-key state shape — verified
  by compiling a probe. A widened `Slice[]` would collapse it, so every slice
  tuple must be `as const`.
- `combineSlices` keys off `reducerPath`, not `name` — verified. That is what lets
  every settings slice carry `name: 'settings/<cluster>'` (avoiding a collision
  with the root `camera` slice) while sitting at `state.settings.<cluster>`.
- No Layer settings file imports `EngineSettingsState`; `bodiesSettings.ts` only
  names it in a comment.
- One literal action-type string repo-wide:
  `tests/components/containers/StructuresSectionContainer.test.ts:48`.

## User rulings this session

- **Re-point every import site** (77 files), do NOT keep a permanent re-export
  barrel in `settingsSlice.ts`. The re-export in Task 3 is transitional only and
  Task 4 deletes it.
- Step 2 is mechanical: no brainstorm, no spec. (Corrects an earlier claim of
  mine that it needed design work.)

## Dispatches

| #   | Tasks                                | Agent  | State                        |
| --- | ------------------------------------ | ------ | ---------------------------- |
| 1   | 1 + 2 — the 22 slice conversions     | sonnet | DONE `587002e6c` `d9932a9da` |
| 2   | 3 — combineSlices + delete machinery | sonnet | DONE `15835acb9`             |
| 3   | 4 + 5 — re-point imports, docs       | sonnet | dispatched                   |

Reviews: one whole-branch review at the end (lean protocol). CI is the gate.

## Log

- 2026-09-17 — worktree opened, `public/data` symlinked to main, plan committed
  `c6608faf3`, draft PR #745 opened.
- 2026-09-17 — dispatch 1 done. 15 Layer fragments renamed `*Settings.ts` → `*Slice.ts`
  via `move-files --manifest`; 7 core slices under `src/state/settings/core/`;
  `coreInitialSettings.ts` and `appSettingsFragments.ts` deleted. All four slice
  tuples verified `as const`. `settingsSlice.ts` left dirty and broken on purpose —
  dispatch 2 repairs it into the transitional re-export block.
- 2026-09-17 — dispatch 2 (Task 3) dispatched.
- 2026-09-17 — dispatch 2 done `15835acb9` (30 files, +342/-820). `npm test` 8620 green,
  typecheck green. `EngineSettingsState` now `ReturnType<typeof combinedSettingsReducer>`.
  Fallout the plan missed, all fixed in that commit: `instantiateLayer.ts` /
  `defineLayer.ts` also bounded `Settings` by the deleted `SettingsFragmentLike`;
  `SettingsSnapshot` deliberately excludes `bloom`, so the plan's snapshot test used a
  cluster the snapshot cannot carry (swapped to `labels`); `layerImportBoundary`'s sweep
  read only `ImportDeclaration`s, so a pure re-export file dodged it (now scans
  `ExportDeclaration`s too).
  Deleted-test coverage KEPT as new per-slice tests: `debugSlice` (overlay flip + knob
  gating), `volumesSlice` (add/remove/write, re-add preserves tuning), `flowSlice`
  (partial-merge leaf preservation), `starCatalogsSlice` (item toggle vs master gate).
  DROPPED on purpose: `liftClusterReducers` (machinery gone) and the fragment-key
  collision guards — the `settings/<cluster>/` action prefix makes that bug class
  structurally impossible, so there is nothing left to assert.
- 2026-09-17 — dispatch 3 (Tasks 4 + 5) dispatched. WATCH: it must DELETE the
  `state/settings/settingsSlice: 15` row from `layerImportBoundary`'s exact-count
  allow-list, not lower it — that row exists only for the transitional file.
- 2026-09-17 — dispatch 3 done. `9c894c18f` (re-point 79 files, delete `settingsSlice.ts`)
  - `f7176372d` (docs). `npm test` 8617 green, typecheck green. Verified myself:
    `grep -rn settingsSlice src tests` is clean apart from one historical mention in
    `layerImportBoundary.test.ts`'s comment, and the transitional
    `state/settings/settingsSlice: 15` row IS deleted.
    **FINDING for the user, needs a ruling:** the re-point exposed two REAL core→Layer
    import crossings the barrel had been hiding —
    `src/services/engine/volume/uploadVolumeField.ts` → `layers/volume/settings/volumesSlice`
    (`addVolumeField`) and `src/state/tier/watchTierSaga.ts` →
    `layers/milkyWay/settings/milkyWaySlice` (`setMilkyWayTuning`). The agent added two
    budget-1 rows to `ENGINE_AND_STATE_ALLOWED` with a why-comment. The dependency is not
    new, only newly visible; but the ratchet "only ever shrinks" rule says a grow needs the
    user's call. Proper fix belongs to steps 3–5 of the Layer-composition order.
- 2026-09-17 — branch pushed `f7176372d`; PR #745 CI running. Whole-branch review
  dispatched (opus, 10 numbered checks incl. the two ratchet rows). Branch diff vs
  origin/main: 143 files, +1779/-1430. Base is current: origin/main tip `0f8771746`
  IS an ancestor of HEAD, so main has not moved under the PR.
  NEXT after review: deletion audit + `/feature-done`, then ask the user for the manual
  smoke attestation (settings panel toggles + a guided-tour run exercising `mergeSnapshot`),
  then the diff breakdown, mark #745 ready, land via
  `gh api -X PUT repos/rulkens/skymap/pulls/745/merge -f merge_method=squash`.
- 2026-09-17 — whole-branch review done (opus). CLEAN on the eight fidelity categories,
  each mechanically checked rather than assumed: all 40 core reducer write statements
  diffed old-vs-new (one intended difference: `orientation` became a return),
  `orientationSlice` returns, all four tuples `as const`, initial-state literals verbatim,
  all 22 slices carry the `settings/` prefix, `mergeSnapshot` runs once above the combine
  with zero `extraReducers`, `selectors.ts` has a ZERO-line diff, and the 22 slices export
  76 creator names with no duplicates — byte-identical to main's `settingsSlice` export
  list, so a wrong-module import cannot typecheck.
  Findings FIXED in `9a24e8631`: four new slice-test headers named the wrong origin file
  (refactor narration either way), `debugSlice`'s header pointed at the deleted
  `CORE_REDUCERS`, `layerImportBoundary`'s ratchet comment overstated "two real offenders
  at HEAD" (true only within that sweep's roots — five more core->Layer edges exist
  outside them), `sourceRegistryCoverage.test.ts` pointed at the deleted
  `appSettingsFragments.test.ts`, four files unformatted, backlog detail said nine sites
  above an eight-row table. 8617 green + typecheck green after.
  **ASTERISK on behaviour-neutral, for the user:** on main `mergeSnapshot` was an Immer
  case reducer, so its returned root was deep-frozen. Now `mergeSettingsSnapshot` returns
  a plain spread, so clusters restored by a snapshot are UNFROZEN until the next
  dispatched write to them. Values are byte-identical; mutability is not. Judged not worth
  fixing: `createAppStore` enables `immutableCheck` with only
  `engine.galaxyCatalog.<aliasIndex>` ignored, so an in-place settings mutation is still
  caught in dev — at the next dispatch rather than at the mutation site. Fixing it would
  mean an `immer` import (not a direct dependency, imported nowhere in src).
  REVIEW RULED on the two ratchet rows: neither is cheaply removable — undoing them means
  moving the volume-upload path into the volume Layer and inverting tier->milkyWay into a
  Layer saga, i.e. step-3 work. Both rows honestly justified.
  Deliberately NOT changed: `docs/research/engine/{decisions,current-contracts-map}.md`
  still name `settingsSlice`; both are explicitly dated snapshots ("Snapshot 2026-08-19",
  "Brainstorming session 2026-08-16/17"), so the DoD grep item is met with that exception.
- 2026-09-17 — deletion audit dispatched (opus, legacy framing, whole branch).
- 2026-09-17 — deletion audit done (opus). Verdict: conversion itself clean and
  net-negative (settings area +510/-1010); no helper, type or fixture from the old
  fragment mechanism survives. SAFE-NOW bin applied in `1a0...` (see git log, commit
  "drop what the compiler already pins", 6 files, +13/-69), covering both audit deletions
  plus four comment-budget violations it found.
  NEEDS-RULING items left for the user, none applied:
  1. `CoreSettingsState.d.ts` is now a second hand-authored source of truth for the seven
     core clusters, read by only three `initialState` annotations; the other four slices
     type from their own cluster types. It can drift from the slices silently now that the
     root type derives. Fix = type those three from their own types, delete the file.
  2. `mergeSnapshotAction.ts` could fold into `settingsReducer.ts` (no cycle either way);
     keeping it preserves one-symbol-per-file. MY CALL: keep. Not escalated as a blocker.
  3. `coreSettingsSlices.ts` could inline into `combinedSettingsReducer.ts`. MY CALL: keep
     — symmetry with `APP_SETTINGS_SLICES` is exactly the uniform-structure ruling.
  4. `setThumbnailsEnabled` and `setConstellationIntensity` have no dispatcher anywhere
     (dead on main too; the branch now hand-writes each export).
  5. `src/main.tsx:92` `[settingsRoute]: INITIAL_SETTINGS` now restates what
     `combinedSettingsReducer(undefined, …)` produces anyway.
  6. `layerImportBoundary`'s new `ExportDeclaration` scanning: audit calls it speculative
     now the barrel is gone. MY CALL: keep — it closes a real hole in a convention sweep.
- 2026-09-17 — USER RULINGS on the audit:
  - Ratchet: **accept both rows + log them against their Layers.** Done two ways:
    the comment above `ENGINE_AND_STATE_ALLOWED` now names which Layer formation
    deletes which row (`6f4c971dd`), and the same is written into the
    `project_layer_composition` memory. Framing that settled it: neither crossing is a
    decision — `src/layers/{volume,milkyWay}/` are settings-ONLY folders (only
    galaxyCatalog and filaments are formed Layers), so core has nowhere else to put the
    work. `uploadVolumeField` IS the volume Layer's future slot wiring.
  - `CoreSettingsState`: user first answered "delete it", then took the alternative once
    told the file is step 5's named target (spec §4.3 narrows `EngineState.settings` to
    it). Shipped `9a2df3588`: extracted `CameraSettings`/`TonemapSettings`/`BloomSettings`
    into their own `@types/settings/` files — those three were defined INLINE in
    `CoreSettingsState`, which is why their slices imported the composition to type their
    own `initialState`. All seven core slices now type from their own cluster type and
    `CoreSettingsState` is a pure seven-key composition that cannot drift.
  - Dead knobs `setThumbnailsEnabled` / `setConstellationIntensity`: **KEEP** (user).
    Full suite 8614 green, typecheck green, all pushed.
    REMAINING TO LAND: `/feature-done` (deletion audit already done), the manual smoke
    attestation from the user, the diff breakdown (last run: src code -126, src comment
    -101, test code -82, test comment +3, docs +589 — docs bulk is the plan file itself),
    mark #745 ready, merge via
    `gh api -X PUT repos/rulkens/skymap/pulls/745/merge -f merge_method=squash`.
