# Fold app-level UI state into a `ui` root slice (plan)

> **For agentic workers.** Execute this plan via the
> **REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`** — a fresh
> subagent per task, with the spec + per-task `Interfaces` block as its brief,
> plus the spec/quality reviews that workflow gates on. Each task is a TDD loop:
> write the failing test → run it and confirm it fails → minimal implementation
> → confirm it passes → commit.

**Goal.** Fold the scattered app-level UI Intent — `App.tsx`'s `paletteOpen` /
`uiHidden` / `debugPanelOpen` `useState`, plus `useSplash`'s visibility/dismiss
state — into one `ui` root slice (sibling of `settings`), keeping splash's derived
state derived and its `localStorage` persistence a thin effect.

**Architecture.** A new `ui` root slice holds `paletteOpen`, `uiHidden`,
`debugPanelOpen`, and a nested `splash` object (`visible` + `dismissedVersion`).
React reads it through selectors (`useAppSelector`) and changes it by dispatching;
the initial slice is computed once by `buildInitialUiState()` (from `localStorage`
`seenVersion` + deep-link presence) and seeded via `preloadedState`. Writing
`seenVersion` back to `localStorage` is a thin `store.subscribe` effect in
`main.tsx`, not slice state. Splash's `blocked` / `canContinueAnyway` / `error`
stay computed in `useSplash`, and `UseSplashReturn`'s shape is unchanged so
`Splash` / `AboutPill` don't change.

**Tech Stack.** TS + Redux Toolkit (inline Immer slice) + React 19 +
`react-redux`; Vitest + `@testing-library/react`. No saga work on this branch.

**Source of truth.** The approved design
[`2026-06-19-ui-state-slice-design.md`](../specs/2026-06-19-ui-state-slice-design.md).
Read it fully before starting; this plan is its build order (§8) broken into TDD
tasks. ADR 0007 + [`intent.md`](../conventions/intent.md) carry the rationale.

## Global Constraints

- TS: `export type X = …`, never `interface`. One type per file under
  `src/@types/` (filename = exported type). **`UiState` lives at
  `src/@types/ui/UiState.d.ts`** — mirroring `EngineSettingsState`
  (`src/@types/settings/EngineSettingsState.d.ts`), which is the slice-state type
  the settings slice imports. The slice / selectors / builder live under
  `src/state/ui/` and import the type. Single-function files in `utils/` named for
  the function. No barrels; deep relative imports.
- Tests: Vitest. Typed `vi.fn<() => void>()`, never bare `vi.fn()`.
- Slice-reducer args named `state`/`action`, never terse `s`/`a`.
- Didactic comments: explain *why* and the rejected alternative (match the
  multi-paragraph module headers already on `useSplash.ts` / the settings slice).
  Comments timeless + terse — no dates, no PR refs, no "pre-X" history notes.
- Branch + PR, squash-merge. Commit with the user's git identity (Co-Authored-By
  trailer only, never `--author`). Stage specific paths, never `git add -A`.
  Prettier only the files you touched.
- The suite stays green at **every** task (currently 590+ tests / 76 files). The
  build order is additive (slice → seed → cut App → cut `useSplash`) so no step is
  red; report the new green count after the final task.

## Naming contracts (spelled identically everywhere)

| Name | Kind | Home |
| --- | --- | --- |
| `UiState` | type | `src/@types/ui/UiState.d.ts` |
| `uiSlice` (default export `uiReducer`) — `setPaletteOpen`/`setUiHidden`/`toggleUiHidden`/`setDebugPanelOpen`/`toggleDebugPanelOpen`/`dismissSplash`/`reopenSplash` | slice + actions | `src/state/ui/uiSlice.ts` |
| `selectPaletteOpen`/`selectUiHidden`/`selectDebugPanelOpen`/`selectSplashVisible`/`selectSplashDismissedVersion` | selectors | `src/state/ui/selectors.ts` |
| `buildInitialUiState` | fn | `src/state/ui/buildInitialUiState.ts` |
| `persistSplashVersion` | fn | `src/state/ui/persistSplashVersion.ts` |
| `CURRENT_SPLASH_VERSION`/`SPLASH_STORAGE_KEY`/`readSeenVersion`/`writeSeenVersion` | consts + helpers | `src/state/ui/splashStorage.ts` (relocated from `useSplash.ts`) |
| `uiRoute` | const (`'ui' as const`) | `src/store/constants.ts` |

---

## Phase 1 — Slice + selectors + initial-state builder (additive)

Mirrors spec §8.1. Nothing reads the slice yet; suite stays green.

### Task 1.1 — `UiState` type + `uiSlice` + reducers

**Files:**
- `src/@types/ui/UiState.d.ts` (create) — the slice-state type.
- `src/state/ui/uiSlice.ts` (create) — `createSlice` + the five reducers; default
  export `uiReducer`.
- `tests/state/ui/uiSlice.test.ts` (create).

**Interfaces:**

Consumes: `createSlice`, `type PayloadAction` from `@reduxjs/toolkit`; `UiState`.

Produces (type per spec §1, exactly):

```ts
// src/@types/ui/UiState.d.ts
export type UiState = {
  paletteOpen: boolean;
  uiHidden: boolean;
  debugPanelOpen: boolean;
  splash: {
    visible: boolean;
    dismissedVersion: number | null;
  };
};
```

Reducer signatures (per spec §2; args named `state`/`action`):

```ts
setPaletteOpen(state, action: PayloadAction<boolean>)      // state.paletteOpen = action.payload
setUiHidden(state, action: PayloadAction<boolean>)         // state.uiHidden = action.payload
toggleUiHidden(state)                                      // state.uiHidden = !state.uiHidden
setDebugPanelOpen(state, action: PayloadAction<boolean>)   // state.debugPanelOpen = action.payload
toggleDebugPanelOpen(state)                                // state.debugPanelOpen = !state.debugPanelOpen
dismissSplash(state, action: PayloadAction<number>)        // splash.visible=false; splash.dismissedVersion=action.payload
reopenSplash(state)                                        // splash.visible=true; dismissedVersion UNTOUCHED
```

`toggleUiHidden` / `toggleDebugPanelOpen` exist because the keyboard shortcuts
*toggle* those flags (`setUiHidden((prev) => !prev)` / `setDebugPanelOpen((prev) =>
!prev)`, `useKeyboardShortcuts.ts:93,109`). Toggle is the Intent, so it is its own
reducer computing `!state.x` — this removes the React `SetStateAction`
functional-updater contract from the slice's edge and the stale-closure trap that
a "close over the current value and dispatch the next boolean" shim would carry.
`paletteOpen` needs no toggler — the keyboard only ever opens it
(`setPaletteOpen(true)`, `:51,57`).

`createSlice` needs a concrete `initialState`; use `buildInitialUiState()` once it
exists (Task 1.3). For THIS task, seed the slice's `initialState` from a plain
literal (`paletteOpen:false, uiHidden:false, debugPanelOpen:false,
splash:{visible:false, dismissedVersion:null}`) and swap it to
`buildInitialUiState()` in Task 1.3 — keeps 1.1 free of the builder it doesn't have
yet. (Inline-Immer pattern: mirror `settingsSlice.ts:49-60`.)

**Didactic note for the module header:** `splash` is a *nested object*, not its own
root slice — two fields, unambiguously UI; a separate root would be
over-segmentation (spec §1). `dismissSplash` is one reducer for both Explore and
Tour dismiss; `reopenSplash` leaves `dismissedVersion` alone because reopening is
informational, not a first-time event (matches today's `reopen` contract,
`useSplash.ts:185-189`).

- [x] Tests (per spec §7 "Slice"):
  - `setPaletteOpen(true) writes paletteOpen`
  - `setUiHidden(true) writes uiHidden`
  - `toggleUiHidden flips uiHidden` (false→true→false across two dispatches)
  - `setDebugPanelOpen(true) writes debugPanelOpen`
  - `toggleDebugPanelOpen flips debugPanelOpen`
  - `dismissSplash(2) sets splash.visible false and dismissedVersion 2`
  - `reopenSplash sets splash.visible true and leaves dismissedVersion unchanged`
    (seed `dismissedVersion:2`, dispatch `reopenSplash`, assert still `2`).
- [x] Confirm fail → implement → pass. `npm test -- uiSlice`.
- [x] Commit.

### Task 1.2 — `selectors.ts`

**Files:**
- `src/state/ui/selectors.ts` (create).
- `tests/state/ui/selectors.test.ts` (create).

**Interfaces:**

Consumes: `RootState` (`../../store/types`); `uiRoute` (`../../store/constants`) —
base the reads on `state[uiRoute]` so the route is named once (mirror
`settings/selectors.ts:37-39`).

Produces (signatures per spec §3, exactly):

```ts
export const selectPaletteOpen = (state: RootState): boolean => …;
export const selectUiHidden = (state: RootState): boolean => …;
export const selectDebugPanelOpen = (state: RootState): boolean => …;
export const selectSplashVisible = (state: RootState): boolean => …;
export const selectSplashDismissedVersion = (state: RootState): number | null => …;
```

Plain composed arrows over the slice — no `createSelector` (primitives compare by
value; mirror the settings selectors' "leaf selectors need no memo" note,
`settings/selectors.ts:9-24`). One consolidated selectors module, matching the
settings convention (the deliberate override of one-fn-per-file).

(`uiRoute` lands in Task 1.4; until then a test can read `state.ui` directly — but
prefer ordering 1.4 before 1.2 if the implementer wants `uiRoute` available. Either
order is green; the selectors don't read the store until Phase 3.)

- [x] Tests (spec §7 "Selectors"): each selector returns its slice field, driving a
  hand-built `RootState`-shaped object (or a real store via `createAppStore`).
- [x] Confirm fail → implement → pass. `npm test -- ui/selectors`. Commit.

### Task 1.3 — relocate `splashStorage` + `buildInitialUiState()`

**Files:**
- `src/state/ui/splashStorage.ts` (create) — move `CURRENT_SPLASH_VERSION`,
  `SPLASH_STORAGE_KEY`, `readSeenVersion`, `writeSeenVersion` here from
  `src/hooks/useSplash.ts` (`:69,76,85-115` region). They are now read by
  `buildInitialUiState` + the persistence effect (both in `state/`), so keeping
  them in `hooks/` would make the store layer import from the React layer — a
  layering inversion. The splash-Intent home (`state/ui/`) owns its persistence
  helpers.
- `src/hooks/useSplash.ts` (modify) — re-import the four symbols from
  `../state/ui/splashStorage` (hooks depending on state is the correct direction);
  no behaviour change in this task.
- `src/state/ui/buildInitialUiState.ts` (create).
- `tests/state/ui/buildInitialUiState.test.ts` (create).
- `tests/state/ui/splashStorage.test.ts` (create — move the
  `readSeenVersion`/`writeSeenVersion` unit tests that lived against `useSplash`).
- `src/state/ui/uiSlice.ts` (modify) — swap the literal `initialState` for
  `buildInitialUiState()`.

**Interfaces:**

Consumes: `hasDeepLink` (`../../utils/url/hasDeepLink`) — signature
`hasDeepLink({ hash, search }: DeepLinkInput): boolean`; `CURRENT_SPLASH_VERSION`,
`SPLASH_STORAGE_KEY`, `readSeenVersion` from the new `./splashStorage`. It reads the
SAME inputs `useSplash` reads today (`useSplash.ts:130-135`): `localStorage`
`seenVersion` vs. the current version, and deep-link presence from the URL.

Produces:

```ts
export function buildInitialUiState(): UiState;
```

Splash-initial logic (lift the three-gate decision from `useSplash.ts:130-135`):
deep link present → `visible:false`; else stored `seenVersion >= CURRENT_SPLASH_VERSION`
→ `visible:false`; else `visible:true`. `dismissedVersion` seeds to the stored
`seenVersion` (a `number`) when present, else `null` — `readSeenVersion()` already
returns `number | null`, matching `UiState.splash.dismissedVersion: number | null`
(no string conversion anywhere; the on-disk integer format is unchanged).
`paletteOpen` / `uiHidden` / `debugPanelOpen` seed `false`. The SSR-safe `typeof
window` guards + private-browsing try/catch live in `readSeenVersion` /
`readUrlAtMount` (relocated alongside).

- [x] Move the four symbols into `splashStorage.ts`; repoint `useSplash.ts`'s
  imports; move their unit tests. Confirm `npm test -- useSplash splashStorage` green
  (pure relocation, no behaviour change).
- [x] Tests (spec §7 "buildInitialUiState"; drive `localStorage` + URL as fixtures,
  jsdom env, mirror `useSplash.test.ts:27-55`):
  - `splash.visible is false when seenVersion equals the current version`
  - `splash.visible is true on a first visit (no seenVersion)`
  - `splash.visible is false when a #focus= deep link is present (regardless of seen state)`
  - `splash.visible is false when a ?tour= deep link is present`
  - `paletteOpen, uiHidden, debugPanelOpen all default false`
- [x] Confirm fail → implement; swap the slice's `initialState` to
  `buildInitialUiState()`. `npm test -- buildInitialUiState uiSlice`. Commit.

### Task 1.4 — wire `uiRoute` into store

**Files:**
- `src/store/constants.ts` (modify) — add `export const uiRoute = 'ui' as const;`
  (sibling of `settingsRoute:17`; the file's docstring already anticipates "one
  constant per top-level slice").
- `src/store/rootReducer.ts` (modify) — add `[uiRoute]: uiReducer` to the
  `combineReducers` map (alongside `[settingsRoute]:21-23`); import `uiReducer`
  from `../state/ui/uiSlice`.
- `src/store/createAppStore.ts` (modify) — grow `PreloadedState` (`:34`) to
  `{ [settingsRoute]: EngineSettingsState; [uiRoute]: UiState }`; import `UiState`.
- `tests/store/createAppStore.test.ts` (modify) — any `createAppStore({ … })` call
  now also passes `[uiRoute]: buildInitialUiState()` (or a literal `UiState`).

**Interfaces:** `RootState` (`store/types.ts:19`) is `ReturnType<typeof
rootReducer>` — it gains `ui` automatically from the combine; **no hand-edit** to
`types.ts`. `AppStore`/`AppDispatch` unchanged (this branch keeps
`createAppStore` returning the bare store; the `{store,setSagaContext}` change is a
different branch — do not import it here).

- [x] Failing test: assert `createAppStore(…).getState().ui` exists / equals the
  seeded `UiState`; assert `RootState` typechecks with a `ui` field (tsc).
- [x] Implement the three store edits. `npm run typecheck` + `npm test -- createAppStore`.
  (Controller decision: `[uiRoute]?` is OPTIONAL, not required — ~14 existing
  `{settings}`-only callers stay green untouched; the slice self-seeds via
  `buildInitialUiState()`. Task 2.1's `main.tsx` seed folded into this commit.)
- [x] Commit.

---

## Phase 2 — Seed + persistence (additive; App/useSplash unchanged)

Mirrors spec §8.2. Still nothing in App/useSplash reads the slice — the seed +
effect run alongside the existing `useSplash` `useState`/localStorage path, both
writing the same key idempotently, so the suite stays green.

### Task 2.1 — seed the `ui` slice in `main.tsx`

**Files:**
- `src/main.tsx` (modify) — the `createAppStore({ [settingsRoute]: … })` call
  (`main.tsx:70`).
- `tests/main.*` if one exists (else rely on `createAppStore` test from 1.4).

**Interfaces:** Consumes `buildInitialUiState` + `uiRoute`. After:

```ts
// main.tsx:70 (before)
const store = createAppStore({ [settingsRoute]: buildInitialSettings({ initialTier }) });
// after — seed both routes
const store = createAppStore({
  [settingsRoute]: buildInitialSettings({ initialTier }),
  [uiRoute]: buildInitialUiState(),
});
```

- [x] Add the import + the `[uiRoute]` seed. Update the `main.tsx` Provider docblock
  (`:32-36`) to mention the second seeded route in one timeless line.
  (Done as part of the Task 1.4 commit — see above.)
- [x] `npm run typecheck` + `npm test` → green. Commit.

### Task 2.2 — persistence effect (`store.subscribe`) in `main.tsx`

**Files:**
- `src/state/ui/persistSplashVersion.ts` (create) — a small, testable subscriber
  factory so the diffing logic isn't an untestable inline closure in `main.tsx`.
- `tests/state/ui/persistSplashVersion.test.ts` (create).
- `src/main.tsx` (modify) — install the subscription after the store is built.

**Interfaces:**

Consumes: `selectSplashDismissedVersion`; `writeSeenVersion` + `SPLASH_STORAGE_KEY`
from `./splashStorage`; an `AppStore`.

Produces (signature — body from the test):

```ts
// subscribes; writes seenVersion to localStorage whenever the dismissed version
// CHANGES to a non-null value; returns the unsubscribe fn.
export function persistSplashVersion(store: AppStore): () => void;
```

Behaviour (spec §4 / §7 "Persistence effect"): on each `store.subscribe` tick,
read `selectSplashDismissedVersion(store.getState())` (a `number | null`); if it
changed from the previously-seen value AND is non-null, write it via
`writeSeenVersion(version)` (the relocated SSR-safe + try/catch writer that does the
`String(version)` for `localStorage`). `reopenSplash` leaves `dismissedVersion`
untouched, so it produces NO write — that falls out of the change-diff, but assert
it explicitly.

**Didactic note:** writing `seenVersion` is a reactive *consequence* of
`dismissSplash`, not slice state — so it lives outside the slice as a thin effect
(spec §4). On this branch the effect is a `store.subscribe`; the spec allows a
`takeEvery(dismissSplash)` saga as an alternative **once the reconcile saga seam
lands**, but that seam is NOT in this branch — the subscription is the chosen form.
State this rationale in the header (no dates / PR refs).

- [x] Tests (real `createAppStore` seeded, jsdom localStorage):
  - `dispatching dismissSplash(2) writes seenVersion to localStorage`
  - `reopenSplash does not write seenVersion` (seed a dismissed version, clear the
    storage spy, dispatch `reopenSplash`, assert no write)
  - `the returned unsubscribe stops further writes`
- [x] Confirm fail → implement → pass; install
  `persistSplashVersion(store)` in `main.tsx` (inside the `else` branch, after the
  store is created). `npm test -- persistSplashVersion`.
- [x] `npm run typecheck` + `npm test` → green. Commit.

---

## Phase 3 — Cut `App.tsx` over

Mirrors spec §8.3. Replace the three `useState` booleans with selector reads +
dispatches. The keyboard-shortcut toggle wrinkle is handled here (see Interfaces).

### Task 3.1 — App.tsx: three flags → `useAppSelector` + dispatch

**Files:**
- `src/components/App/App.tsx` (modify) — delete the three `useState`
  (`App.tsx:225` `paletteOpen`, `:235` `uiHidden`, `:238` `debugPanelOpen`); add
  `const dispatch = useAppDispatch();`.
- `src/@types/engine/UseKeyboardShortcutsInput.d.ts` (modify) — swap the two
  toggled setters for togglers (see below).
- `src/hooks/useKeyboardShortcuts.ts` (modify) — call the togglers
  (`useKeyboardShortcuts.ts:93,109`).
- `tests/components/App.*` / `tests/hooks/useKeyboardShortcuts.*` — repoint any
  test asserting on the `useState` setters.

**Interfaces:**

Consumes: `useAppDispatch` (`../../store/hooks`); the slice actions
(`setPaletteOpen`/`toggleUiHidden`/`toggleDebugPanelOpen` from
`../../state/ui/uiSlice`); the selectors
(`selectPaletteOpen`/`selectUiHidden`/`selectDebugPanelOpen`).

Reads:
- `const paletteOpen = useAppSelector(selectPaletteOpen);` (replaces `:225`)
- `const uiHidden = useAppSelector(selectUiHidden);` (replaces `:235`)
- `const debugPanelOpen = useAppSelector(selectDebugPanelOpen);` (replaces `:238`)

Writes:
- `openPalette`/`closePalette` (`App.tsx:229-230`) → `dispatch(setPaletteOpen(true|false))`.

**The keyboard toggle (resolved: toggler reducers).**
`useKeyboardShortcuts` today takes `setPaletteOpen`/`setUiHidden`/`setDebugPanelOpen`
and calls the latter two with *functional updaters*
(`setUiHidden((prev) => !prev)` `useKeyboardShortcuts.ts:93`;
`setDebugPanelOpen((prev) => !prev)` `:109`). Rather than re-create the React
`SetStateAction` contract over `dispatch` (a closure-over-current-value shim with a
stale-closure trap), the toggle is modelled as Intent: the slice's
`toggleUiHidden` / `toggleDebugPanelOpen` reducers compute `!state.x` from store
state. So:

- `UseKeyboardShortcutsInput` drops `setUiHidden` / `setDebugPanelOpen` and gains
  `toggleUiHidden: () => void` + `toggleDebugPanelOpen: () => void`. `setPaletteOpen:
  (open: boolean) => void` stays (the hook only calls `setPaletteOpen(true)`).
- The hook body calls `toggleUiHidden()` / `toggleDebugPanelOpen()` at `:93,109`
  (and updates its dep array `:116`).
- App passes `setPaletteOpen={(open) => dispatch(setPaletteOpen(open))}`,
  `toggleUiHidden={() => dispatch(toggleUiHidden())}`,
  `toggleDebugPanelOpen={() => dispatch(toggleDebugPanelOpen())}`. No value is
  closed over, so there is no stale-closure risk.

- [x] Replace the three `useState` with selector reads; add `dispatch`; rewrite
  `openPalette`/`closePalette` to dispatch; change `UseKeyboardShortcutsInput` +
  the hook to togglers; pass the dispatching callbacks. Update the surrounding
  didactic comments (the "useState" framing → "reads the `ui` slice via selector;
  the keyboard hook dispatches `toggleUiHidden`/`toggleDebugPanelOpen`").
  (Dispatching callbacks wrapped in `useCallback([dispatch])` so the keyboard
  effect's dep array stays stable — no per-render re-bind.)
- [x] Repointed keyboard test: pressing the toggle key twice flips the flag both
  ways (proves the reducer toggle, no stale closure). New 9-case integration test
  against a real store (no prior keyboard test existed).
- [x] `npm test` + `npm run typecheck` → green (the splash path still uses
  `useSplash`'s own state, untouched).
- [x] Commit.

---

## Phase 4 — Cut `useSplash` over

Mirrors spec §8.4. Visibility/dismiss/reopen become slice-backed; the in-hook
`localStorage` write is gone (now the Task 2.2 effect); the first-visit/deep-link
init moves to `buildInitialUiState`. `UseSplashReturn` shape is **unchanged**, so
`Splash` / `AboutPill` don't change.

### Task 4.1 — `useSplash`: visibility/dismiss/reopen → slice

**Files:**
- `src/hooks/useSplash.ts` (modify).
- `tests/hooks/useSplash.test.ts` (modify — repoint).

**Interfaces:**

Consumes: `useAppSelector` + `useAppDispatch` (`../store/hooks`);
`selectSplashVisible` (`../state/ui/selectors`); `dismissSplash` / `reopenSplash`
(`../state/ui/uiSlice`); `CURRENT_SPLASH_VERSION` (now from
`../state/ui/splashStorage`, relocated in Task 1.3). Keeps `UseSplashInput` /
`UseSplashReturn` unchanged.

Changes inside the hook:
- `splashVisible` is no longer `useState` (`useSplash.ts:130-135`) → read
  `useAppSelector(selectSplashVisible)`.
- `dismissExplore` / `dismissTour` (`useSplash.ts:175-183`) →
  `dispatch(dismissSplash(CURRENT_SPLASH_VERSION))` (a `number`, per
  `UiState.splash.dismissedVersion: number | null`). They no longer call
  `writeSeenVersion` — that is now the Task 2.2 effect. Both still collapse to the
  one `dismissSplash` action.
- `reopen` (`useSplash.ts:185-189`) → `dispatch(reopenSplash())`. Still does NOT
  persist (the effect only writes on `dismissedVersion` change, which `reopenSplash`
  doesn't touch).
- **KEEP unchanged:** `blocked` (`:142-146`), the 8 s `canContinueAnyway` timer
  (`:153-171` — it keys off `splashVisible` + `blocked`, both still available), and
  the `error` mapping (`:203-214`). These are derived, not Intent (spec scope-out).
- **DELETE:** the `setSplashVisible` state and the lazy initializer (the init logic
  moved to `buildInitialUiState`). `readSeenVersion` / `readUrlAtMount` /
  `writeSeenVersion` / `CURRENT_SPLASH_VERSION` / `SPLASH_STORAGE_KEY` already moved
  to `state/ui/splashStorage.ts` in Task 1.3 — the hook now imports
  `CURRENT_SPLASH_VERSION` from there and no longer writes storage itself.

The `useSplash` tests must now render inside a redux `<Provider>` (a real
`createAppStore` seeded via `buildInitialUiState()` under a controlled
`localStorage`/URL fixture) so `useAppSelector` resolves — mirror how other
store-backed hook tests wrap with `<Provider>`.

- [x] Repoint the existing init tests (`useSplash.test.ts:27-55`) — the
  first-visit / deep-link / seenVersion cases now assert through the seeded store
  (or move to `buildInitialUiState.test.ts`, already covering them in Task 1.3;
  keep `useSplash`'s as integration coverage that `splashVisible` *follows the
  store*). Gate logic left to `buildInitialUiState.test.ts`; useSplash tests now
  prove `splashVisible` follows the seeded store + dispatches.
- [x] Tests (spec §7 "useSplash"):
  - `splashVisible follows the store` (dispatch `reopenSplash`/`dismissSplash`,
    assert `result.current.splashVisible` flips)
  - `dismissExplore dispatches dismissSplash` (assert store
    `selectSplashDismissedVersion` becomes the current version + `visible:false`)
  - `dismissTour dispatches dismissSplash` (same)
  - `reopen dispatches reopenSplash` (assert `visible:true`, dismissedVersion
    unchanged)
  - `blocked / canContinueAnyway / error still derive as before` (keep the existing
    timer + error assertions green)
- [x] Confirm fail → implement → pass. `npm test -- useSplash`.
- [x] `npm run typecheck` + `npm test` → green. Commit.

---

## Phase 5 — Quality gate + tie-off

### Task 5.1 — verification + handoff

**Files:** none (review pass).

- [x] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [x] `npm test` (full suite) → green; record the new count (2728 tests / 448 files,
  up from the pre-branch baseline, incl. the new `uiSlice` / `selectors` /
  `buildInitialUiState` / `persistSplashVersion` / keyboard-integration / rewritten
  `useSplash` tests).
- [x] Grep `App.tsx` for residual `useState(` on the three folded flags
  (`paletteOpen` / `uiHidden` / `debugPanelOpen`) — zero hits; they're now selector
  reads. (The local-only `initialMobile` `useState` STAYS — out of scope per spec.)
- [x] Confirm `UseSplashReturn` (`src/@types/splash/UseSplashReturn.d.ts`) is
  shape-identical to its pre-branch contract — `Splash` / `AboutPill` need no change
  (only stale doc comments updated). Confirmed the in-hook `localStorage` write is
  gone from `useSplash.ts` (no `setItem` / `writeSeenVersion`).
- [x] entanglement-radar lens (folded into the final whole-branch review): splash
  persistence CONFIRMED single-writer (`writeSeenVersion` called only from
  `persistSplashVersion`), `splashVisible` CONFIRMED single source of truth (the
  slice), derived state CONFIRMED still derived. No mirror-write.
- [x] Run the `superpowers:finishing-a-development-branch` handoff: present
  merge/PR/cleanup options to the user (branch + PR, squash-merge). User
  smoke-tested all surfaces; `/feature-done` audit passed (READY).

---

## Resolved decisions (settled during planning; baked into the tasks above)

1. **`dismissedVersion` is `number | null`** (not the spec's first-draft `string`).
   The persisted `seenVersion` is an integer (`CURRENT_SPLASH_VERSION = 1`;
   `readSeenVersion` returns `number | null`), so the slice holds a `number` and no
   string⇄number conversion edge is invented anywhere. The spec was updated to
   match. (Tasks 1.1, 1.2, 1.3, 2.2, 4.1.)

2. **The keyboard toggle is a slice reducer, not a `SetStateAction` shim.**
   `toggleUiHidden` / `toggleDebugPanelOpen` compute `!state.x`; the hook dispatches
   them. This avoids re-creating React's functional-updater contract over `dispatch`
   and its stale-closure trap. (Tasks 1.1, 3.1.)

3. **`CURRENT_SPLASH_VERSION` / `SPLASH_STORAGE_KEY` + the storage read/write helpers
   relocate to `src/state/ui/splashStorage.ts`.** They are now read by
   `buildInitialUiState` + the persistence effect (both `state/`); leaving them in
   `useSplash.ts` (`hooks/`) would make the store layer import from the React layer —
   a layering inversion. `useSplash` re-imports them (hooks→state is the correct
   direction). (Task 1.3.)

## References

- Spec: [`2026-06-19-ui-state-slice-design.md`](../specs/2026-06-19-ui-state-slice-design.md)
- [ADR 0007 — intent-centric state + effects](../../adrs/0007-intent-centric-state-and-effects.md)
- [`intent.md`](../conventions/intent.md) — Intent / derived / resource boundary.
- Sibling fold (house style): [`2026-06-19-engine-handles-to-reconcile-sagas.md`](./2026-06-19-engine-handles-to-reconcile-sagas.md).
