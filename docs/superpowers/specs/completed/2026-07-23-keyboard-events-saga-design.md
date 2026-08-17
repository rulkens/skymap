# Global shortcuts → shared keyboard-events saga — design

> Picks up backlog item **Global shortcuts → keyboard saga** (`needs-design`,
> `docs/backlog/2026-06-29-keyboard-shortcuts-saga.md`), removed in the spec commit.
> Aligns with ADR 0007 (sagas drive intent).

## 1. What we're building

Promote the app's global keyboard shortcuts from the React hook
`src/hooks/useKeyboardShortcuts.ts` (a `window.addEventListener('keydown')` +
if-chain) to a single declarative `KEYBOARD_SHORTCUTS` map plus a shared
`watchKeyboardEventsSaga`, and **fold the tour keys** (`→`/`←`/`Space`, today in
`watchTourKeyboardSaga`) onto the same path. One keyboard mechanism, one data
table, sagas driving intent.

### Goals

- A declarative `KeyboardShortcut[]` table: each entry maps a hotkeys-js key list
  to an action **built from live store state** (`run(state) → Action | Action[] |
  null`), with optional per-key `preventDefault`.
- One always-on `watchKeyboardEventsSaga` that drains a single keyboard channel and
  dispatches. The tour keys become `selectTourActive`-gated entries, so their
  bracketed lifetime collapses into a filter predicate.
- Delete `useKeyboardShortcuts`, its input type, `watchTourKeyboardSaga`, and the
  hook's wiring in `App.tsx`.
- The one engine-imperative key (`l` → `camera.logState`) becomes a reducer-less
  `logCameraState` command action handled via the saga-context effect bag, so the
  map stays uniform (every entry dispatches an action).

### Non-goals (deferred, named)

- No new shortcuts, no rebinding UI, no user-configurable keymap.
- No change to what any key *does* — behaviour is preserved key-for-key (including
  Space staying un-hijacked outside a tour).
- The debug-panel and palette component internals are untouched; they already own
  their own dispatches.

## 2. Decisions summary

- **Q1 — saga architecture:** ONE shared `watchKeyboardEventsSaga` + map; the tour
  keys fold in (chosen over a separate global saga or a shared-utility-only split).
- **Q2 — the `l` key:** a reducer-less `logCameraState` command action + a
  `ReconcileEffects` closure (chosen over a residual hook or dropping the key), so
  the hook is fully deleted and the map stays dispatch-only.
- **Packaging:** one PR, prep commit first.

## 3. Architecture — data delta first

### 3.1 The `KeyboardShortcut` entry type

`src/@types/state/input/KeyboardShortcut.d.ts` (one type per file):

```ts
export type KeyboardShortcut = {
  // hotkeys-js key list, e.g. 'command+k,ctrl+k'. Comma-variants expand to one
  // entry (see SHORTCUTS_BY_KEY in §3.3).
  readonly keys: string;
  // Build the action(s) from live state, or null to no-op (subsumes filter + args
  // + multi-dispatch). Pure — reads state, returns actions, dispatches nothing.
  readonly run: (state: RootState) => Action | readonly Action[] | null;
  // Cancel the browser default for this key. A predicate when the decision is
  // state-dependent (`/` only when the palette is closed; Space only in a tour).
  // Evaluated SYNCHRONOUSLY in the DOM tick (see §4). Default: false.
  readonly preventDefault?: boolean | ((state: RootState) => boolean);
};
```

The single `run(state) → Action | Action[] | null` builder is the seam: it absorbs
the backlog's proposed `filter?` (return `null`), `args?` (build the payload from
state), and multi-key actions (return an array) into one shape, so there is no
separate filter/args vocabulary to keep in sync.

### 3.2 The map

`src/state/input/keyboardShortcuts.ts` — a pure data table:

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
  // Tour keys — always registered, gated on an active tour. Space is only
  // preventDefault'd (and only dispatches) during a tour, so it is never hijacked
  // from button activation / page scroll outside one (the invariant the old
  // bracketed listener protected).
  { keys: 'right', run: s => (selectTourActive(s) ? advanceTour() : null), preventDefault: selectTourActive },
  { keys: 'left',  run: s => (selectTourActive(s) ? prevBeat()    : null), preventDefault: selectTourActive },
  { keys: 'space', run: s => (selectTourActive(s) ? togglePause() : null), preventDefault: selectTourActive },
];
```

`stepRate(state, delta)` clamps `selectTimeState(state).rateIndex + delta` to
`[0, RATE_LADDER.length - 1]` — the one shared bit of logic from the old `[`/`]`
handlers, extracted to a `src/utils/...` one-function file with a focused test.

### 3.3 The shared saga

`src/state/input/watchKeyboardEventsSaga.ts` — always-on; replaces both the hook
and `watchTourKeyboardSaga`:

```ts
export function* watchKeyboardEventsSaga() {
  const getState = yield* getContext<() => RootState>('getState');   // seeded in createAppStore (§3.4)
  const channel = yield* call(createKeyboardListener, KEYBOARD_SHORTCUTS, getState);
  try {
    while (true) {                                   // house saga-loop convention
      const key = yield* take(channel);
      const shortcut = SHORTCUTS_BY_KEY[key];        // expanded-key → entry, built once from the table
      if (!shortcut) continue;
      const out = shortcut.run(getState());
      for (const a of asArray(out)) yield* put(a);   // null → nothing
    }
  } finally {
    channel.close();                                 // saga-cancellation cleanliness (never in normal run)
  }
}
```

`SHORTCUTS_BY_KEY` is derived from `KEYBOARD_SHORTCUTS` at module load (expanding
comma-variants), not a hand-maintained parallel list.

The `logCameraState` command action needs the engine's `logState`; it is handled by
a `takeEvery(logCameraState)` arm colocated in this saga's file that reads the
effect from context and calls it (see §3.5).

### 3.4 `createKeyboardListener` generalization (Prep — lands first)

Today (`src/services/input/createKeyboardListener.ts`) it takes a bare `keys:
string` and `preventDefault`s **every** key unconditionally — correct for the tour
(bracketed, all-or-nothing) but wrong for an always-on global set. New contract:

```ts
export function createKeyboardListener(
  shortcuts: readonly KeyboardShortcut[],
  getState: () => RootState,
): EventChannel<string> { /* … */ }
```

- Registers each entry's `keys` with hotkeys-js.
- In each hotkeys callback (the DOM tick), evaluates the entry's `preventDefault`
  (bool or `predicate(getState())`) and calls `event.preventDefault()` only when
  true, then `emit(handler.key)`.
- Sets `hotkeys.filter` to keep the built-in `input`/`textarea`/`select` guard AND
  additionally skip `contentEditable` targets — the guard the old hook did by hand
  (`useKeyboardShortcuts.ts:60-66`) and which hotkeys-js's default does not cover.

The `preventDefault`-must-be-synchronous constraint (a saga runs a tick too late to
cancel the default) is why the decision lives in the listener, reading `getState()`
inline — the same reason the original comment gives, now generalized from
all-keys to per-key.

**`getState` in saga context.** The predicate `preventDefault` needs the *current*
state in the DOM tick, so the listener takes a plain `getState: () => RootState`.
`createAppStore` seeds it once into the saga context
(`sagaMiddleware.setContext({ getState: store.getState })`, right after the store is
built and before `run(mainSaga)`); the saga reads it via
`getContext('getState')`. This is the canonical redux-saga escape hatch for a
synchronous state read outside an effect. The reshaped signature is why this
wiring lands in Prep (the migrated tour saga passes the same `getState`, though its
entries only use static `preventDefault: true`).

### 3.5 `logCameraState` command action + effect

- `src/state/camera/logCameraState.ts`: `export const logCameraState =
  createAction('camera/logCameraState')` — reducer-less, mirroring `goHome`,
  `advanceTour`.
- `ReconcileEffects` (`src/store/effects/ReconcileEffects.ts`) gains a
  `logCameraState: () => void` closure; the engine registers it via
  `setSagaContext` alongside the existing effect closures, wired from the same site
  that already exposes engine capabilities to store-land. Its body is the existing
  `engineHandle.camera.logState` (`engine.ts:718` `logCameraStateFn`).
- The `takeEvery(logCameraState)` arm in `watchKeyboardEventsSaga.ts` pulls the
  effect from context and calls it. The keyboard map itself only dispatches — it
  never reaches the engine.

## 4. Lifetime, form-guard, preventDefault — summary

- **Always-on:** `watchKeyboardEventsSaga` is forked once from `rootSaga` and lives
  for the app's lifetime. No per-tour binding/teardown; the tour's bracketing is
  now the `selectTourActive` predicate on its three entries.
- **Form fields:** handled once in `createKeyboardListener`'s `hotkeys.filter`
  (input/textarea/select/contentEditable) — no per-entry guard.
- **preventDefault:** per-entry, synchronous, optionally state-conditional (§3.4).

## 5. Deletions / rewiring

- Delete `src/hooks/useKeyboardShortcuts.ts` and
  `src/@types/engine/UseKeyboardShortcutsInput.d.ts`.
- Delete `src/state/tour/watchTourKeyboardSaga.ts` (its three keys fold into the
  map; its `TOUR_KEYS` table and `routeKeys` drain are subsumed).
- `App.tsx`: remove the `useKeyboardShortcuts` import + call and the now-dead
  `dispatchSetPaletteOpen` / `dispatchToggleUiHidden` / `dispatchToggleDebugPanelOpen`
  `useCallback` wrappers and the `engineHandleRef` plumbing that existed only to
  feed the hook. (`paletteOpen` / `uiHidden` / `debugPanelOpen` selectors stay —
  the render tree still reads them.)
- `rootSaga`: swap the `watchTourKeyboardSaga` fork for `watchKeyboardEventsSaga`.

## 6. Ground preparation

Run against the ideal-diff. The feature is **growth by construction** — its whole
point is introducing the new `KEYBOARD_SHORTCUTS` seam and moving keys onto it — so
most touchpoints are additions at existing seams. One genuine missing joint.

### Prep (its own commit, sequenced first; rides this PR)

**Generalize `createKeyboardListener` to the map-driven, conditional-preventDefault
contract (§3.4), seed `getState` into the saga context (§3.4), and migrate its only
current caller, `watchTourKeyboardSaga`, onto the new signature with behaviour
unchanged** (still bracketed, still `preventDefault: true` for its three keys,
expressed as a minimal `KeyboardShortcut[]`, passing the context `getState`).
Compiles + green on its own; proves the new joint against the existing consumer
before the feature builds on it. The tour saga is then deleted by the feature
commits — unavoidable double-touch, since prep changes the signature its sole caller
uses and every commit must stay green.

### Growth / bolt-on verdicts

- `KeyboardShortcut` type + `KEYBOARD_SHORTCUTS` table — **the new seam** (growth).
- `logCameraState` action — **growth** (new reducer-less command action, an
  established pattern: `goHome`, `advanceTour`).
- `ReconcileEffects` += `logCameraState` closure — **growth** at the existing
  engine→saga capability bag (already holds `cameraRuntime`, `playClip`, render-wake,
  fades, reseed, bias).
- `rootSaga` fork swap — **growth** (fork list).
- `SagaContext` gains `getState` (seeded in `createAppStore`) — **growth** at the
  context bag; the canonical redux-saga synchronous-state escape hatch.
- `createKeyboardListener` — **bolt-on if left as-is**: its unconditional
  `preventDefault` (`createKeyboardListener.ts:31-33`) and bare `keys: string`
  signature would force either a second listener variant or blanket-preventDefault
  (breaking `f`/`d`/letters and hijacking Space outside a tour). The Prep reshape
  creates the missing joint (per-key, state-conditional preventDefault).

### Adjacent findings deliberately NOT in scope

None load-bearing. The `App.tsx` `useCallback` wrappers are dead code the feature
deletes, not a separate cleanup.

## 7. Testing (what can break)

Per `docs/superpowers/conventions/testing.md` — test the logic that fails on a real
bug, skip restatements.

- **`run(state)` per entry (the load-bearing routing):** `Esc` returns
  `[clearSelection, exitTour]`; `/` returns `setPaletteOpen(true)` only when the
  palette is closed and `null` when open; `f` returns `updateSelectionFocus(ref)`
  when a target is selected and `null` when nothing is; `[`/`]` clamp at the ladder
  ends via `stepRate`; `\` returns `resume` when paused and `pause` when running;
  tour keys return `null` when no tour is active and their signal when one is.
- **`preventDefault` predicate resolution:** `/` true only when palette closed;
  `space` true only during a tour (a static-`true` entry needs no test).
- **`stepRate` clamp** — its own focused test.
- **Saga drain:** one test that a taken key runs its entry and `put`s the built
  action(s); a `null` result puts nothing; an unknown key is skipped.
- **`logCameraState` arm:** dispatching it calls the context effect once.
- **No DOM/hotkeys-js integration test** — key parsing, the platform fold, and the
  form-field filter are hotkeys-js's contract, not ours.

## 8. Delivery

One PR, prep commit first:

1. **Prep:** generalize `createKeyboardListener`, seed `getState` into the saga
   context (`createAppStore`), + migrate `watchTourKeyboardSaga` onto the new
   signature (behaviour identical, green).
2. **Feature:** `KeyboardShortcut` type; `stepRate` util; `KEYBOARD_SHORTCUTS` +
   `SHORTCUTS_BY_KEY`; `watchKeyboardEventsSaga` (+ `logCameraState` arm);
   `logCameraState` action + `ReconcileEffects` wire; delete the hook + its type +
   `watchTourKeyboardSaga`; rewire `App.tsx` + `rootSaga`.
3. `/feature-done` audit before merge; remove the backlog item (index line +
   detail file) in the spec commit.
