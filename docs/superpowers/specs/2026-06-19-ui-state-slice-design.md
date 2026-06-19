# Fold app-level UI state into a `ui` root slice (design)

> **Status:** approved design, awaiting implementation plan.
> **Why this exists:** app-level UI Intent — the command-palette open flag, the
> UI-chrome-hidden flag, the debug-panel open flag, and splash visibility — lives
> today as scattered `useState` in `App.tsx` plus a `useSplash` hook backed by
> `localStorage`. [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md)
> says **all app-facing Intent lives in one store under a single write path**;
> these are Intent that never moved. This folds them into a `ui` root slice
> alongside `settings`, keeping derived splash state derived and persistence as a
> thin effect.

## The decision in one line

A new `ui` **root slice** (sibling of `settings`) holds the app-level UI Intent —
`paletteOpen`, `uiHidden`, `debugPanelOpen`, and a nested `splash` object
(`visible` + `dismissedVersion`). React reads it via selectors and changes it by
dispatching; the `useState` mirrors in `App.tsx` and the visibility/dismiss state
in `useSplash` are deleted. Splash's **derived** parts (`blocked`,
`canContinueAnyway`, `error`) stay computed, and its `localStorage` persistence
stays a thin effect outside the slice.

## Scope

**In scope — fold into the `ui` slice:**

- `App.tsx`'s `paletteOpen`, `uiHidden`, `debugPanelOpen` (`App.tsx:225,235,238`).
- Splash **visibility Intent**: the `splashVisible` gate and the dismissed-version
  marker that `useSplash` manages (`UseSplashReturn.splashVisible` +
  `dismissExplore`/`dismissTour`/`reopen`).

**Out of scope (deliberately left alone):**

- **Splash derived state.** `blocked`, `canContinueAnyway` (the 8 s timer), and
  `error` (`SplashError`) are *validations of engine status + load progress*, not
  Intent — they stay computed in `useSplash` (selectors over engine status /
  `LoadProgressState`). Storing them would re-mirror engine status (intent.md
  "derive, don't mirror").
- **Splash persistence.** The `localStorage` `seenVersion` read/write is a
  reactive *consequence* of dismiss Intent, not slice state — it stays a thin
  effect (a store subscription, or a saga if the reconcile seam has landed; **not**
  coupled to that work). The **initial** `{ visible, dismissedVersion }` is
  computed once from `localStorage` + deep-link presence and seeded via
  `preloadedState`, the way `tier` is seeded.
- **Purely-local component state.** `Panel` / `CollapsibleSection` open flags,
  `CommandPalette` query + selected index, `DebugPanel` form fields, `Thumbnail`
  load flag, `initialMobile` (init-once). These are single-component ephemeral
  state with one reader and one writer — folding them into a global object would
  braid unrelated component internals together (intent.md: "if dispatching it
  60×/second would be absurd, it is not Intent"; a search-box keystroke is).
- **The Explore-vs-Tour distinction.** Both dismiss the splash identically; what
  differs (start a tour or not) is a separate concern downstream of the dismiss,
  not part of this slice.

---

## 1. The slice shape

A new root slice. `splash` is a **nested object**, not its own root slice — it is
two fields and unambiguously UI; a separate root would be over-segmentation.

```ts
// src/state/ui/UiState (the slice's state shape)
export type UiState = {
  paletteOpen: boolean;
  uiHidden: boolean;
  debugPanelOpen: boolean;
  splash: {
    visible: boolean;             // Intent: dismiss/reopen mutate it
    dismissedVersion: string | null; // Intent mirror of localStorage seenVersion
  };
};
```

`RootState` grows a `ui` field; `src/store/constants.ts` gains
`export const uiRoute = 'ui' as const;`; `rootReducer` wires `[uiRoute]:
uiReducer`; the `createAppStore` `PreloadedState` type grows `[uiRoute]: UiState`.

## 2. Reducers (the single write path)

`src/state/ui/uiSlice.ts` — `createSlice({ name: 'ui', initialState, reducers })`:

- `setPaletteOpen(state, action: PayloadAction<boolean>)`
- `setUiHidden(state, action: PayloadAction<boolean>)`
- `setDebugPanelOpen(state, action: PayloadAction<boolean>)`
- `dismissSplash(state, action: PayloadAction<string>)` — sets
  `splash.visible = false` and `splash.dismissedVersion = action.payload` (the
  current app version). One reducer for both Explore and Tour dismiss.
- `reopenSplash(state)` — sets `splash.visible = true`; leaves
  `dismissedVersion` untouched (reopening is informational, not a first-time
  event — matches today's `reopen` contract in `UseSplashReturn`).

(Per the project convention, slice-reducer args are named `state`/`action`, never
terse `s`/`a`.)

## 3. Selectors

`src/state/ui/selectors.ts` (consolidated selectors file, matching the settings
convention):

```ts
export const selectPaletteOpen = (s: RootState): boolean => s.ui.paletteOpen;
export const selectUiHidden = (s: RootState): boolean => s.ui.uiHidden;
export const selectDebugPanelOpen = (s: RootState): boolean => s.ui.debugPanelOpen;
export const selectSplashVisible = (s: RootState): boolean => s.ui.splash.visible;
export const selectSplashDismissedVersion = (s: RootState): string | null =>
  s.ui.splash.dismissedVersion;
```

## 4. Seeding + persistence (outside the slice)

**Seed (init-once, into `preloadedState`).** A `buildInitialUiState()` helper
(`src/state/ui/buildInitialUiState.ts`) computes the initial slice — in particular
`splash.visible` and `splash.dismissedVersion` — from the same inputs `useSplash`
reads today: the `localStorage` `seenVersion` vs. the current app version, and
deep-link presence (`hasDeepLink`, which skips the splash). `main.tsx` seeds it via
`createAppStore({ [uiRoute]: buildInitialUiState(), ... })`. `paletteOpen` /
`uiHidden` / `debugPanelOpen` seed `false`.

**Persist (a thin effect, not the slice).** Writing `seenVersion` to
`localStorage` is a reactive consequence of `dismissSplash`. It lives as a thin
effect — the simplest is a store subscription in `main.tsx` (`store.subscribe`
diffing `selectSplashDismissedVersion`), or a `takeEvery(dismissSplash)` saga **if**
the reconcile seam from the engine-handles work has landed. It needs no engine
resources (localStorage is global), so it stays independent of that work; the plan
picks whichever is in tree at execution time and notes the choice.

## 5. The migration

**`App.tsx`** — delete the three `useState` booleans
(`App.tsx:225,235,238`); read via `useAppSelector(selectPaletteOpen)` etc. and
write via `dispatch(setPaletteOpen(v))`. The deep-link / first-visit computation
that today seeds `useState`/`useSplash` moves into `buildInitialUiState`.

**`useSplash`** (`src/hooks/useSplash.ts` + `UseSplashReturn`) — keep
computing `blocked` / `canContinueAnyway` / `error` (unchanged); its `splashVisible`
now reads `selectSplashVisible`; `dismissExplore`/`dismissTour` dispatch
`dismissSplash(currentVersion)`; `reopen` dispatches `reopenSplash()`. The hook's
return type is unchanged, so `Splash` / `AboutPill` consumers don't change.

**Untouched:** the local-state components in scope-out §; `Splash` /
`SplashProgress` / `AboutPill` rendering; the `SplashError` derivation.

---

## 6. Blast radius

**Add:**
`src/state/ui/{UiState (type), uiSlice, selectors, buildInitialUiState}.ts`;
`uiRoute` in `src/store/constants.ts`.

**Rework:**
`src/store/rootReducer.ts` (+ui route); `src/store/createAppStore.ts`
(`PreloadedState` +`[uiRoute]`); `src/store/types.ts` (`RootState` gains `ui` via
the reducer combine — derived, no hand-edit); `src/main.tsx` (seed
`buildInitialUiState`, install the persistence subscription); `src/components/App/App.tsx`
(selector reads + dispatches); the `useSplash` hook (visibility/dismiss/reopen
slice-backed).

**Delete:**
the `paletteOpen`/`uiHidden`/`debugPanelOpen` `useState` in `App.tsx`; the
visibility/dismiss `useState` (or equivalent) inside `useSplash`; the in-hook
`localStorage` write moves to the §4 effect.

**Unchanged:** `UseSplashReturn` shape; splash derived state; all local-component
`useState`; the settings slice and the (parallel) reconcile-sagas work.

---

## 7. Testing

- **Slice** (`uiSlice.test.ts`): each setter writes its field; `dismissSplash('v2')`
  sets `visible:false` + `dismissedVersion:'v2'`; `reopenSplash` sets `visible:true`
  and leaves `dismissedVersion` unchanged.
- **`buildInitialUiState`**: returns `splash.visible:false` when `seenVersion ===`
  current version; `true` when unseen; `false` when a deep link is present
  (regardless of seen state); `paletteOpen`/`uiHidden`/`debugPanelOpen` default
  `false`. Drive `localStorage` + deep-link inputs as fixtures (mirrors today's
  `useSplash` init tests — repoint them).
- **Selectors**: each returns its slice field.
- **Persistence effect**: dispatching `dismissSplash('v2')` writes
  `seenVersion='v2'` to `localStorage`; `reopenSplash` does **not** write.
- **`useSplash`** (repoint existing hook tests): `splashVisible` follows the store;
  `dismissExplore`/`dismissTour` dispatch `dismissSplash`; `reopen` dispatches
  `reopenSplash`; `blocked`/`canContinueAnyway`/`error` still derive as before.

---

## 8. Build order (suite green at each step)

1. **Slice + selectors + `buildInitialUiState`**; wire `uiRoute` into `rootReducer`
   + `PreloadedState`. Additive — nothing reads it yet; suite green.
2. **Seed in `main.tsx`** via `preloadedState`; add the persistence effect
   (subscription/saga). Still additive — App/useSplash unchanged.
3. **Cut `App.tsx`** over: replace the three `useState` booleans with selector
   reads + dispatches.
4. **Cut `useSplash`** over: visibility/dismiss/reopen become slice-backed; repoint
   the hook + init tests; relocate the `localStorage` write to the §4 effect.

---

## References

- [ADR 0007 — intent-centric state + effects](../../adrs/0007-intent-centric-state-and-effects.md)
  — all app-facing Intent in one store under a single write path; this folds the
  app-level UI Intent that the settings migration didn't.
- [`intent.md`](../../superpowers/conventions/intent.md) — the Intent / derived /
  resource boundary (splash visibility = Intent; `blocked`/`error` = derived;
  persistence = effect); the "is it a shared single source of truth?" scope test.
- [`2026-06-19-engine-handles-to-reconcile-sagas-design.md`](./2026-06-19-engine-handles-to-reconcile-sagas-design.md)
  — the parallel fold; the persistence effect may reuse its saga seam but does not
  depend on it.
</content>
