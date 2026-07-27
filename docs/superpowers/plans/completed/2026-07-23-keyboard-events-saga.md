# Keyboard-events saga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the global keyboard shortcuts (and the tour keys) from useKeyboardShortcuts + watchTourKeyboardSaga to one declarative KEYBOARD_SHORTCUTS map + a shared always-on watchKeyboardEventsSaga.

**Architecture:** A single `KeyboardShortcut[]` data table maps a hotkeys-js key list to `run(state) → Action | Action[] | null` plus an optional per-key `preventDefault` (bool or state predicate). One always-on `watchKeyboardEventsSaga` drains a shared `createKeyboardListener` channel and dispatches; the tour's three keys fold in as `selectTourActive`-gated entries, collapsing the old bracketed bind/teardown into a filter. The one engine-imperative key (`l`) becomes a reducer-less `logCameraState` command action routed through the existing `ReconcileEffects` saga-context bag, so the map stays uniform (every entry only dispatches).

**Tech Stack:** TypeScript, redux-saga (typed-redux-saga), hotkeys-js, RTK.

## Global Constraints
- One symbol per file in `src/utils/` and one type per file in `src/@types/` (filename = export name).
- `type` aliases, never `interface`. RTK reducer arg names `settings`/`action`. House saga-loop convention `while (true)`.
- Tests follow `docs/superpowers/conventions/testing.md` — test what can break; NO DOM/hotkeys-js integration test (that's the library's contract).
- Every commit must compile (`npm run typecheck`) and keep the suite green.

---

## Task 1 — Prep: reshape `createKeyboardListener` + `getState`-in-context + migrate the tour saga

_Spec §3.4, §6 Prep, §3.1._ Behaviour-preserving refactor — no new failing test, just keep everything green while the joint changes shape underneath its only caller.

**Files:**
- `src/@types/state/input/KeyboardShortcut.d.ts` (new)
- `src/services/input/createKeyboardListener.ts` (modify)
- `src/store/createAppStore.ts` (modify)
- `src/store/types.ts` (modify)
- `src/state/tour/watchTourKeyboardSaga.ts` (modify)

**`KeyboardShortcut` type** (spec §3.1 — transcribe verbatim, this IS the contract):

```ts
export type KeyboardShortcut = {
  readonly keys: string;
  readonly run: (state: RootState) => Action | readonly Action[] | null;
  readonly preventDefault?: boolean | ((state: RootState) => boolean);
};
```

**`createKeyboardListener` new signature** (was `(keys: string): EventChannel<string>`, see `createKeyboardListener.ts:29-39`):

```ts
export function createKeyboardListener(
  shortcuts: readonly KeyboardShortcut[],
  getState: () => RootState,
): EventChannel<string>
```

- Registers each entry's `keys` with hotkeys-js (one `hotkeys(...)` bind per entry, or the existing single-bind-with-lookup shape — implementer's call, same external behaviour).
- In each hotkeys callback, resolves that entry's `preventDefault` (`true`/`false`, or `predicate(getState())`) and calls `event.preventDefault()` only when true; then `emit(handler.key)` as today.
- `hotkeys.filter` keeps the built-in input/textarea/select guard and additionally returns `false` for `contentEditable` targets (today done by hand in `useKeyboardShortcuts.ts:56-67`, hotkeys-js's default filter does not cover it).
- Teardown (`hotkeys.unbind`) unbinds the same key set on channel close — same shape as today.

**`getState` in saga context:**
- `src/store/createAppStore.ts:59-65` — after `sagaMiddleware.run(mainSaga)`, seed `sagaMiddleware.setContext({ getState: store.getState })`.
- `src/store/types.ts` — add `getState: () => RootState;` to the `SagaContext` type (alongside `runTierTransition`, `reconcile`, etc. — see `types.ts:94-119`).

**Migrate `watchTourKeyboardSaga.ts`:** replace the bare `Object.keys(TOUR_KEYS).join(',')` call at `watchTourKeyboardSaga.ts:52` with a minimal 3-entry `KeyboardShortcut[]` (`right`/`left`/`space`, each `run` returning its existing action creator's action, `preventDefault: true` static on all three — matches today's unconditional preventDefault) and pass `yield* getContext<() => RootState>('getState')` through to `createKeyboardListener`. `TOUR_KEYS` and the manual dispatch table can stay or fold into the new shortcut list's `run` fields — keep the diff minimal since this saga is deleted in Task 6.

- [x] Add `src/@types/state/input/KeyboardShortcut.d.ts`.
- [x] Reshape `createKeyboardListener.ts` to the new signature + conditional preventDefault + contentEditable filter.
- [x] Seed `getState` into saga context in `createAppStore.ts`; add it to `SagaContext` in `store/types.ts`.
- [x] Migrate `watchTourKeyboardSaga.ts` onto the new `createKeyboardListener` call, passing a 3-entry `KeyboardShortcut[]` and the context `getState`.
- [x] Run the existing tour-keyboard test (find it beside `watchTourKeyboardSaga.ts`) + `npm run typecheck` — both green, behaviour identical.
- [x] Commit.

---

## Task 2 — `stepRate` util

_Spec §3.2._

**Files:** `src/utils/time/stepRate.ts` (new), `tests/utils/time/stepRate.test.ts` (new).

**Signature:** `stepRate(state: RootState, delta: number): number`
**Behaviour:** clamps `selectTimeState(state).rateIndex + delta` to `[0, RATE_LADDER.length - 1]` (mirrors the inline clamp today in `useKeyboardShortcuts.ts:155-161`; `RATE_LADDER` from `src/data/time/rateLadder.ts`, `selectTimeState` from `src/state/time/selectors.ts:36`).

- [x] Write failing test `clamps at the slow end` — `rateIndex: 0`, `delta: -1` → `0`.
- [x] Write failing test `clamps at the fast end` — `rateIndex: RATE_LADDER.length - 1`, `delta: +1` → `RATE_LADDER.length - 1`.
- [x] Write failing test `steps one detent` — mid index, `delta: +1` → index + 1.
- [x] Implement `stepRate`, all three green.
- [x] `npm run typecheck`.
- [x] Commit.

---

## Task 3 — `logCameraState` command action + `ReconcileEffects` wire

_Spec §3.5._

**Files:**
- `src/state/camera/logCameraState.ts` (new)
- `src/store/effects/ReconcileEffects.ts` (modify)
- `src/services/engine/wiring/makeReconcileEffects.ts` (modify)

**Action** (mirror `src/state/selection/goHome.ts` exactly — reducer-less command):

```ts
export const logCameraState = createAction('camera/logCameraState');
```

**`ReconcileEffects`** (`ReconcileEffects.ts:30-35`) — add a fifth closure field:

```ts
logCameraState: () => void;
```

**`makeReconcileEffects.ts:33-40`** — add the closure to the returned object, reusing the existing engine helper that already does this work for `handle.camera.logState` (see `engine.ts:718-720`, `logCameraStateFn`):

```ts
logCameraState: () => logCameraState(state.cam),
```

(Import `logCameraState` from `../helpers/logCameraState` — note this is the existing *helper function* that logs to console, distinct from the new *action* of the same name in `src/state/camera/logCameraState.ts`; they live in different modules and are never imported into the same file, so there is no collision, but call this out if the implementer wires them side by side.)

No new registration call is needed at the `cb.setSagaContext({ reconcile: makeReconcileEffects(state), ... })` site (`engine.ts:668-689`) — `reconcile` already carries the whole bag through unchanged.

- [x] Add `src/state/camera/logCameraState.ts`.
- [x] Add the `logCameraState` field to the `ReconcileEffects` type.
- [x] Implement the closure in `makeReconcileEffects.ts`, importing the existing helper.
- [x] `npm run typecheck` green. No new test — this is a straight wiring addition that fails loudly (compile error) if wrong, and gets exercised for real by Task 5's `logCameraState arm` test; adding one here would just restate the assignment (testing.md).
- [x] Commit.

---

## Task 4 — `KEYBOARD_SHORTCUTS` map + `SHORTCUTS_BY_KEY` + `run(state)` tests

_Spec §3.2, §7._ Depends on Task 2 (`stepRate`) + Task 3 (`logCameraState`).

**Files:** `src/state/input/keyboardShortcuts.ts` (new), `tests/state/input/keyboardShortcuts.test.ts` (new).

**The map** (spec §3.2 — the entry list is the contract; transcribe verbatim, source the action/selector imports from where Task 1 verification confirmed they already live: `setPaletteOpen`/`selectPaletteOpen` in `src/state/ui/`, `clearSelection`/`updateSelectionFocus` in `src/state/selection/selectionSlice`, `exitTour`/`advanceTour`/`prevBeat`/`togglePause` in `src/state/tour/tourActions`, `goHome` in `src/state/selection/goHome`, `toggleUiHidden`/`toggleDebugPanelOpen` in `src/state/ui/uiSlice`, `logCameraState` from Task 3, `setRate`/`pause`/`resume`/`goLive` + `selectTimeState` in `src/state/time/`, `selectSelectedRef` in `src/state/selection/selectors`, `selectTourActive` in `src/state/tour/selectors`, `unixMsToJulianDays` in `src/utils/time/`):

```ts
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { keys: 'command+k,ctrl+k', run: () => setPaletteOpen(true), preventDefault: true },
  { keys: '/', run: s => (selectPaletteOpen(s) ? null : setPaletteOpen(true)),
               preventDefault: s => !selectPaletteOpen(s) },
  { keys: 'escape', run: () => [clearSelection(), exitTour()] },
  { keys: 'f', run: s => { const r = selectSelectedRef(s); return r ? updateSelectionFocus(r) : null; } },
  { keys: 'h,e', run: () => goHome() },
  { keys: 'tab', run: () => toggleUiHidden(), preventDefault: true },
  { keys: 'l', run: () => logCameraState() },
  { keys: 'd', run: () => toggleDebugPanelOpen() },
  { keys: '[', run: s => setRate({ rateIndex: stepRate(s, -1), nowMs: performance.now() }) },
  { keys: ']', run: s => setRate({ rateIndex: stepRate(s, +1), nowMs: performance.now() }) },
  { keys: '\\', run: s => (selectTimeState(s).paused
                             ? resume({ nowMs: performance.now() })
                             : pause({ nowMs: performance.now() })) },
  { keys: 'shift+n', run: () => goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs: performance.now() }) },
  { keys: 'right', run: s => (selectTourActive(s) ? advanceTour() : null), preventDefault: selectTourActive },
  { keys: 'left',  run: s => (selectTourActive(s) ? prevBeat()    : null), preventDefault: selectTourActive },
  { keys: 'space', run: s => (selectTourActive(s) ? togglePause() : null), preventDefault: selectTourActive },
];
```

**`SHORTCUTS_BY_KEY`** — derived at module load from `KEYBOARD_SHORTCUTS`, expanding each entry's comma-separated `keys` (e.g. `'h,e'` → two lookup entries, both pointing at the same `KeyboardShortcut` object) into a `Record<string, KeyboardShortcut>`. Not hand-maintained.

**Tests** (names + assertions, from spec §7 — build a minimal `RootState`-shaped fixture per case, no store needed since `run` is pure):

- [x] `Esc returns clearSelection and exitTour` — asserts the array `[clearSelection(), exitTour()]`.
- [x] `/ opens palette only when closed` — palette closed → `setPaletteOpen(true)`; palette open → `null`.
- [x] `f focuses selected ref, null when nothing selected` — a selected ref → `updateSelectionFocus(ref)`; no selection → `null`.
- [x] `[ and ] clamp via stepRate` — at the ladder ends, `[`/`]` don't step past 0 / `length - 1` (assert the dispatched `rateIndex`, not `stepRate` itself again — that's Task 2's test).
- [x] `\ returns resume when paused, pause when running`.
- [x] `tour keys return null when no tour is active and their signal when active` — one case per key (`right`/`left`/`space`) × both tour states, or a parametrized test.
- [x] `preventDefault predicate: / true only when palette closed, space true only during a tour`.
- [x] Implement the map + `SHORTCUTS_BY_KEY`, all green.
- [x] `npm run typecheck`.
- [x] Commit.

---

## Task 5 — `watchKeyboardEventsSaga` (not yet forked)

_Spec §3.3, §3.5._ Do **not** fork this saga from `rootSaga` yet — that happens atomically in Task 6, to avoid a window where both the old tour saga and this one are live and could double-dispatch.

**Files:** `src/state/input/watchKeyboardEventsSaga.ts` (new), `tests/state/input/watchKeyboardEventsSaga.test.ts` (new).

**The saga** (spec §3.3 — the drain loop is the contract):

```ts
export function* watchKeyboardEventsSaga() {
  const getState = yield* getContext<() => RootState>('getState');
  const channel = yield* call(createKeyboardListener, KEYBOARD_SHORTCUTS, getState);
  try {
    while (true) {
      const key = yield* take(channel);
      const shortcut = SHORTCUTS_BY_KEY[key];
      if (!shortcut) continue;
      const out = shortcut.run(getState());
      for (const a of asArray(out)) yield* put(a);
    }
  } finally {
    channel.close();
  }
}
```

Plus a `takeEvery(logCameraState)` arm, colocated in the same file, that pulls `reconcile` off context and calls `reconcile.logCameraState()`.

`asArray` — check `src/utils/` for an existing null/array-normalizing helper before writing a new one (per the search-before-writing-helpers convention); if none exists, add a one-function file (`src/utils/array/asArray.ts` or similar) with its own tiny test (`null → []`, `single action → [action]`, `array → itself`).

**Tests** (names — mock the `EventChannel` and use the typed-redux-saga test harness; cite the deleted-in-Task-6 tour saga's test file for the harness shape before it's removed):

- [x] `a taken key puts its built action(s)`.
- [x] `a null run result puts nothing`.
- [x] `an unknown key is skipped`.
- [x] `logCameraState arm calls the context effect once`.
- [x] Implement `watchKeyboardEventsSaga` + the `logCameraState` arm, all green.
- [x] `npm run typecheck`.
- [x] Commit.

---

## Task 6 — Atomic cutover + deletions

_Spec §5._

**Files:**
- rootSaga (grep for the file forking `watchTourKeyboardSaga`, modify)
- `src/hooks/useKeyboardShortcuts.ts` (delete)
- `src/@types/engine/UseKeyboardShortcutsInput.d.ts` (delete)
- `src/state/tour/watchTourKeyboardSaga.ts` + its test file (delete)
- `src/components/App/App.tsx` (modify)

**rootSaga:** in one edit, remove the `watchTourKeyboardSaga` fork and add the `watchKeyboardEventsSaga` fork — no committed state has both forks.

**Deletions:** `useKeyboardShortcuts.ts`, `UseKeyboardShortcutsInput.d.ts`, `watchTourKeyboardSaga.ts` and its test (coverage moved to Task 5).

**`App.tsx`:** remove the `useKeyboardShortcuts` import (`App.tsx:48`) and its call (`App.tsx:117-124`); remove the now-dead `dispatchSetPaletteOpen` / `dispatchToggleUiHidden` / `dispatchToggleDebugPanelOpen` `useCallback` wrappers (`App.tsx:103-111`) and the `useCallback` import if nothing else in the file needs it; remove the `setPaletteOpen, toggleUiHidden, toggleDebugPanelOpen` action-creator import (`App.tsx:62`) since App no longer dispatches them directly. Keep the `paletteOpen` / `uiHidden` / `debugPanelOpen` selector reads (`App.tsx:84-86`) and the `selected` read (`App.tsx:75`) — the render tree and `uiStack` className still need them. `handleRef` stays (still passed to `InfoCardContainer`/`CommandPaletteContainer`/the debug panel).

- [x] Edit rootSaga: swap the fork.
- [x] Delete the hook, its input type, the tour keyboard saga + test.
- [x] Edit `App.tsx`: remove the hook wiring and its dead `useCallback`s per above, keep the selectors that still feed JSX.
- [x] `npm test` (full suite) + `npm run typecheck` green.
- [x] Commit.

---

## Task 7 — Verification

_Spec §7, §8._ No commit unless a fix is needed.

- [x] Ask the user to manually sweep, against the running dev server: Cmd+K / `/` open the palette; Esc clears selection + exits a tour; `f` focuses the pinned target; `h`/`e` fly home; Tab hides UI; `l` logs camera state to console; `d` toggles the debug panel; `[`/`]`/`\`/Shift+N drive the clock; in a running tour, `→`/`←`/`Space` navigate and Space is NOT hijacked outside a tour (still scrolls/activates buttons).
- [x] Note: the `/feature-done` audit runs before merge, not as a step here.

---

## Self-Review

- **Spec coverage:** every §3 subsection has a task — §3.1 (type) → Task 1 & 4; §3.2 (map + `stepRate`) → Tasks 2 & 4; §3.3 (saga) → Task 5; §3.4 (`createKeyboardListener` + context `getState`) → Task 1; §3.5 (`logCameraState` action + effect + saga arm) → Tasks 3 & 5. Every §5 deletion/rewiring item (hook, input type, tour saga, `App.tsx`, `rootSaga` swap) → Task 6. Every §7 test category (per-entry `run`, `preventDefault` predicates, `stepRate`, saga drain, `logCameraState` arm) has a named test in Tasks 2, 4, or 5; the spec's explicit "no DOM/hotkeys-js integration test" carve-out is repeated in the Global Constraints and in Task 1 (the reshape itself has no new test, only the existing tour test + typecheck as the deliverable). §8's delivery order (prep → feature → audit) matches Tasks 1 → 2–6 → 7.
- **No implementation bodies pasted:** the only code blocks are the `KeyboardShortcut` type (a type signature, category 1), the `createKeyboardListener` new signature (a signature, category 1), the `KEYBOARD_SHORTCUTS` table and `watchKeyboardEventsSaga` drain loop (both pasted verbatim from the spec, where they're pinned as the seam's literal contract — category 4's "tiny sketch" extended to the one place the spec itself declares the data/logic IS the artifact), and the one-line `makeReconcileEffects` addition (a 1-line before/after, category 4). No function body was invented or copied from existing source; every existing-code reference is a `path:line` citation, each verified against the current tree while writing this plan.
