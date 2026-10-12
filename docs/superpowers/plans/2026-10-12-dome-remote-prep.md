# Dome remote — ground preparation (prep PR)

**Spec:** [`docs/superpowers/specs/2026-10-11-dome-remote-design.md`](../specs/2026-10-11-dome-remote-design.md),
section "Ground preparation".

**Goal:** create the three joints the dome remote needs, with no behaviour change: a named gesture sink reachable
from sagas, palette search and its go-to runner outside `src/components/`, and Labels & Guides toggle rows built
without React.

**Packaging:** its own PR, merged before the feature PR. Pure refactor: the app behaves exactly as before.

---

### Task 1: The gesture sink gets a name and a seat in the saga context

**review: yes** (Redux edges, input path, a landmine-ordered contract)

**Files:**

- `src/services/engine/interaction/createGestureSink.ts` (create)
- `src/@types/engine/interaction/GestureSink.d.ts` (create)
- `src/services/engine/engine.ts` (modify: build the sink once, pass it to `setSagaContext` and to bootstrap deps)
- `src/@types/engine/BootstrapDeps.d.ts` (modify: add `pushGesture`)
- `src/services/engine/phases/wireInput.ts` (modify: hand `deps.pushGesture` to `attachOrbitControls`, delete the
  inline closure at `:189-198`)
- `src/store/types.ts` (modify: `SagaContext` gains `pushGesture`, at `:148`)
- `tests/services/engine/interaction/createGestureSink.test.ts` (create)
- `tests/services/engine/phases/wireInput.test.ts` (modify)
- Saga-context stubs: `tests/support/createTestStore.ts`, `tests/state/tour/visitBeatSaga.test.ts`,
  `tests/state/tour/webShowcaseDive.integration.test.ts`, `tests/state/tour/tourBodySaga.test.ts`,
  `tests/state/exhibits/exhibitBodySaga.test.ts`, `tests/state/takeover/watchTakeoverSaga.test.ts`,
  `tests/state/camera/clipBodySaga.test.ts` (modify: add a no-op `pushGesture`, only where the literal is typed as a
  full `SagaContext`)

**Contract:**

```ts
// src/@types/engine/interaction/GestureSink.d.ts
export type GestureSink = (event: InputGestureEvent) => void;

// src/services/engine/interaction/createGestureSink.ts
export function createGestureSink(deps: {
  dispatch: AppDispatch;
  aggregator: Pick<InputAggregator, 'push'>;
  requestRender: () => void;
}): GestureSink;

// SagaContext and BootstrapDeps
pushGesture: GestureSink;
```

**Behaviour** (moved unchanged from `wireInput.ts:189-198`): on `gestureStart`, dispatch `beginDrag()` then
`cancelCameraTween()` synchronously, before the push; every event is pushed to the aggregator and wakes the loop.
Carry the existing comment at `wireInput.ts:182-188` (why the start edges fire at DOM time) into the new file, trimmed
to the comment budget.

**Construction:** in `engine.ts`, build the sink once after `state.subsystems` exists (the aggregator is created at
`engine.ts:236`) and before `cb.setSagaContext` (`engine.ts:413`); the same function goes into `bootstrapDeps`
(`engine.ts:384`). The aggregator exists from construction, so a push before bootstrap simply waits for the first
frame's drain.

- [x] Move the two sink assertions out of `wireInput.test.ts` into `createGestureSink.test.ts`:
      `queues an event and wakes the loop` and
      `cancels an in-flight tween on the gesture-start emission, at DOM time` (the B1 test at `wireInput.test.ts:303`;
      keep its comment, it is the landmine record).
- [x] In `wireInput.test.ts`, replace them with `hands the bootstrap gesture sink to the orbit controls`, asserting the
      spy's second argument is `deps.pushGesture` by identity.
- [x] Implement, wire, update the stubs.
- [x] `npm run typecheck:fast` and `npx vitest run tests/services/engine tests/state/tour tests/state/exhibits
tests/state/takeover tests/state/camera tests/support` pass.
- [x] Commit.

---

### Task 2: Palette search leaves the component folder

**Files:** the moves below, their importers (rewritten by the tool), and the `tests/` mirror.

Pure moves; no logic changes, no new tests (the moved tests follow their files).

- [x] Split `src/components/CommandPalette/paletteRowModel.ts` (two exports) by its two symbols:

      ```bash
      npm run refactor -- extract src/components/CommandPalette/paletteRowModel.ts#ScoredRow src/@types/palette/ScoredRow.ts
      npm run refactor -- extract src/components/CommandPalette/paletteRowModel.ts#MILKY_WAY_NAMES src/data/palette/milkyWayNames.ts
      ```

      Then rename the type file to `.d.ts` with `npm run move-files -- src/@types/palette/ScoredRow.ts src/@types/palette/ScoredRow.d.ts`
      (every other `src/@types/` file is `.d.ts`), and delete the emptied `paletteRowModel.ts`, moving its header's one
      useful sentence (why the row vocabulary is React-free) to `ScoredRow.d.ts`.

- [x] Move the four pure functions, dry run first:

      ```bash
      npm run move-files -- --dry --manifest <scratch>/palette-moves.json
      npm run move-files -- --manifest <scratch>/palette-moves.json
      ```

      with the manifest mapping `src/components/CommandPalette/utils/{rankPaletteMatches,scoreFamousMatch,scoreAliasMatch,actionForRow}.ts`
      to `src/utils/palette/<same name>.ts`.

- [x] Search for each old basename (`paletteRowModel`, `CommandPalette/utils/rankPaletteMatches` and so on) in `src`,
      `tests`, `tools` and `docs`; fix any string-literal path the tool missed.
- [x] Confirm nothing under `src/utils/palette/` imports from `src/components/`.
- [x] `npm run typecheck:fast` and `npx vitest run tests/components/CommandPalette tests/utils/palette` pass.
- [x] Commit.

---

### Task 3: The palette's go-to runner returns actions

**Files:**

- `src/utils/palette/actionsForPaletteAction.ts` (create)
- `src/components/containers/CommandPaletteContainer.tsx` (modify: delete `RUN_ACTION` at `:28-60`; `onSelect`
  dispatches each returned action in order)

**Contract:**

```ts
export function actionsForPaletteAction(action: PaletteAction): UnknownAction[];
```

**Behaviour:** the same actions `RUN_ACTION` dispatches today, in the same order, as a table keyed on
`action.kind` (keep the table dispatch). `focus` returns two: `requestSelect(focusId)` then
`requestFocus({ id: focusId, transition: 'fly' })`.

No new test: this is a routing change with no branch logic of its own, and the palette's existing tests cover the
selection path.

- [x] Implement; the container's `onSelect` becomes a loop over the result.
- [x] `npm run typecheck:fast` and `npx vitest run tests/components` pass.
- [x] Commit.

---

### Task 4: Toggle rows are built by a selector

**review: yes** (memoised selector feeding a `memo` component)

**Files:**

- `src/@types/settings/ToggleRow.d.ts` (create)
- `src/compositions/selectToggleRows.ts` (create)
- `src/components/containers/LabelsAndGuidesSectionContainer.tsx` (modify)
- `tests/compositions/selectToggleRows.test.ts` (create)

**Contract:**

```ts
// src/@types/settings/ToggleRow.d.ts
export type ToggleRow = {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly set: (enabled: boolean) => UnknownAction;
};

// src/compositions/selectToggleRows.ts
export function selectToggleRows(
  state: RootState,
  layerRows: readonly LayerSettingsRow[],
): readonly ToggleRow[];
```

**Home:** `src/compositions/`, because it reads five Layers' label selectors and nothing under `src/state/` imports
from `src/layers/`; `appSettingsSlices.ts` is the precedent for app-specific glue there.

**Behaviour:** the rows the container builds today at `LabelsAndGuidesSectionContainer.tsx:142-163`, same ids,
labels and order: one per label category (`set` = the `LABEL_HOME_BY_SOURCE_TYPE` write), the orbit-trails row
(`set` = `setOrbitTrailsEnabled`), then each Layer row (`set` = `row.set`). The container maps each to a
`SectionRow` with `onChange: (enabled) => dispatch(row.set(enabled))` and keeps `LabelsAndGuidesSection` untouched.
The result is memoised (`createSelector`, with `layerRows` as an input), so an unrelated store write returns the
same array and the `memo` section does not re-render.

- [ ] Test `returns the same array when an unrelated slice changes`: build state, call twice around a dispatch to a
      slice the rows do not read (for example `ui`), assert identity. This guards the re-render the container's
      `useMemo` chain prevents today.
- [ ] Test `a row's set builds the action that flips its own value`: for the orbit-trails row and one label-category
      row, reduce `set(!enabled)` into the state and assert the re-selected row's `enabled` flipped.
- [ ] Implement; slim the container to the selector plus the `SectionRow` mapping.
- [ ] `npm run typecheck:fast` and `npx vitest run tests/compositions tests/components/SettingsPanel
tests/components/containers` pass.
- [ ] Commit.

---

## Definition of Done

**Deliverables:**

- `createGestureSink` and `GestureSink`; `SagaContext.pushGesture` and `BootstrapDeps.pushGesture`.
- `src/utils/palette/` holding `rankPaletteMatches`, `scoreFamousMatch`, `scoreAliasMatch`, `actionForRow` and
  `actionsForPaletteAction`; `ScoredRow` in `src/@types/palette/`; `MILKY_WAY_NAMES` in `src/data/palette/`;
  `paletteRowModel.ts` and `RUN_ACTION` gone.
- `ToggleRow` and `selectToggleRows`; the Labels & Guides container reads them.

**Smoke (unchanged behaviour), against this worktree's dev server:**

- Drag, pinch and wheel move the camera; double-click on a galaxy flies to it (the B1 path).
- Command palette: search "andromeda", pick it, and the camera flies; pick a tour, an exhibit and an Earth place.
- Settings → Labels & Guides: each checkbox, the master toggle and a Layer row toggle their labels.

**Out of scope:** everything in the feature PR (link, relay, receiver saga, remote page, pairing) and the Display,
Earth and Structures sections.
