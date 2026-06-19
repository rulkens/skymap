# Selection into the Intent Store — Part 2 (Cutover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Depends on Part 1 being merged** (`docs/superpowers/plans/2026-06-19-selection-into-intent-store-part-1-foundation.md`). Part 2 consumes Part 1's Produces interfaces by exact name: the slices/actions (`updateSelectionHover/Select/Focus`, `clearSelection`, `requestFocus`, `setSelectionRow`, `catalogLoaded`), the selectors (`selectSelectedFocusable`, `selectHoveredFocusable`, `selectFocusedFocusable`, `selectSelectedRef`, `selectFocusRef`, `selectIsSelectionActive`), the codecs (`focusIdOf`, `resolveFocusId`), the engine helpers (`extractSelectionRow`, `buildFocusable`, `extractGalaxyRow`, `buildGalaxyInfo`), the types (`SelectionRef`, `SelectionRow`, `SelectionSlot`, `ResolveDeps`), the extended `SagaContext` (`resolveDeps`; `requestRender` is reused from the `reconcile` bag, PR #352), the reconciler `watchSelectionRows`, and the `catalogLoaded` commit-path dispatch.

**Goal:** Cut selection reads and writes over to the store and delete the old `selectionSubsystem` path: engine per-frame readers + React read from the store; pick/double-click/Esc/palette/deep-link dispatch refs and commands; the tier saga re-anchors durable focus across a swap; the closure-mirror subsystem, the commit helpers, `targetEq`/`targetIdentityKey`, `FocusTarget`, and the `selectFamous`/`selectByAlias`/`focusOn` handle methods all dissolve.

**Architecture:** Refs are the single Intent home (`selection` slice); the reconciler saga (Part 1) keeps `selectionRows` in sync; React reads `useAppSelector(selectXFocusable)` (no engine reach) and writes via direct `dispatch`; the engine reads `selectionRows.focus`/`select` per frame; effects (render-wake, deep-link deferral, tier re-anchor) are sagas on the `SagaContext` seam. The tween callers are unchanged — only how they're triggered changes.

**Tech Stack:** TypeScript, Redux Toolkit, `typed-redux-saga`, `react-redux`, Vitest, WebGPU engine.

## Global Constraints

- One type per file in `src/@types/` (filename = type name); one function per file in `src/utils/` (filename = fn name); deep relative imports, no barrels.
- `type` aliases never `interface`. Use `Vec2`/`Vec3` from `src/@types/math`, never raw tuples.
- RTK slice-reducer args named after the slice (`selection`, `selectionRows`, `dataStatus`) or `state`; `action` for the `PayloadAction` — NEVER `s`/`a`.
- react-redux (`useAppSelector`/`useAppDispatch`/`useAppStore`) ONLY in React consumers via `src/store/hooks.ts`; NEVER in `src/state/` or `src/services/`. Engine/saga code uses `store.dispatch` / `store.getState` / `select`.
- Serializability + immutability checks ON in the store — stored shapes are flat serializable primitives (`objId` a string, no bigint/Map/Set).
- Didactic comments: explain WHY + the alternative; multi-paragraph module headers where the surrounding files have them.
- Suite must stay green at each task. Repo has 2687 tests passing (`npm test`) plus Part 1's additions. Typecheck is `npm run typecheck`.
- Tests mirror the `src/` tree under `tests/`.
- Commit steps stage SPECIFIC paths (never `git add -A`/`.`). User's git identity (no `--author`). Commit body ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure (Part 2)

Cut the per-frame engine readers to the store:
- `src/services/engine/frame/runFrame.ts` (Modify ~line 176-181, ~line 266, ~line 420) — read `selectionRows`/`selection` from the store instead of `state.subsystems.selection`; write hover/select refs by dispatch.
- `src/services/engine/frame/passes/selectionRingPass.ts` (Modify) — read the halo input off `selectionRows.select` (or `.focus` — match today's `selected()`), not the subsystem.
- `src/services/engine/helpers/selectionHaloTable.ts` (Modify) — accept a `SelectionRow` (galaxy arm reads `x/y/z/diameterKpc`; structure arm; milkyWay arm).

Cut the React read:
- `src/hooks/useEngine.ts` (Modify) — delete the `hovered/selected/focused` `useState` + echo callbacks; the hook no longer exposes them.
- `src/@types/engine/UseEngineReturn.d.ts` (Modify) — drop `hovered/selected/focused`.
- `src/@types/engine/EngineCallbacks.d.ts` (Modify) — drop the `selection.onHoverChange/onSelectChange` + `camera.onFocusChange` echo callbacks.
- `src/components/App/App.tsx` (Modify) — read `useAppSelector(selectXFocusable)`; rewrite InfoCard `onFocus`/`onClose`, CommandPalette `onSelect`/`onSelectAlias`/`onSelectMilkyWay` to dispatch.

Cut the writes:
- `src/services/engine/phases/wireInput.ts` (Modify) — onClick/onDoubleClick/onPointerLeave/onPointerDown/onEscape dispatch refs to `cb.store`.
- `src/services/engine/helpers/resolvePick.ts` + `resolvePickTable.ts` (Modify) — produce a `SelectionRef`, not a `FocusableTarget`.
- `src/@types/engine/ResolvePickDeps.d.ts` + the click resolver (Modify/simplify) — resolver returns a ref.
- `src/hooks/useUrlSync.ts` (Modify) — dispatch `requestFocus(hashFocusId)`; the URL-write reads `selectFocusRef` + `focusIdOf`; delete the drain effects.
- `src/components/CommandPalette/CommandPalette.tsx` (Modify) — handlers dispatch `requestFocus`.

New sagas + the focus-tween runner:
- `src/state/selection/selectionWakeSaga.ts` — `watchSelectionWake`.
- `src/state/selection/requestFocusSaga.ts` — `watchRequestFocus`.
- `src/state/selection/focusTweenSaga.ts` — `watchFocusTween` (Task 4b).
- `src/services/engine/camera/makeRunFocusTween.ts` — the engine-injected camera-tween runner (Task 4b).
- `src/store/types.ts` (Modify) — add `runFocusTween` to `SagaContext` (Task 4b).
- `src/services/engine/engine.ts` (Modify) — inject `runFocusTween` in `setSagaContext` (Task 4b).
- `src/store/rootSaga.ts` (Modify) — fork all three sagas.

Tier re-anchor folded in:
- `src/state/tier/tierSaga.ts` (Modify) — capture durable focus-ids before the write, re-anchor on bounded `catalogLoaded`.
- `src/state/selection/selectionWriteBySlot.ts` (Create) — `SELECTION_WRITE_BY_SLOT` parametric dispatch table.

Deletes:
- `src/services/engine/subsystems/selectionSubsystem.ts`
- `src/services/engine/helpers/targetEq.ts`, `targetIdentityKey.ts`
- `src/services/engine/helpers/commitFocus.ts`, `commitFocusTable.ts`, `commitGalaxyFocus.ts`, `commitStructureFocus.ts`, `commitMilkyWayFocus.ts`, `clearAll.ts`
- `src/@types/camera/FocusTarget.d.ts`
- handle methods `selectFamous`/`selectByAlias` (`EngineSelectionHandle`), `focusOn` (`EngineCameraHandle`) — confirm `focusOn`'s exact home
- `useEngine` `useState` mirrors + echo callbacks
- `useUrlSync`'s drain effects; `selectionToFocusId`/`parseFocusHash`/`resolveFocusTarget` in `focusUrl.ts` once unused

---

## Task 0: Expose `selection` + `selectionRows` getters on `EngineState`

The engine reads `settings`/`tier` through getters delegating to the injected store (`engine.ts` builds the `EngineState` literal with `get settings() { return store.getState().settings; }` and `get tier()`). Add the symmetric `get selection()` + `get selectionRows()` getters so the per-frame readers reach the store the SAME way — no `state.cb.store` / `state.store.getState()` ad-hoc access. This is the house pattern and the single store-access seam for the engine.

**Files:**
- Modify: `src/@types/engine/state/EngineState.d.ts` (add `selection: SelectionState; selectionRows: SelectionRowsState;` getter-backed fields)
- Modify: `src/services/engine/engine.ts` (add the two getters next to `get settings()`/`get tier()`, ~line 218-225)
- Test: extend the existing engine-state/store-delegation test if one exists (grep `get tier` / `store.getState().tier` in `tests/`), else a focused test.

**Interfaces:**
- Consumes: the injected `store` (already in `engine.ts` scope), `SelectionState`, `SelectionRowsState`.
- Produces: `state.selection` (→ `store.getState().selection`), `state.selectionRows` (→ `store.getState().selectionRows`).

- [ ] **Step 1: Add the fields to `EngineState`**

In `src/@types/engine/state/EngineState.d.ts`, after `tier: Tier;` (with a docblock mirroring the `tier` one):

```ts
  /**
   * The selection identity Intent (hover/select/focus refs). A getter
   * delegating to the injected store (`store.getState().selection`), like
   * `settings`/`tier` — the store is the single home, no engine-side mirror.
   * The pick path dispatches the writes; the engine reads here.
   */
  selection: SelectionState;
  /**
   * The saga-reconciled selection display rows. A getter delegating to
   * `store.getState().selectionRows`; the per-frame selection-ring + structure
   * focus readers read this.
   */
  selectionRows: SelectionRowsState;
```

Add the imports `import type { SelectionState } from '../../store/SelectionState';` and `import type { SelectionRowsState } from '../../store/SelectionRowsState';`.

- [ ] **Step 2: Add the getters in `engine.ts`**

Next to `get tier()` (~line 223):

```ts
    get selection() {
      return store.getState().selection;
    },
    get selectionRows() {
      return store.getState().selectionRows;
    },
```

- [ ] **Step 3: Test, typecheck, commit**

Run: `npm run typecheck` then `npm test`.
Expected: PASS (the getters are additive; nothing reads them yet).

```bash
git add src/@types/engine/state/EngineState.d.ts src/services/engine/engine.ts
git commit -m "feat(engine): expose selection + selectionRows getters on EngineState

Delegate to the injected store like settings/tier, so the per-frame readers
reach the store through the one house seam (no ad-hoc store access).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: Per-frame engine readers read the store (`runFrame` + `selectionRingPass`)

Cut the three per-frame consumers from `state.subsystems.selection.*()` to the Task-0 getters `state.selectionRows.select` / `state.selectionRows.focus`. The row carries the `x/y/z/diameterKpc` the halo + structure-focus need.

> **EXECUTION ORDER (read first).** The runtime stays green only if writes feed the rows BEFORE the readers flip, and the React cutover must immediately follow the write cutover (the pick resolver stops producing a `FocusableTarget`, so the subsystem echo goes stale). Execute in this order: **Task 0 → Task 2 → Task 3 → Task 4 → Task 4b → Task 5 → Task 1 → Task 6 → Task 7 → Task 8.** Tasks 2/3 (sagas) and Task 4/4b (writes → dispatch refs; reconciler fills `selectionRows`; the `watchFocusTween` focus-tween saga) land first; Task 5 (React reads the store, deletes the echo) immediately follows so the InfoCard stays correct; THEN Task 1 flips the per-frame engine reads (rows now populated); the rest follow. Each task is independently reviewable — only this runtime-green ordering differs from the document order. The unit suite is green after every task regardless (no unit test asserts the live React echo or the live per-frame read against production data; the halo/pass tests drive the row directly).

**Files:**
- Modify: `src/services/engine/frame/runFrame.ts` (~line 176-181 focused read → `state.selectionRows.focus`; ~line 266 selected snapshot read). The ~line 420 hover WRITE is in Task 4.
- Modify: `src/services/engine/frame/passes/selectionRingPass.ts`
- Modify: `src/services/engine/helpers/selectionHaloTable.ts`
- Test: `tests/services/engine/helpers/selectionHaloTable.test.ts` (extend/repoint)
- Test: `tests/services/engine/frame/passes/selectionRingPass.test.ts` (grep — extend if exists)

**Interfaces:**
- Consumes: the `state.selection` / `state.selectionRows` getters added in Task 0 (for READS), `selectionHalo`, `SelectionRow`. (For WRITES — Task 4 — `runFrame` dispatches via `deps.cb.store.dispatch` since `RunFrameDeps.cb: EngineCallbacks` and `EngineCallbacks.store: AppStore`.)
- Produces: per-frame reads sourced from the store getters.

- [ ] **Step 1: Confirm the store accessors (already grounded)**

READS use the Task-0 getters: `state.selectionRows.select` / `state.selectionRows.focus` (the per-frame consumers) and `state.selection.<slot>` (refs, if needed). WRITES (Task 4) use `deps.cb.store.dispatch(...)` in `runFrame` (it has `deps.cb`) and `deps.cb.store.dispatch(...)` in `wireInput` (it has `deps.cb`). Do NOT invent a `state.cb.store` accessor — `EngineState` exposes getters, not the raw store; dispatch flows through `deps.cb.store`.

- [ ] **Step 2: Rework `selectionHaloTable.ts` to take a `SelectionRow`**

Today `SELECTION_HALO` is keyed on `FocusableTargetType` and reads `t.diameterKpc`/`t.x` (a `GalaxyInfo`) and `t.x` (a `StructureInfo`/`MilkyWayInfo`). The galaxy `SelectionRow` is a `GalaxyRow` which ALSO carries `x/y/z/diameterKpc`; the structure arm is `StructureInfo` (carries `worldPos`); the milkyWay arm is the tag (no coords). For the milkyWay arm the row has no `x/y/z`, so use `MILKY_WAY_CENTER_WORLD` directly.

```ts
/**
 * SELECTION_HALO — maps a stored SelectionRow to the halo descriptor the
 * selection-ring pass draws (worldPos + radius), or null when the kind has no
 * halo (structures draw their own marker ring). Reads the row's serializable
 * primitives directly — the galaxy arm's GalaxyRow carries x/y/z + diameterKpc,
 * so the halo needs no built GalaxyInfo. The milkyWay arm has no coords on the
 * row, so it uses the static galactic-centre constant.
 */
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../data/milkyWay/milkyWayConstants';
import { MILKY_WAY_CENTER_WORLD } from '../../../data/milkyWay/milkyWayConstants';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { SelectionHalo } from '../../../@types/engine/SelectionHalo';

export const SELECTION_HALO: {
  [K in SelectionRow['type']]: (row: Extract<SelectionRow, { type: K }>) => SelectionHalo | null;
} = {
  galaxyCatalog: (row) => ({
    radiusMpc: ((row.diameterKpc > 0 ? row.diameterKpc : 30) * 2) / 1000,
    worldPos: [row.x, row.y, row.z],
  }),
  milkyWay: () => ({
    radiusMpc: MILKY_WAY_DISC_RADIUS_KPC / 1000,
    worldPos: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
  }),
  structure: () => null,
};

export function selectionHalo(row: SelectionRow | null): SelectionHalo | null {
  if (row === null) return null;
  return (SELECTION_HALO[row.type] as (r: SelectionRow) => SelectionHalo | null)(row);
}
```

Confirm the exact import paths for `MILKY_WAY_DISC_RADIUS_KPC` + `MILKY_WAY_CENTER_WORLD` (grep them) and the `SelectionHalo` type (grep `type SelectionHalo` — reuse the existing one). Update the table's test to pass a `GalaxyRow`/`{type:'milkyWay'}` instead of a `GalaxyInfo`.

- [ ] **Step 3: Cut `selectionRingPass.ts` to read `selectionRows`**

Replace `state.subsystems.selection.selected()` (returns `FocusableTarget`) with the stored row. Match TODAY's slot: the pass reads `selected()`, so read `selectionRows.select`.

```ts
// in enabled():
const row = state.selectionRows.select;
return state.gpu.selectionRingRenderer !== null && selectionHalo(row) !== null;

// in draw():
const row = state.selectionRows.select;
const halo = selectionHalo(row);
if (halo === null) return;
const { radiusMpc, worldPos } = halo;
// ... rest unchanged
```

`state.selectionRows` is the getter added in Task 0 (delegates to `store.getState().selectionRows`). Import `selectionHalo` from the halo table.

- [ ] **Step 4: Cut `runFrame.ts` structure-focus read to `selectionRows.focus`**

At ~line 176-181, replace:

```ts
const focused = state.subsystems.selection.focused();
const focusedStructure = focused !== null && focused.type === 'structure' ? focused : null;
state.subsystems.structureFocus.update(focusedStructure, nowMs);
```

with a read of the focus ROW (a `StructureInfo` arm is itself the focused structure):

```ts
// Read the focus ROW from the store; a structure focus IS the StructureInfo
// arm, so member-isolation reads it directly. Galaxy / milkyWay / null all
// collapse to null (no structure focus → no member fade).
const focusRow = state.selectionRows.focus;
const focusedStructure = focusRow !== null && focusRow.type === 'structure' ? focusRow : null;
state.subsystems.structureFocus.update(focusedStructure, nowMs);
```

Note: `structureFocus.update` expects a `StructureInfo | null`; the `structure` arm of `SelectionRow` IS a `StructureInfo`, so this typechecks. Confirm against `structureFocus.update`'s signature.

- [ ] **Step 5: Move the ~line 266 `selected` snapshot read off the subsystem**

Find the `selected: state.subsystems.selection.selected()` at ~line 266 (a pick-targets / debug snapshot). Replace it with the store equivalent for what it consumes: if it needs the resolved structure, use `state.selectionRows.select`; if only the identity, use `state.selection.select`. Read the surrounding consumer to pick the right shape. (Because this task runs AFTER Task 4 per the execution order, `selectionRows` is populated and the subsystem is no longer written.)

- [ ] **Step 6: Run pass/halo tests + full suite + typecheck**

Per the execution order, Task 4 (writes) and Task 4b (focus tween) have already landed, so the reconciler populates `selectionRows` in production and these store reads light up correctly.

Run: `npm test -- tests/services/engine/helpers/selectionHaloTable.test.ts tests/services/engine/frame` then `npm test` then `npm run typecheck`.
Expected: PASS. Ask the user to verify in the running app: a selected galaxy still shows its ring; a focused cluster still fades non-members.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/helpers/selectionHaloTable.ts src/services/engine/frame/passes/selectionRingPass.ts src/services/engine/frame/runFrame.ts tests/services/engine/helpers/selectionHaloTable.test.ts
git commit -m "refactor(engine): per-frame selection readers read selectionRows from the store

selectionRingPass + runFrame's structure-focus read the saga-reconciled row
(carrying x/y/z + diameterKpc) instead of the subsystem's resolved target.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `watchSelectionWake` (render-on-demand for select/focus)

`select`/`focus` writes wake the loop (halo, focus fade); `hover` must NOT (no GPU consequence). Read `tierSaga.ts` for the `getContext` form.

**Files:**
- Create: `src/state/selection/selectionWakeSaga.ts`
- Modify: `src/store/rootSaga.ts` (fork it)
- Test: `tests/state/selection/selectionWakeSaga.test.ts`

**Interfaces:**
- Consumes: `updateSelectionSelect`, `updateSelectionFocus`, `updateSelectionHover`, `ReconcileEffects` (reached via `getContext('reconcile')` — `requestRender` lives there, PR #352).
- Produces: `watchSelectionWake` generator.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchSelectionWake } from '../../../src/state/selection/selectionWakeSaga';
import { updateSelectionSelect, updateSelectionFocus, updateSelectionHover } from '../../../src/state/selection/selectionSlice';
import type { ReconcileEffects } from '../../../src/store/effects/ReconcileEffects';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchSelectionWake', () => {
  let store: ReturnType<typeof build>;
  let requestRender: ReturnType<typeof vi.fn<() => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchSelectionWake);
    requestRender = vi.fn<() => void>();
    // requestRender lives in the reconcile bag (PR #352); inject the whole
    // surface with spies, mirroring tests/store/effects/reconcileSagas.test.ts.
    const reconcile: ReconcileEffects = {
      requestRender,
      syncFades: vi.fn(),
      reseedFlow: vi.fn(),
      bakeBias: vi.fn(),
    };
    mw.setContext({ reconcile });
    return s;
  }
  beforeEach(() => { store = build(); });

  it('select wakes the loop', async () => {
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
  it('focus wakes the loop', async () => {
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
  it('hover does NOT wake the loop', async () => {
    store.dispatch(updateSelectionHover({ type: 'milkyWay' }));
    await flush();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to fail, then implement**

Run: `npm test -- tests/state/selection/selectionWakeSaga.test.ts` → FAIL.

```ts
/**
 * watchSelectionWake — render-on-demand for selection. A select or focus write
 * has a GPU consequence (the selection ring, the member-isolation fade), so it
 * wakes the loop via requestRender. Hover has NO GPU consequence — it only
 * feeds the React InfoCard — so it is deliberately absent. A no-op re-select
 * still dispatches the action (the reducer no-ops the STATE, not the action),
 * so requestRender fires once; it's idempotent and coalesced into one rAF —
 * accepted as the cost of the uniform saga vehicle.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { updateSelectionSelect, updateSelectionFocus } from './selectionSlice';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

export function* watchSelectionWake() {
  // requestRender lives in the reconcile bag the engine already injects (PR #352) —
  // reuse it rather than adding a second wake capability to SagaContext.
  const fx = yield* getContext<ReconcileEffects>('reconcile');
  yield* takeEvery([updateSelectionSelect, updateSelectionFocus], () => fx.requestRender());
}
```

Note: confirm `takeEvery` accepts an action-creator array in the installed `typed-redux-saga`; if not, fork two `takeEvery`s. Mirror whatever typechecks.

- [ ] **Step 3: Fork from `rootSaga`**

Append `watchSelectionWake()` to the existing fork list (which already carries the four reconcile watchers plus `watchTier` and Part 1's `watchSelectionRows`):

```ts
import { watchSelectionWake } from '../state/selection/selectionWakeSaga';
// ...
yield* all([
  watchTier(),
  watchWake(),
  watchFlowReseed(),
  watchBiasBake(),
  watchFades(),
  watchSelectionRows(),
  watchSelectionWake(),
]);
```

- [ ] **Step 4: Run to pass, full suite, typecheck, commit**

Run: `npm test -- tests/state/selection/selectionWakeSaga.test.ts` → PASS. Then `npm test`, `npm run typecheck`.

```bash
git add src/state/selection/selectionWakeSaga.ts src/store/rootSaga.ts tests/state/selection/selectionWakeSaga.test.ts
git commit -m "feat(state): add watchSelectionWake (select/focus wake the loop, hover doesn't)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `watchRequestFocus` (deep-link / palette command → ref, deferred on catalogLoaded)

Resolves a durable focus id to a ref, looping on `catalogLoaded` until the cloud is ready, then dispatching `updateSelectionFocus(ref)`; the reconciler (Part 1) fills the row.

**Files:**
- Create: `src/state/selection/requestFocusSaga.ts`
- Modify: `src/store/rootSaga.ts` (fork it)
- Test: `tests/state/selection/requestFocusSaga.test.ts`

**Interfaces:**
- Consumes: `requestFocus`, `catalogLoaded`, `updateSelectionFocus`, `resolveFocusId`, `SagaContext['resolveDeps']`.
- Produces: `watchRequestFocus` generator.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchRequestFocus } from '../../../src/state/selection/requestFocusSaga';
import { watchSelectionRows } from '../../../src/state/selectionRows/selectionRowsSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { catalogLoaded } from '../../../src/state/dataStatus/dataStatusSlice';
import { selectionRoute } from '../../../src/store/constants';
import { Source } from '../../../src/data/sources';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchRequestFocus', () => {
  let store: ReturnType<typeof build>;
  let structurePresent = true;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    const deps: ResolveDeps = {
      catalogs: { get: () => undefined },
      famousMeta: [],
      structures: { byId: (id) => (structurePresent && id === 'abell-2065' ? ({ type: 'structure', id } as never) : null) },
    };
    mw.run(watchRequestFocus);
    mw.run(watchSelectionRows);
    mw.setContext({ resolveDeps: () => deps });
    return s;
  }
  beforeEach(() => { structurePresent = true; store = build(); });

  it('resolves a structure id immediately into the focus ref', async () => {
    store.dispatch(requestFocus('abell-2065'));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'structure', id: 'abell-2065' });
  });

  it('defers an unresolvable id, then resolves on catalogLoaded', async () => {
    structurePresent = false;
    store.dispatch(requestFocus('abell-2065'));
    await flush();
    expect(store.getState()[selectionRoute].focus).toBeNull();

    structurePresent = true;
    store.dispatch(catalogLoaded({ source: Source.SDSS, generation: 1 }));
    await flush();
    expect(store.getState()[selectionRoute].focus).toEqual({ type: 'structure', id: 'abell-2065' });
  });
});
```

(Adjust `resolveFocusId`'s structure handling so a bare known id resolves to `{type:'structure', id}` — Part 1 Task 6 built it; if it gates structures on a `STRUCTURE_IDS` registry that doesn't include `abell-2065`, use a real registered structure id in the test.)

- [ ] **Step 2: Run to fail, then implement**

Run: `npm test -- tests/state/selection/requestFocusSaga.test.ts` → FAIL.

```ts
/**
 * watchRequestFocus — the deep-link / palette command handler. requestFocus
 * carries a durable focus id; this resolves it to a ref via resolveFocusId,
 * DEFERRING on catalogLoaded while the id is unresolvable (the cloud for a deep
 * link, or a tier galaxy still fetching). Once resolved it dispatches
 * updateSelectionFocus(ref); the watchSelectionRows reconciler then fills the
 * row off that write. takeLatest aborts a stale deferral if a newer requestFocus
 * arrives. This is the single command→ref bridge; React never resolves ids.
 */
import { takeLatest, take, put, getContext } from 'typed-redux-saga';

import { requestFocus } from './requestFocus';
import { updateSelectionFocus } from './selectionSlice';
import { catalogLoaded } from '../dataStatus/dataStatusSlice';
import { resolveFocusId } from '../../services/url/resolveFocusId';
import type { SagaContext } from '../../store/types';

export function* watchRequestFocus() {
  yield* takeLatest(requestFocus, function* (action) {
    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    let ref = resolveFocusId(action.payload, resolveDeps());
    while (!ref) {
      yield* take(catalogLoaded);
      ref = resolveFocusId(action.payload, resolveDeps());
    }
    yield* put(updateSelectionFocus(ref));
  });
}
```

- [ ] **Step 3: Fork from `rootSaga`**

Append `watchRequestFocus()` to the fork list:

```ts
import { watchRequestFocus } from '../state/selection/requestFocusSaga';
// ...
yield* all([
  watchTier(),
  watchWake(),
  watchFlowReseed(),
  watchBiasBake(),
  watchFades(),
  watchSelectionRows(),
  watchSelectionWake(),
  watchRequestFocus(),
]);
```

- [ ] **Step 4: Run to pass, full suite, typecheck, commit**

Run: `npm test -- tests/state/selection/requestFocusSaga.test.ts` → PASS. Then `npm test`, `npm run typecheck`.

```bash
git add src/state/selection/requestFocusSaga.ts src/store/rootSaga.ts tests/state/selection/requestFocusSaga.test.ts
git commit -m "feat(state): add watchRequestFocus (durable id -> ref, deferred on catalogLoaded)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Cut the writes — pick path produces a `SelectionRef`; wireInput dispatches

Make `resolvePick`/`resolvePickTable`/the click resolver produce a `SelectionRef` (not a `FocusableTarget`); rewrite `wireInput`'s handlers to dispatch refs to `cb.store`. After this task the reconciler populates `selectionRows` in production, so Task 1's store readers light up.

**Files:**
- Modify: `src/services/engine/helpers/resolvePickTable.ts` (each arm → ref)
- Modify: `src/services/engine/helpers/resolvePick.ts` (return `SelectionRef | null`)
- Modify: `src/services/engine/interaction/clickHandler.ts` (`resolveClick` → `SelectionRef | null`)
- Modify: `src/@types/engine/ClickResolver.d.ts` (or wherever `resolveClick`'s return is typed)
- Modify: `src/services/engine/phases/wireInput.ts` (handlers dispatch)
- Modify: `src/services/engine/frame/runFrame.ts` (~line 420 hover write → dispatch ref; ~line 266 if it needs the ref)
- Test: `tests/services/engine/helpers/resolvePick.test.ts` (repoint expectations to refs)

**Interfaces:**
- Consumes: `SelectionRef`, `updateSelectionHover/Select/Focus`, `clearSelection`, `selectSelectedRef`, the engine store via `deps.cb.store` (in `wireInput` and `runFrame`), `resolveStructureFromPick` (to get the structure id), `pick.sourceCode`/`pick.localIdx`.
- Produces: `resolvePick(pick, deps): SelectionRef | null`.

- [ ] **Step 1: Rework `resolvePickTable.ts` to emit refs**

```ts
/**
 * RESOLVE_PICK — table dispatch turning a decoded pick into a SelectionRef
 * (identity), not a resolved FocusableTarget. The galaxy arm is positional
 * (source + localIdx); the structure arm resolves the pick index to the record
 * to recover its durable id; the Milky Way is the singleton tag. The display
 * row is materialized later by the reconciler — the pick only commits identity.
 */
import { resolveStructureFromPick } from './resolveStructureFromPick';
import type { SourceEntry } from '../../../@types/data/SourceEntry';
import type { PickResult } from '../../../@types/data/PickResult';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { StructureId } from '../../../@types/data/structure/StructureId';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export const RESOLVE_PICK: Partial<
  Record<
    SourceEntry['type'],
    (entry: SourceEntry, pick: PickResult, deps: ResolvePickDeps) => SelectionRef | null
  >
> = {
  galaxyCatalog: (_entry, pick) => ({
    type: 'galaxyCatalog',
    source: pick.sourceCode as GalaxyCatalogSourceType,
    index: pick.localIdx,
  }),
  structure: (entry, pick, deps) => {
    if (entry.type !== 'structure') return null;
    const record = resolveStructureFromPick(deps.structures, {
      category: entry.id as StructureId,
      structureIndex: pick.localIdx,
    });
    return record ? { type: 'structure', id: record.id } : null;
  },
  milkyWay: () => ({ type: 'milkyWay' }),
};
```

`ResolvePickDeps` now only needs `structures` (the galaxy arm no longer reads the cloud — identity is positional). Simplify `ResolvePickDeps` to `{ structures }` and drop `getCloud`/`getFamousMeta` from the resolver wiring in `wireInput`/`clickHandler`/`runFrame` hover. (Confirm nothing else uses those two on the resolver path; the cloud read now happens in the reconciler via `resolveDeps`.)

- [ ] **Step 2: Rework `resolvePick.ts` return type**

```ts
import { SOURCE_REGISTRY } from '../../../data/sources';
import { RESOLVE_PICK } from './resolvePickTable';
import type { PickResult } from '../../../@types/data/PickResult';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { ResolvePickDeps } from '../../../@types/engine/ResolvePickDeps';

export function resolvePick(pick: PickResult | null, deps: ResolvePickDeps): SelectionRef | null {
  if (pick === null) return null;
  const entry = SOURCE_REGISTRY[pick.sourceCode];
  const resolve = entry ? RESOLVE_PICK[entry.type] : undefined;
  if (resolve === undefined) {
    console.warn(`resolvePick: source code ${pick.sourceCode} is not a pickable surface`);
    return null;
  }
  return resolve(entry, pick, deps);
}
```

Update the module docblock (it currently says "becomes a fully RESOLVED FocusableTarget" — now it's "a SelectionRef identity").

- [ ] **Step 3: Update the click resolver return type**

In `clickHandler.ts`, `resolveClick` now returns `Promise<SelectionRef | null>`; update its type (`ClickResolver`/`ClickResolveInput` return) and the `deps` bundle (only `structures`). Update the docblock.

- [ ] **Step 4: Rewrite `wireInput.ts` handlers to dispatch refs**

`wireInput` has `deps.cb.store` (the `AppStore`). Replace the subsystem calls:

```ts
// onClick: single-click = select a ref (null clears).
onClick: (xCss, yCss) => {
  const pick = runPickAtCss(xCss, yCss);
  if (!pick) return;
  pick.then((ref) => {
    deps.cb.store.dispatch(updateSelectionSelect(ref));
  });
},
// onDoubleClick: upgrade the current select ref to focus; the tween is the
// effect, dispatched/triggered downstream. Empty space (null select) → release focus.
onDoubleClick: () => {
  const ref = selectSelectedRef(deps.cb.store.getState());
  deps.cb.store.dispatch(updateSelectionFocus(ref));
},
```

The focus tween (today run by `commitGalaxyFocus`/`commitStructureFocus`/`commitMilkyWayFocus`) is an imperative engine effect, not reducer state. It is relocated to the `watchFocusTween` saga + the engine-injected `runFocusTween` runner in Task 4b; here the double-click only dispatches the ref.

For `onPointerLeave`/`onPointerDown`: `deps.cb.store.dispatch(updateSelectionHover(null))`. For `onEscape`: `deps.cb.store.dispatch(clearSelection())`.

Import `updateSelectionSelect`, `updateSelectionFocus`, `updateSelectionHover`, `clearSelection`, `selectSelectedRef`.

> **Coupling note — Task 4 + Task 5 land as a back-to-back pair.** The pick resolver now returns a `SelectionRef`, NOT a `FocusableTarget`, so the old `state.subsystems.selection.setSelected(target)` call can no longer be fed (its contract wants a resolved target). We therefore DELETE the subsystem setter calls in this task and rely on the store path for React. But React still reads the subsystem echo until Task 5. So **execute Task 5 immediately after Task 4 (and 4b) — commit each separately, but do not run the app for users until Task 5 lands.** The unit suite stays green after Task 4 alone (no unit test asserts the React echo against a live engine). This is the one place the read+write cutover is genuinely atomic; keeping them adjacent is cleaner than synthesizing a throwaway `buildFocusable(extractSelectionRow(ref, …))` dual-write just to keep the dying subsystem fed for one commit.

- [ ] **Step 5: Rewrite `runFrame.ts` hover write (~line 420)**

```ts
.then((ref) => {
  deps.cb.store.dispatch(updateSelectionHover(ref));
})
```

`runFrame` reaches the store's dispatch via `deps.cb.store` (`RunFrameDeps.cb.store: AppStore`). `resolvePick(pick, { structures: state.data.structures })` now yields a ref. Remove the `getCloud`/`getFamousMeta` from the hover resolver deps. For the ~line 266 `selected:` snapshot, replace with `state.selection.select` (the ref) if it needs the identity, or `state.selectionRows.focus` if it needs the resolved structure — read the surrounding code to see what consumes it and pass the matching shape.

- [ ] **Step 6: Update `resolvePick.test.ts`**

Repoint expectations: a galaxy pick → `{ type:'galaxyCatalog', source, index }`; a structure pick → `{ type:'structure', id }`; a milkyWay pick → `{ type:'milkyWay' }`; an unpickable code → null.

- [ ] **Step 7: Run the unit suite + typecheck**

Run: `npm test` then `npm run typecheck`.
Expected: PASS. After this task the store path is fully fed (dispatches → reconciler → `selectionRows`); the subsystem setter calls are gone. React still reads the (now stale) subsystem echo until Task 5, so do NOT ship to users between Task 4 and Task 5 — land Task 4b + Task 5 next. The unit suite is fully green throughout (no unit test asserts the live React echo).

- [ ] **Step 8: Commit**

```bash
git add src/services/engine/helpers/resolvePick.ts src/services/engine/helpers/resolvePickTable.ts src/services/engine/interaction/clickHandler.ts src/@types/engine/ClickResolver.d.ts src/@types/engine/ResolvePickDeps.d.ts src/services/engine/phases/wireInput.ts src/services/engine/frame/runFrame.ts tests/services/engine/helpers/resolvePick.test.ts
git commit -m "refactor(engine): pick path emits a SelectionRef; wireInput dispatches refs

Single-click dispatches updateSelectionSelect(ref), double-click promotes the
select ref to focus, hover/leave/Esc dispatch their refs/clear. The reconciler
fills selectionRows off these writes. Identity is positional for galaxies,
durable-id for structures.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4b: The focus-tween effect (a saga on the focus ref + an engine-injected runner)

Today the tween fired inside `commitGalaxyFocus`/`commitStructureFocus`/`commitMilkyWayFocus` as their last step. With those deleted, the camera tween becomes an EFFECT of the focus Intent: a `watchFocusTween` saga reacts to `updateSelectionFocus` and calls an engine-injected `runFocusTween(ref)` runner — symmetric with how `watchSelectionWake` calls `requestRender` and `tierSaga` calls `runTierTransition`. The runner is engine-owned (it touches cam + GPU), reached through the `SagaContext` seam, so ADR 0001's no-store-effects stance holds and the design stays uniform (no lone `store.subscribe`).

Why fire on the REF, not the reconciled row: a tween is the camera's response to a focus *gesture* (the Intent), not to the `selectionRows` cache being refilled. Firing on the ref also means the runner doesn't depend on whether `watchSelectionRows` ran first — it re-resolves the coords itself via the same `resolveDeps` the engine already injects. By the time `updateSelectionFocus(ref)` is dispatched the data is always loaded (`requestFocus` defers until resolvable; picks look at loaded clouds; the tier re-anchor dispatches *after* `catalogLoaded`), so the runner always resolves. A `null` ref (focus release) is a no-op tween. The slice's dedup-on-write means a no-op re-focus of the same ref doesn't even dispatch a state change — but note the action still fires, so a tier re-anchor (a genuinely different index) re-runs the tween; that is a benign near-noop ride (camera already framing the same galaxy) and the code stays uniform — no special-case branch.

**Files:**
- Create: `src/services/engine/camera/makeRunFocusTween.ts` (the engine-side runner factory — mirrors `makeRunTierTransition`)
- Create: `src/state/selection/focusTweenSaga.ts` (`watchFocusTween`)
- Modify: `src/store/types.ts` (add `runFocusTween` to `SagaContext`)
- Modify: `src/services/engine/engine.ts` (inject `runFocusTween` in the `setSagaContext` call extended in Task 10 of Part 1)
- Modify: `src/store/rootSaga.ts` (fork `watchFocusTween`)
- Test: `tests/services/engine/camera/makeRunFocusTween.test.ts`, `tests/state/selection/focusTweenSaga.test.ts`

**Interfaces:**
- Consumes: `SelectionRef`, `SelectionRow`, `ResolveDeps`, `extractSelectionRow`, `buildGalaxyInfo`, `tweenToGalaxy`/`tweenToStructure`/`tweenToCameraSnapshot` + the milkyWay snapshot inputs (`MILKY_WAY_CENTER_WORLD`, `MILKY_WAY_VIEW_DISTANCE_MPC`), `updateSelectionFocus`, `SagaContext['runFocusTween']`, the engine `EngineState`.
- Produces: `makeRunFocusTween(resolveDeps, tweens): (ref: SelectionRef | null) => void`; `watchFocusTween` generator; `SagaContext.runFocusTween`.

- [ ] **Step 1: Read the tween signatures**

Run: `grep -rn "export function tweenToGalaxy\|export function tweenToStructure\|tweenToCameraSnapshot\|MILKY_WAY_CENTER_WORLD\|MILKY_WAY_VIEW_DISTANCE" src/services/engine`
Note: `tweenToGalaxy(state, info: GalaxyInfo)`, `tweenToStructure(state, structure: StructureInfo)`, and `commitMilkyWayFocus`'s `tweenToCameraSnapshot(...)` body (lift it verbatim in Step 4). The galaxy arm builds a `GalaxyInfo` from the resolved `GalaxyRow` via `buildGalaxyInfo(row)`; the structure arm IS a `StructureInfo` already.

- [ ] **Step 2: Add `runFocusTween` to `SagaContext`**

In `src/store/types.ts`, after the Part-1 `resolveDeps` member, add (and update the module docblock to name it):

```ts
import type { SelectionRef } from '../@types/engine/SelectionRef';
// ... existing imports (ResolveDeps already added in Part 1 Task 10)

export type RunFocusTween = (ref: SelectionRef | null) => void;

export type SagaContext = {
  runTierTransition: RunTierTransition; // PR #349
  reconcile: ReconcileEffects;          // PR #352 — provides requestRender
  resolveDeps: () => ResolveDeps;        // Part 1 Task 10
  /** Engine-owned camera-tween runner — watchFocusTween calls this on a focus ref change. */
  runFocusTween: RunFocusTween;
};
```

`SetSagaContext` already takes `Partial<SagaContext>`, so no setter change. Extend the Part-1 `SagaContext` type test (`tests/store/sagaContext.test.ts`) with `expectTypeOf<SagaContext['runFocusTween']>().toEqualTypeOf<(ref: SelectionRef | null) => void>();`.

- [ ] **Step 3: Write the failing test + implement `makeRunFocusTween`**

The runner is split from the GPU/cam table so it is hermetic: it resolves the ref → row via `resolveDeps`, then dispatches by tag to an injected `tweens` table. The engine builds the real table (closing over `state`) in Step 4; the test injects spies.

```ts
import { describe, it, expect, vi } from 'vitest';

import { makeRunFocusTween } from '../../../../src/services/engine/camera/makeRunFocusTween';
import { Source } from '../../../../src/data/sources';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

function makeCloud(): GalaxyCatalog {
  return {
    count: 1, positions: new Float32Array([10, 20, 30]), spectroscopicZ: new Float32Array([0.0123]),
    magU: new Float32Array([18.1]), magG: new Float32Array([17.4]), magR: new Float32Array([16.9]),
    magI: new Float32Array([16.6]), magZ: new Float32Array([16.4]), objIDs: new BigInt64Array([1237668n]),
    diameterKpc: new Float32Array([42]), axisRatio: new Float32Array([0.7]), positionAngleDeg: new Float32Array([35]),
    classByte: new Uint8Array([0]), parentSurveyByte: new Uint8Array([0]),
  } as unknown as GalaxyCatalog;
}

const structure = { type: 'structure', category: 'cluster', id: 'abell-2065' } as unknown as StructureInfo;

const deps: ResolveDeps = {
  catalogs: { get: (s) => (s === Source.SDSS ? makeCloud() : undefined) },
  famousMeta: [],
  structures: { byId: (id) => (id === 'abell-2065' ? structure : null) },
};

describe('makeRunFocusTween', () => {
  function build() {
    const tweens = { galaxyCatalog: vi.fn(), structure: vi.fn(), milkyWay: vi.fn() };
    return { run: makeRunFocusTween(() => deps, tweens), tweens };
  }
  it('galaxy ref → galaxy tween with the resolved row', () => {
    const { run, tweens } = build();
    run({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 });
    expect(tweens.galaxyCatalog).toHaveBeenCalledTimes(1);
    expect(tweens.galaxyCatalog.mock.calls[0]![0]).toMatchObject({ type: 'galaxyCatalog', objId: '1237668' });
  });
  it('structure ref → structure tween', () => {
    const { run, tweens } = build();
    run({ type: 'structure', id: 'abell-2065' });
    expect(tweens.structure).toHaveBeenCalledWith(structure);
  });
  it('milkyWay ref → milkyWay tween', () => {
    const { run, tweens } = build();
    run({ type: 'milkyWay' });
    expect(tweens.milkyWay).toHaveBeenCalledTimes(1);
  });
  it('null ref → no tween (focus release)', () => {
    const { run, tweens } = build();
    run(null);
    expect(tweens.galaxyCatalog).not.toHaveBeenCalled();
    expect(tweens.structure).not.toHaveBeenCalled();
    expect(tweens.milkyWay).not.toHaveBeenCalled();
  });
  it('galaxy ref to an unloaded cloud → no tween (resolves null)', () => {
    const { run, tweens } = build();
    run({ type: 'galaxyCatalog', source: Source.Glade, index: 0 });
    expect(tweens.galaxyCatalog).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- tests/services/engine/camera/makeRunFocusTween.test.ts` → FAIL, then implement:

```ts
/**
 * makeRunFocusTween — the engine-side camera-tween runner the watchFocusTween
 * saga calls through SagaContext (symmetric with makeRunTierTransition). Given a
 * focus SelectionRef it re-resolves the row via the live `resolveDeps` (so it
 * never depends on the reconciler having run first), then dispatches by tag to
 * an injected `tweens` table. The table is injected — not closed over here — so
 * this stays pure and hermetic; the engine builds the real GPU/cam table.
 *
 * A null ref (focus release) or a ref whose cloud is not loaded resolves to null
 * → no tween. The tweens themselves are untouched; this only relocates their
 * TRIGGER from the deleted commitFocus helpers to a saga effect.
 */
import { extractSelectionRow } from '../helpers/extractSelectionRow';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';

export type FocusTweenTable = {
  galaxyCatalog: (row: Extract<SelectionRow, { type: 'galaxyCatalog' }>) => void;
  structure: (row: Extract<SelectionRow, { type: 'structure' }>) => void;
  milkyWay: () => void;
};

export function makeRunFocusTween(
  resolveDeps: () => ResolveDeps,
  tweens: FocusTweenTable,
): (ref: SelectionRef | null) => void {
  return (ref) => {
    const row = extractSelectionRow(ref, resolveDeps());
    if (row === null) return;
    if (row.type === 'galaxyCatalog') tweens.galaxyCatalog(row);
    else if (row.type === 'structure') tweens.structure(row);
    else tweens.milkyWay();
  };
}
```

Run: `npm test -- tests/services/engine/camera/makeRunFocusTween.test.ts` → PASS.

- [ ] **Step 4: Inject `runFocusTween` in the engine's `setSagaContext`**

In `src/services/engine/engine.ts`, the Part-1 Task-10 call built `{ runTierTransition, reconcile, resolveDeps }` (`reconcile` lands via PR #352; `requestRender` lives inside it). Lift the `resolveDeps` closure into a named const so both `resolveDeps` and the runner share it, and add `runFocusTween` with the real GPU/cam table (the milkyWay body lifted verbatim from the deleted `commitMilkyWayFocus.ts`):

```ts
const resolveDeps = (): ResolveDeps => ({
  catalogs: { get: (source) => state.data.galaxies.get(source) },
  famousMeta: state.data.galaxies.famousMeta,
  structures: { byId: (id) => state.data.structures.byId(id) },
});

cb.setSagaContext({
  runTierTransition: makeRunTierTransition(state, bootstrapDeps),
  reconcile: makeReconcileEffects(state),
  resolveDeps,
  runFocusTween: makeRunFocusTween(resolveDeps, {
    galaxyCatalog: (row) => tweenToGalaxy(state, buildGalaxyInfo(row)),
    structure: (row) => tweenToStructure(state, row),
    milkyWay: () => {
      const cam = state.cam;
      if (!cam) return;
      tweenToCameraSnapshot(state, {
        target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
        distance: MILKY_WAY_VIEW_DISTANCE_MPC,
        yaw: cam.yaw, pitch: cam.pitch, fovYRad: cam.fovYRad, near: cam.near, far: cam.far,
      });
    },
  }),
});
```

Add the imports (`makeRunFocusTween`, `buildGalaxyInfo`, `tweenToGalaxy`, `tweenToStructure`, `tweenToCameraSnapshot`, `MILKY_WAY_CENTER_WORLD`, `MILKY_WAY_VIEW_DISTANCE_MPC`, `ResolveDeps`). No teardown bag is needed — unlike a `store.subscribe`, the saga is torn down when the saga middleware stops, so there is no per-engine unsubscribe to register.

- [ ] **Step 5: Write the failing saga test + implement `watchFocusTween`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { watchFocusTween } from '../../../src/state/selection/focusTweenSaga';
import { updateSelectionFocus, updateSelectionSelect } from '../../../src/state/selection/selectionSlice';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('watchFocusTween', () => {
  let store: ReturnType<typeof build>;
  let runFocusTween: ReturnType<typeof vi.fn<(ref: unknown) => void>>;

  function build() {
    const mw = createSagaMiddleware();
    const s = configureStore({ reducer: rootReducer, middleware: (g) => g().concat(mw) });
    mw.run(watchFocusTween);
    runFocusTween = vi.fn<(ref: unknown) => void>();
    mw.setContext({ runFocusTween });
    return s;
  }
  beforeEach(() => { store = build(); });

  it('a focus ref change runs the tween with the ref', async () => {
    store.dispatch(updateSelectionFocus({ type: 'milkyWay' }));
    await flush();
    expect(runFocusTween).toHaveBeenCalledWith({ type: 'milkyWay' });
  });
  it('a select (non-focus) write does NOT run the tween', async () => {
    store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    await flush();
    expect(runFocusTween).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- tests/state/selection/focusTweenSaga.test.ts` → FAIL, then implement:

```ts
/**
 * watchFocusTween — the camera-tween EFFECT. A focus gesture writes the focus
 * ref (updateSelectionFocus); the camera flying to the target is an effect of
 * that Intent, so it lives here as a saga — symmetric with watchSelectionWake
 * (render-wake) and tierSaga's runTierTransition. It calls the engine-injected
 * runFocusTween runner via SagaContext; the runner resolves the ref's coords
 * from the live cloud and runs the existing tweens. Firing on the REF (not the
 * reconciled row) keeps the tween a response to the Intent and free of any
 * dependence on watchSelectionRows running first.
 */
import { takeEvery, getContext } from 'typed-redux-saga';

import { updateSelectionFocus } from './selectionSlice';
import type { SagaContext } from '../../store/types';

export function* watchFocusTween() {
  const runFocusTween = yield* getContext<SagaContext['runFocusTween']>('runFocusTween');
  yield* takeEvery(updateSelectionFocus, (action) => runFocusTween(action.payload));
}
```

- [ ] **Step 6: Fork from `rootSaga`**

Append `watchFocusTween()` to the fork list — the full set after this task:

```ts
import { watchFocusTween } from '../state/selection/focusTweenSaga';
// ...
yield* all([
  watchTier(),
  watchWake(),
  watchFlowReseed(),
  watchBiasBake(),
  watchFades(),
  watchSelectionRows(),
  watchSelectionWake(),
  watchRequestFocus(),
  watchFocusTween(),
]);
```

- [ ] **Step 7: Run to pass, full suite, typecheck, commit**

Run: `npm test -- tests/state/selection/focusTweenSaga.test.ts tests/services/engine/camera/makeRunFocusTween.test.ts` → PASS. Then `npm test`, `npm run typecheck`.

```bash
git add src/services/engine/camera/makeRunFocusTween.ts src/state/selection/focusTweenSaga.ts src/store/types.ts src/services/engine/engine.ts src/store/rootSaga.ts tests/services/engine/camera/makeRunFocusTween.test.ts tests/state/selection/focusTweenSaga.test.ts tests/store/sagaContext.test.ts
git commit -m "feat(engine): run the focus tween as a saga effect via an injected runFocusTween

The camera tween becomes an effect of the focus Intent: watchFocusTween reacts
to updateSelectionFocus and calls the engine-injected runFocusTween runner via
SagaContext, symmetric with runTierTransition. The tweens themselves are
untouched; this relocates their trigger off the deleted commitFocus helpers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Cut the React read — `useEngine` mirrors deleted, App reads selectors

Delete the `hovered/selected/focused` `useState` + echo callbacks; App reads `useAppSelector(selectXFocusable)`; InfoCard keeps its props.

**Files:**
- Modify: `src/hooks/useEngine.ts` (delete the three `useState` + the `onHoverChange`/`onSelectChange`/`onFocusChange` wiring + the return fields)
- Modify: `src/@types/engine/UseEngineReturn.d.ts` (drop `hovered/selected/focused`)
- Modify: `src/@types/engine/EngineCallbacks.d.ts` (drop the echo callbacks)
- Modify: `src/components/App/App.tsx` (read selectors; rewrite InfoCard/CommandPalette props)
- Test: `tests/components/App/App.test.tsx` (grep — adjust if it asserts engine echo) and/or `tests/hooks/useEngine.test.ts`

**Interfaces:**
- Consumes: `selectSelectedFocusable`, `selectHoveredFocusable`, `selectFocusedFocusable`, `selectSelectedRef`, `useAppSelector`, `useAppDispatch`, `requestFocus`, `clearSelection`, `updateSelectionFocus`.
- Produces: a pure-store React read path.

- [ ] **Step 1: Delete the `useState` mirrors + echo wiring in `useEngine.ts`**

Remove `const [hovered, setHovered] = useState(...)`, `selected`, `focused`. Remove `selection: { onHoverChange: setHovered, onSelectChange: setSelected, ...extraSelection }` and `camera.onFocusChange: setFocused` from the `createEngine` options (keep `onCameraChange`, `extraCamera`, `extraSelection` if any other extra-callbacks remain — check what `extraSelection` carries; if it was ONLY the echoes, drop it). Remove `hovered/selected/focused` from the return object. Keep `FocusableTarget` import only if still used (likely remove).

- [ ] **Step 2: Update `UseEngineReturn.d.ts` + `EngineCallbacks.d.ts`**

Drop `hovered`/`selected`/`focused` from `UseEngineReturn`. In `EngineCallbacks.d.ts`, drop `selection.onHoverChange`/`onSelectChange` and `camera.onFocusChange`. If the `selection` cluster becomes empty, decide whether to keep it for `extraSelection` subscriptions (e.g. `onStructureHoverChange` — grep) or remove it; preserve any non-selection events that ride the cluster.

- [ ] **Step 3: Rewrite `App.tsx` reads + writes**

```ts
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectSelectedFocusable, selectHoveredFocusable, selectFocusedFocusable, selectSelectedRef,
} from '../../state/selection/selectors';
import { requestFocus } from '../../state/selection/requestFocus';
import { clearSelection, updateSelectionFocus } from '../../state/selection/selectionSlice';
import { MILKY_WAY_INFO } from '../../data/milkyWay/milkyWayInfo';

// inside the component, replacing the destructure of hovered/selected/focused from useEngine:
const dispatch = useAppDispatch();
const hovered = useAppSelector(selectHoveredFocusable);
const selected = useAppSelector(selectSelectedFocusable);
const focused = useAppSelector(selectFocusedFocusable);
```

`useEngine()` no longer returns those — update the destructure (keep `handleRef`, `status`, `scale`, `sourceCounts`, `structureCounts`, `loadProgress`).

InfoCard props:

```tsx
<InfoCard
  hovered={hovered}
  selected={selected}
  selectedMemberCount={selectedMemberCount}
  onFocus={(target) => {
    // Promote the displayed selection to focus by its ref. The card's target is
    // a FocusableTarget; dispatch the matching ref (galaxy: source+index;
    // structure: id; milkyWay: tag). The watchFocusTween saga runs the tween off the ref.
    dispatch(updateSelectionFocus(refOf(target)));
  }}
  onClose={() => dispatch(clearSelection())}
/>
```

`refOf(target: FocusableTarget): SelectionRef` is a tiny pure mapper (galaxy → `{type, source, index}`; structure → `{type:'structure', id}`; milkyWay → `{type:'milkyWay'}`). Create it as `src/services/engine/helpers/refOf.ts` with a focused test (galaxy/structure/milkyWay arms). The galaxy `FocusableTarget` (`GalaxyInfo`) carries `source` + `index`, so the mapping is direct.

CommandPalette props:

```tsx
<CommandPalette
  // ...
  onSelect={(id) => dispatch(requestFocus(id))}                       // famous id is a durable focus id
  onSelectAlias={(target) => dispatch(requestFocus(aliasFocusId(target)))} // (source,localIdx) → focusId, see note
  onSelectMilkyWay={() => dispatch(updateSelectionFocus({ type: 'milkyWay' }))}
/>
```

Note on `onSelectAlias`: today it called `selectByAlias({source, localIdx})`. The cleanest store equivalent is to dispatch `updateSelectionFocus({ type:'galaxyCatalog', source, index: localIdx })` directly (the cloud is loaded — the palette only offers loaded rows), letting the reconciler + watchFocusTween handle the rest. Prefer that over inventing an `aliasFocusId`:

```tsx
onSelectAlias={(target) => dispatch(updateSelectionFocus({ type: 'galaxyCatalog', source: target.source, index: target.localIdx }))}
```

(Confirm `target.source` is a `GalaxyCatalogSourceType`; if it's `SourceType`, narrow or cast at this boundary.)

- [ ] **Step 4: Run the React/component tests + full suite + typecheck**

Run: `npm test` then `npm run typecheck`.
Expected: PASS. Fix any test that asserted the old engine echo (`onSelectChange` etc.) to instead drive the store and assert via selectors. Ask the user to verify the InfoCard still shows hover/select/focus correctly in the running app.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useEngine.ts src/@types/engine/UseEngineReturn.d.ts src/@types/engine/EngineCallbacks.d.ts src/components/App/App.tsx src/services/engine/helpers/refOf.ts tests/services/engine/helpers/refOf.test.ts
git commit -m "refactor(react): read selection from the store; delete useEngine mirrors + echo

App reads useAppSelector(selectXFocusable) and dispatches refs/commands; the
hovered/selected/focused useState + onHoverChange/onSelectChange/onFocusChange
echo callbacks are gone. InfoCard props unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Cut `useUrlSync` + `CommandPalette` deep-link/URL over to the store

The URL write reads `selectFocusRef` + `focusIdOf`; the deep-link read dispatches `requestFocus(hashFocusId)`; the drain effects delete (the saga owns deferral).

**Files:**
- Modify: `src/hooks/useUrlSync.ts` (delete the galaxy/structure drain effects; URL-write from `focusIdOf`; hash-read → `requestFocus`)
- Modify: `src/components/CommandPalette/CommandPalette.tsx` (handlers already rewired in App; if the palette itself dispatched, repoint — but App owns the handlers, so the palette likely just calls props)
- Test: `tests/hooks/useUrlSync.test.ts` (grep — repoint)

**Interfaces:**
- Consumes: `requestFocus`, `selectFocusRef`, `focusIdOf`, `useAppDispatch`, `useAppSelector`, `useAppStore` (to get `resolveDeps` for `focusIdOf`? — see note), the engine's `resolveDeps`.
- Produces: a store-driven URL sync.

- [ ] **Step 1: Read `useUrlSync.ts` in full + its `@types`**

Run: `cat src/hooks/useUrlSync.ts` and note: the three effects (galaxy drain, structure drain, URL write), `computeDesiredHash`, `URL_HASH_FOR`, and what props it takes (`focused`, `engineHandleRef`, `selected`, ...). The URL WRITE needs a focusId from the current focus; today it used `URL_HASH_FOR[focused.type](focused)` on a `FocusableTarget`. Now it should encode the focus REF via `focusIdOf(ref, deps)`. But `focusIdOf` for a galaxy needs the cloud (to read objID). Two options: (a) keep encoding from the resolved `FocusableTarget` (a `GalaxyInfo` carries `objID` + `famous`) with a small `focusIdOfFocusable(target)` that needs no deps; (b) thread `resolveDeps` in. Option (a) is simpler and keeps the URL write a pure function of the displayed target — prefer it, and note that `focusIdOf(ref, deps)` (Part 1) is used only by the tier re-anchor (Task 7) where the cloud is in hand.

- [ ] **Step 2: Rework the URL write to encode the focusable**

Keep `computeDesiredHash` but feed it the `focused` `FocusableTarget` from `useAppSelector(selectFocusedFocusable)` and encode via the existing `URL_HASH_FOR` table (which already maps a `FocusableTarget` → id). If `URL_HASH_FOR` lived in `useUrlSync`, keep it. The URL write effect becomes:

```ts
const focused = useAppSelector(selectFocusedFocusable);
useEffect(() => {
  if (typeof window === 'undefined') return;
  const { desiredHashBody, matches } = computeDesiredHash({ focused, currentHash: window.location.hash });
  if (matches) return;
  const base = window.location.pathname + window.location.search;
  const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
  window.history.pushState(null, '', next);
}, [focused]);
```

The `pendingTarget`/`pendingStructureId` gating is GONE (the saga owns deferral), so the write no longer waits on a pending drain.

- [ ] **Step 3: Rework the hash-read to dispatch `requestFocus`**

The deep-link read effect (on mount + hashchange) parses `#focus=<id>` and dispatches `requestFocus(id)` — one line, no drain, no resolution. The `watchRequestFocus` saga (Task 3) resolves + defers.

```ts
const dispatch = useAppDispatch();
useEffect(() => {
  const apply = () => {
    const body = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const m = /^focus=(.+)$/.exec(body);
    if (m) dispatch(requestFocus(m[1]!));
  };
  apply();
  window.addEventListener('hashchange', apply);
  return () => window.removeEventListener('hashchange', apply);
}, [dispatch]);
```

(Match the exact existing hash-parsing regex/format from `focusUrl.ts`/`useUrlSync.ts`.)

- [ ] **Step 4: Delete the galaxy-drain + structure-drain effects**

Remove the two `useEffect`s that called `handle.selection.selectByAlias` / `handle.camera.focusOn` and the `pendingTarget`/`pendingStructureId`/`resolveFocusTarget` plumbing. Remove now-dead props from `useUrlSync`'s input type (`engineHandleRef`, `selected`, `sourceCounts`, `famousMeta`, `aliasMap` — keep only what the URL write + hash read need). Update `App.tsx`'s `useUrlSync({...})` call to the slimmed input.

- [ ] **Step 5: Run + typecheck + commit**

Run: `npm test` then `npm run typecheck`.
Expected: PASS. Repoint `useUrlSync.test.ts` to assert `requestFocus` is dispatched on a deep link and the hash is written on a focus change. Ask the user to verify deep-linking (`#focus=m31`) still flies to M31.

```bash
git add src/hooks/useUrlSync.ts src/@types/... src/components/App/App.tsx tests/hooks/useUrlSync.test.ts
git commit -m "refactor(url): deep-link dispatches requestFocus; URL write reads the focus selector

The drain effects + pending state delete — watchRequestFocus owns deferral.
The hash write encodes the focused FocusableTarget; deep-link reads dispatch
requestFocus(id) and let the saga resolve+defer.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Tier re-anchor folded into `tierSaga`

Capture durable focus-ids BEFORE the tier write + eviction; after the bounded `catalogLoaded`, re-resolve and write the ref (hit → re-anchor, miss → clear). Galaxy `index` is positional so it drifts; structures/milkyWay are durable and untouched.

**Files:**
- Modify: `src/state/tier/tierSaga.ts`
- Create: `src/state/selection/selectionWriteBySlot.ts` (`SELECTION_WRITE_BY_SLOT`)
- Create: `src/state/selection/captureGalaxyFocusIds.ts` (pre-write capture)
- Test: `tests/state/tier/tierSaga.test.ts` (extend) + unit tests for the two helpers

**Interfaces:**
- Consumes: `requestTier`, `setTier`, `selectTier`, `selectHoverRef`/`selectSelectedRef`/`selectFocusRef`, `updateSelectionHover/Select/Focus`, `focusIdOf`, `resolveFocusId`, `catalogLoaded`, `SagaContext['resolveDeps']`, `RunTierTransition`, `SelectionSlot`, `SelectionRef`.
- Produces: `SELECTION_WRITE_BY_SLOT`, `captureGalaxyFocusIds`, the extended `watchTier`.

- [ ] **Step 1: `SELECTION_WRITE_BY_SLOT` table**

```ts
/**
 * SELECTION_WRITE_BY_SLOT — the action creator that writes a ref to a named
 * slot, so the tier re-anchor can dispatch parametrically by slot
 * (`SELECTION_WRITE_BY_SLOT[slot](ref)`). Keyed by SelectionSlot, declared once
 * so adding a slot widens this table in lockstep with SelectionState.
 */
import { updateSelectionHover, updateSelectionSelect, updateSelectionFocus } from './selectionSlice';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { PayloadAction } from '@reduxjs/toolkit';

export const SELECTION_WRITE_BY_SLOT: Record<
  SelectionSlot,
  (ref: SelectionRef | null) => PayloadAction<SelectionRef | null>
> = {
  hover: updateSelectionHover,
  select: updateSelectionSelect,
  focus: updateSelectionFocus,
};
```

- [ ] **Step 2: `captureGalaxyFocusIds` (pre-write durable capture)**

Capture, for `select` + `focus` (and optionally `hover`), the durable focus-id of any GALAXY ref (structures/milkyWay are already durable — skip; their refs survive the swap unchanged). Returns a list of `{ slot, focusId }` to re-resolve after the swap.

```ts
/**
 * captureGalaxyFocusIds — read the durable focus id of each galaxy-arm selection
 * ref BEFORE a tier swap evicts the old clouds. A galaxy ref is positional
 * (source+index), so after eviction the same index points at a different galaxy
 * (or none); encoding to the durable id here (while the OLD cloud is still
 * present) lets the saga re-resolve to the NEW index once the new tier loads.
 * Structure / milkyWay refs are already durable, so they are NOT captured —
 * they survive the swap untouched.
 */
import { focusIdOf } from '../../services/url/focusIdOf';
import { selectHoverRef, selectSelectedRef, selectFocusRef } from './selectors';
import type { RootState } from '../../store/types';
import type { ResolveDeps } from '../../@types/engine/ResolveDeps';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';

export function captureGalaxyFocusIds(
  state: RootState,
  deps: ResolveDeps,
): Array<{ slot: SelectionSlot; focusId: string }> {
  const slots: Array<{ slot: SelectionSlot; ref: ReturnType<typeof selectFocusRef> }> = [
    { slot: 'hover', ref: selectHoverRef(state) },
    { slot: 'select', ref: selectSelectedRef(state) },
    { slot: 'focus', ref: selectFocusRef(state) },
  ];
  const out: Array<{ slot: SelectionSlot; focusId: string }> = [];
  for (const { slot, ref } of slots) {
    if (ref && ref.type === 'galaxyCatalog') out.push({ slot, focusId: focusIdOf(ref, deps) });
  }
  return out;
}
```

Unit-test both helpers (table maps each slot to the right action; capture returns galaxy slots only, with the right focusId).

- [ ] **Step 3: Extend `tierSaga.ts`**

```ts
import { takeLatest, select, put, take, getContext } from 'typed-redux-saga';

import { requestTier } from './requestTier';
import { setTier } from './tierSlice';
import { selectTier } from './selectors';
import { captureGalaxyFocusIds } from '../selection/captureGalaxyFocusIds';
import { SELECTION_WRITE_BY_SLOT } from '../selection/selectionWriteBySlot';
import { updateSelectionHover } from '../selection/selectionSlice';
import { resolveFocusId } from '../../services/url/resolveFocusId';
import { catalogLoaded } from '../dataStatus/dataStatusSlice';
import type { RootState, RunTierTransition, SagaContext } from '../../store/types';

export function* watchTier() {
  yield* takeLatest(requestTier, function* (action) {
    const prev = yield* select(selectTier);
    if (prev === action.payload) return;

    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    // Capture durable galaxy focus ids BEFORE the write — the old clouds are
    // still present, so focusIdOf can read the objID. Structure / milkyWay refs
    // are durable and survive untouched.
    const reanchor = captureGalaxyFocusIds(yield* select((s: RootState) => s), resolveDeps());

    // Clear hover across the swap: a stale hover ref over an evicted cloud would
    // resolve to a different galaxy. (Select / focus are re-anchored below.)
    yield* put(updateSelectionHover(null));

    const run = yield* getContext<RunTierTransition>('runTierTransition');
    yield* put(setTier(action.payload));
    run?.(prev, action.payload); // eviction + reload starts (fire-and-forget)

    // Re-anchor each captured galaxy slot once its source's new cloud lands.
    for (const { slot, focusId } of reanchor) {
      // Bounded: this tier's load WILL complete (or error and stop emitting),
      // so the take resolves. takeLatest aborts this loop if a newer requestTier
      // arrives mid-reanchor.
      yield* take(catalogLoaded);
      const ref = resolveFocusId(focusId, resolveDeps());
      yield* put(SELECTION_WRITE_BY_SLOT[slot](ref ?? null)); // hit → re-anchor, miss → clear
    }
  });
}
```

Note: `yield* select((s: RootState) => s)` hands the whole state to `captureGalaxyFocusIds`; if the lint prefers, pass the individual refs. The single `take(catalogLoaded)` per captured slot is a simplification of "take for THAT source" — if a slot's source differs, loop until the matching source loads. Read the spec §8 again: it says `take(catalogLoaded for that source)`. Refine: filter the take by `action.payload.source === ref.source`. Since the captured item only has a `focusId`, also capture the `source` in `captureGalaxyFocusIds` (add `source` to its return) and match it:

```ts
yield* take((a) => catalogLoaded.match(a) && a.payload.source === captured.source);
```

Adjust `captureGalaxyFocusIds` to also return `source` per item. Update its unit test.

- [ ] **Step 4: Write the failing tier re-anchor test**

Extend `tierSaga.test.ts`: seed a galaxy `select` ref, dispatch `requestTier`, simulate the new cloud's `catalogLoaded`, assert the `select` ref re-resolved (or cleared on a miss). Use a `resolveDeps` whose cloud changes the index for the same objID across the "swap" so re-anchor visibly moves the index.

```ts
it('re-anchors a galaxy select ref across a tier swap by durable id', async () => {
  // before swap: SDSS cloud has objID 42n at index 0 → focusId 'sdss-42'
  // after swap: SDSS cloud has objID 42n at index 3
  // dispatch requestTier('large'); on catalogLoaded(SDSS) the select ref index → 3
});
```

(Build the mutable `resolveDeps` like the reconciler test.)

- [ ] **Step 5: Run to pass, full suite, typecheck, commit**

Run: `npm test -- tests/state/tier` → PASS. Then `npm test`, `npm run typecheck`.

```bash
git add src/state/tier/tierSaga.ts src/state/selection/selectionWriteBySlot.ts src/state/selection/captureGalaxyFocusIds.ts tests/state/tier/tierSaga.test.ts tests/state/selection/selectionWriteBySlot.test.ts tests/state/selection/captureGalaxyFocusIds.test.ts
git commit -m "feat(tier): re-anchor galaxy selection across a tier swap (folded into tierSaga)

Capture durable galaxy focus ids before eviction; re-resolve on the new tier's
catalogLoaded and write the ref (hit re-anchors, miss clears). Structure /
milkyWay refs are durable and untouched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Delete the old subsystem + dead helpers + handle methods + types

With reads, writes, effects, and re-anchor all on the store, the closure-mirror subsystem and its helpers are dead. Delete them and reconcile any remaining references.

**Files (Delete):**
- `src/services/engine/subsystems/selectionSubsystem.ts` + its `@types` (`SelectionSubsystem.d.ts`, `CreateSelectionSubsystemInput.d.ts`)
- `src/services/engine/helpers/targetEq.ts`, `targetIdentityKey.ts` + `@types` (`FocusableTargetType`? — keep if `FocusableTarget` union still uses it; grep)
- `src/services/engine/helpers/commitFocus.ts`, `commitFocusTable.ts`, `commitGalaxyFocus.ts`, `commitStructureFocus.ts`, `commitMilkyWayFocus.ts`, `clearAll.ts`
- `src/@types/camera/FocusTarget.d.ts`
- Their tests.

**Files (Modify):**
- `src/services/engine/...` wherever `state.subsystems.selection` was constructed/destroyed (remove from the subsystem bag + EngineState type)
- `src/@types/engine/handles/EngineSelectionHandle.d.ts` (drop `selectFamous`/`selectByAlias`; keep `clear`? — `clear` is now `dispatch(clearSelection())` from App, so the handle method may go too — check remaining callers)
- `src/@types/engine/handles/EngineCameraHandle.d.ts` (drop `focusOn`; confirm `focusOnHome` stays — it's a different method)
- `src/services/engine/engine.ts` (delete the `selectFamous`/`selectByAlias`/`focusOn` implementations + handle wiring)
- `src/services/url/focusUrl.ts` (delete `selectionToFocusId`/`parseFocusHash`/`resolveFocusTarget` if now unused)

- [ ] **Step 1: Find every remaining reference**

Run: `grep -rn "subsystems.selection\|selectionSubsystem\|targetEq\|targetIdentityKey\|commitFocus\|commitGalaxyFocus\|commitStructureFocus\|commitMilkyWayFocus\|clearAll\|FocusTarget\|selectFamous\|selectByAlias\|\.focusOn\b\|selectionToFocusId\|parseFocusHash\|resolveFocusTarget" src/`
Make a checklist of every hit. Each must be either deleted or repointed to the store path.

- [ ] **Step 2: Repoint `App.tsx`'s `clear`/`focusOn` callers**

App's `onClose={() => handleRef.current?.selection.clear()}` and `onFocus={... camera.focusOn ...}` and CommandPalette `camera.focusOn(MILKY_WAY_INFO)` were already rewired in Task 5 to dispatch. Confirm no other caller of `handle.selection.clear` / `handle.camera.focusOn` / `selectFamous` / `selectByAlias` remains (e.g. `useKeyboardShortcuts` — grep). Repoint each to a dispatch (`clearSelection`, `updateSelectionFocus`, `requestFocus`).

- [ ] **Step 3: Delete the subsystem from the engine bag**

Remove `state.subsystems.selection` from `EngineState`'s subsystem bag type and its construction/destruction in the bootstrap. The hover/select/focus state no longer lives in the engine — it's in the store. Remove `createSelectionSubsystem` import + call. Remove the `requestRender`/`cb` wiring it took.

- [ ] **Step 4: Delete the files**

```bash
git rm src/services/engine/subsystems/selectionSubsystem.ts \
  src/@types/engine/subsystems/SelectionSubsystem.d.ts \
  src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts \
  src/services/engine/helpers/targetEq.ts \
  src/services/engine/helpers/targetIdentityKey.ts \
  src/services/engine/helpers/commitFocus.ts \
  src/services/engine/helpers/commitFocusTable.ts \
  src/services/engine/helpers/commitGalaxyFocus.ts \
  src/services/engine/helpers/commitStructureFocus.ts \
  src/services/engine/helpers/commitMilkyWayFocus.ts \
  src/services/engine/helpers/clearAll.ts \
  src/@types/camera/FocusTarget.d.ts
git rm tests/services/engine/helpers/targetEq.test.ts tests/services/engine/helpers/commitGalaxyFocus.test.ts # ... and every other dead test (grep first)
```

(Run the grep in Step 1 to enumerate the exact test files; only `git rm` ones that exclusively tested deleted code.)

- [ ] **Step 5: Drop the handle methods + the `FocusTarget`/`focusUrl` dead exports**

In `EngineSelectionHandle.d.ts` drop `selectFamous`/`selectByAlias` (and `clear` if no caller remains — re-grep). In `EngineCameraHandle.d.ts` drop `focusOn` (keep `focusOnHome`). In `engine.ts` delete the three function bodies + their handle wiring. In `focusUrl.ts` delete `selectionToFocusId`/`parseFocusHash`/`resolveFocusTarget` if Step 1 shows no remaining importer; keep `URL_HASH_FOR`/`computeDesiredHash` if `useUrlSync` still uses them.

- [ ] **Step 6: Full suite + typecheck — fix every break**

Run: `npm run typecheck` then `npm test`.
Expected: typecheck surfaces every dangling reference; fix each by repointing to the store path or deleting. Then PASS (the suite should be back to ~2687 + the net-new selection tests, minus the deleted subsystem tests).

- [ ] **Step 7: Commit**

The `git rm` calls in Step 4 already STAGED every deletion. Step 7 only needs to
stage the MODIFIED files — by explicit path, never `git add -u`/`-A`/`.` (the
project rule: stage specific paths only). Enumerate the files Steps 2/3/5/6
touched (the grep checklist from Step 1 is the source of truth — add every
modified path it surfaced, e.g. `useKeyboardShortcuts.ts` if it was repointed):

```bash
git add src/@types/engine/handles/EngineSelectionHandle.d.ts \
  src/@types/engine/handles/EngineCameraHandle.d.ts \
  src/services/engine/engine.ts \
  src/services/url/focusUrl.ts \
  src/components/App/App.tsx
# ...plus every other file the Step-1 grep checklist flagged as modified
# (each staged by its explicit path — NEVER `git add -u` / `git add -A`).
git commit -m "refactor(engine): delete selectionSubsystem + commit helpers + targetEq/FocusTarget

Selection identity + display now live entirely in the store; the closure-mirror
subsystem, the commit* helpers, targetEq/targetIdentityKey, FocusTarget, and the
selectFamous/selectByAlias/focusOn handle methods are gone.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Note: deletions are already staged by `git rm` (Step 4); this `git add` stages
> only the modified files, each by explicit path. Do NOT reach for `git add -u`
> as a shortcut — staging specific paths is a hard project rule, and `git status`
> before the commit must show exactly the intended deletions + modifications.

---

## Part 2 self-review gate

After Task 8:
- `npm test` green, `npm run typecheck` clean.
- `grep -rn "subsystems.selection\|FocusTarget\|selectFamous\|selectByAlias\|commitFocus\|targetEq" src/` returns NOTHING (all dissolved).
- Manual app verification (ask the user): hover preview, single-click select + ring, double-click focus + tween, Esc/× clear, command-palette pick, deep-link `#focus=m31`, and a tier swap that keeps the selected galaxy anchored — all behave as before.
- The blast-radius "Unchanged" list holds: InfoCard + `DETAIL_CARD` + detail cards consume `selected`/`hovered`/`focused` exactly as before; `tweenToGalaxy`/`tweenToStructure` are untouched; every settings selector/consumer is untouched.
- Out-of-scope confirmed untouched: `syncVisibilityFades` stays an explicit bridge; settings/tour folds not started; no camera/tween behaviour change.
