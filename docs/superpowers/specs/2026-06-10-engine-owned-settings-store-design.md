# Engine-owned settings store — design

> **Status:** approved design (zustand vanilla, engine-owned), awaiting plan.
> **Supersedes** `docs/superpowers/specs/2026-06-10-react-settings-mirror-shape-design.md`
> — that follow-up only *reshaped* the React mirror; this removes the mirror
> entirely, so the reshape is moot. Sequenced **before** the visibility
> snapshot/restore seam (`2026-06-10-visibility-seam-reconciled-design.md`), which
> then builds on the store.

## Why

`state.settings` is the authoritative home for every render setting; the engine
reads it each frame and its handle setters write it. React cannot observe a
mutable object, so today it keeps a **second copy** in `useEngineSettings` (~24
`useState` cells) kept in sync by an **echo protocol**: the engine fires a typed
callback on every change, React `setState`s. That mirror is the braid — value in
two places, kept consistent by ceremony. Its full cost:

- **~13 settings echo callbacks** in `EngineCallbacks` (`surveys`×5, `tonemap`×2,
  `camera.onAutoRotate`, `sources.onMaskChange`, `bias`×2, `thumbnails`,
  `milkyWay`, `debug`×2, `labels`×2, `volumes.onFieldsChanged`);
- the **`deriveMarker/LabelCategoryVisibility`** helpers (exist only to reshape
  engine→echo);
- **`seedSettingsCallbacks`** (fires every echo once at init);
- **defaults duplicated** — `data/defaults.ts` seeds the engine *and* the React
  cells;
- a tell-tale **asymmetry**: some values echo, others are "App-owned optimistic"
  (`filaments`, `volumes` master, `flow`, spaceMouse sensitivity), one is hybrid
  (`exposure`). The protocol isn't even applied uniformly — the
  asymmetry-as-decomplection-signal.

The single source of truth already exists (`state.settings`). The fix is to stop
copying it and let React **observe** it.

## The boundary this draws: settings are state, events are events

Not all of `EngineCallbacks` is mirror. `lifecycle.onStatusChange`/`onFpsChange`,
`selection.onSelectChange`/`onHoverChange`, `camera.onFocusChange`/`onCameraChange`,
`sources.onCatalogReady`/`onLoadProgress`/`onStructureCountsChange`,
`filaments.onReady`, `input.spaceMouse.onConnectedChange` are genuine **push
events** — things that *happen* (a status advanced, an entity was hovered, a
catalog landed, a puck connected), not settings that are *mirrored*. Those
**stay callbacks**. The unification targets exactly the settings echoes. The clean
rule afterward: **settings → one shared store; events → callbacks.**

## Architecture: an engine-owned zustand store

The engine **fully owns** a `zustand/vanilla` store holding the whole
`EngineSettingsState`. It is created (and seeded from `data/defaults.ts`)
synchronously at the top of `createEngine`, before GPU init, and exposed on the
engine handle. The engine reads it every frame and writes it through actions;
React subscribes to the same store with selectors.

```
                       engine-owned zustand store (whole EngineSettingsState)
  reducers   pure (state, payload) => state         ← the testable core (copy-on-write)
  actions    set((s) => reducer(s, payload))        ← thin; the handle setters ARE these
  selectors  pure (state) => value                  ← shared by engine frame loop AND React

  engine (frame loop)   reads store.getState() once/frame, via selectors
  React (components)     useStore(handle.settingsStore, selector)
```

### Import boundary (keeps the core framework-agnostic)

- **Engine** (`services/`) imports only `createStore` from **`zustand/vanilla`** —
  no React.
- **React-land** (`components/`, `hooks/`, `App.tsx`) imports **`useStore` from
  `zustand`** to consume the engine-owned store with selector-based
  subscriptions. `useStore` is built on `useSyncExternalStore`, so a component
  that prefers the raw primitive can use `store.subscribe` / `store.getState`
  directly.

### Reducers / actions / selectors

- **Reducers** are pure `(state, payload) => EngineSettingsState`, copy-on-write at
  the touched cluster (`{ ...state, surveys: { ...state.surveys, sizePx } }`).
  They are unit-testable with zero engine/GPU — feed a state + payload, assert the
  next state. Copy-on-write is what gives `useStore`/`useSyncExternalStore` a
  stable changed-identity to diff, and it matches the project's immutability lean.
- **Actions** are the store's methods: `set((s) => reducer(s, payload))`. They are
  thin. The engine's existing handle setters (`handle.surveys.setSize`,
  `handle.structures.setItemEnabled`, …) become (or thinly wrap) these actions —
  one write path, no echo.
- **Selectors** are pure `(state) => T`, colocated and shared. React uses
  `useStore(store, selectSurveySize)`; the engine frame loop uses
  `selectSurveySize(store.getState())` (or reads the snapshot fields directly).

### The handle surface

`createEngine` returns a handle exposing the store so React can subscribe:

```ts
handle.settingsStore: StoreApi<EngineSettingsState>   // getState / setState / subscribe
// plus the action methods, surfaced through the existing sub-handle namespaces
// (handle.surveys.*, handle.structures.*, …) so call sites barely change.
```

### Hot-path reads

Unchanged in cost: the frame loop reads a plain object
(`store.getState()` returns the current state ref; copy-on-write means it is a new
ref only after a user-driven change, which is rare). Reads stay
`settings.surveys.sizePx`-style property access.

### Bootstrap / first paint

The store is constructed and seeded from `data/defaults.ts` synchronously in
`createEngine`, so it carries correct values from frame zero. React renders from
`data/defaults.ts` until the engine handle is available (today's pattern), then
switches to `useStore` — the values match because both seed from the *same*
defaults module, so there is no first-paint flash. `data/defaults.ts` becomes the
**single** seed for both sides (the duplicated React seeding deletes).

## What deletes

- `useEngineSettings`'s ~24 mirror `useState` cells (replaced by `useStore`
  selectors; the hook shrinks to thin selector wrappers or dissolves).
- The ~13 **settings** echo callbacks in `EngineCallbacks` + their fire sites.
- `deriveMarkerCategoryVisibility` / `deriveLabelCategoryVisibility` and their tests.
- `seedSettingsCallbacks`' settings portion.
- The App-owned-optimistic exceptions (`filaments`, `volumes` master, `flow`,
  sensitivity) — they become uniform store reads, no special case.
- The duplicated React-side defaults seeding.

## What stays

- The **event** callbacks (lifecycle / selection / camera focus / load progress /
  catalog ready / structure counts / filaments-ready / spaceMouse-connected) — and
  the `useEngineSettings` cells they feed (`spaceMouseConnected`, `filamentCounts`)
  remain React state driven by those callbacks; they are not settings.
- Values that are *settings* but live **outside** `EngineSettingsState` today
  (`spaceMouseSensitivity` — owned by the input subsystem, not the settings bag)
  stay where they are for now; folding them into the store is a separate, later
  call, not in this scope.
- All engine internals: GPU buffers, the fade registry, demand, selection,
  subsystems — unchanged. Only the *settings* home moves into the store.
- `EngineSettingsState`'s shape (the #295 cluster shape) — the store holds it
  verbatim.

## How the visibility seam folds in (next effort)

After the store lands, the seam
(`2026-06-10-visibility-seam-reconciled-design.md`) simplifies:
`captureSettings` = `structuredClone(store.getState()`-subset`)`; `restoreSettings`
and `applyEffect` become **store actions** (run a copy-on-write reducer that
replaces the settings clusters) that then call `syncVisibilityFades`; the seam's
`cb` echo parameter disappears entirely (React observes the store). The
`VISIBILITY_LAYERS` registry + `syncVisibilityFades` (intent→fade bridge) are
unaffected.

## Decisions baked in

- **zustand vanilla, engine-owned**, created+seeded at construction; React consumes
  via `useStore` selectors. Engine imports `zustand/vanilla`; React imports `zustand`.
- **Whole `EngineSettingsState`** in the store — every settings echo dies, not just
  visibility.
- **Reducers pure + copy-on-write**; actions thin; selectors shared. Reducers and
  selectors are the unit-test surface.
- **Events stay callbacks** — settings/events boundary is the organizing rule.
- **`data/defaults.ts` is the single seed** for both engine and React.

## Scope guards (non-goals)

- **No** behaviour change — the same settings, same clamps, same render output.
  This is a state-home move, observable behaviour preserved.
- **No** moving engine internals (GPU/fades/demand/selection) into the store — it
  holds settings only.
- **No** `sources.tier` reorganisation, **no** mask→registry migration (out of scope
  here as in the seam spec).
- **No** Redux-style action *objects* / dispatch ceremony — actions are named store
  methods delegating to pure reducers (the testability of reducers without the
  boilerplate).

## Testing strategy

- **Reducers**: pure unit tests — `(state, payload) => nextState` for every action;
  assert copy-on-write (touched cluster is a new ref, siblings are not).
- **Selectors**: pure unit tests — `selector(state)` returns the expected slice.
- **Store wiring**: an action notifies subscribers; `getState` reflects the write;
  a second identical write is a no-op (no spurious notify) where the existing
  setters were no-op-guarded (`setSourceVisibleImpl`'s equality guard).
- **React**: a `useStore` selector re-renders only when its slice changes (the
  selector-equality win); seeded value matches `defaults.ts` on first paint.
- **Behaviour-preservation**: existing engine + panel tests stay green; the fade
  tests (`setSourceVisibleFade`, `setCategoryVisibleFade`, `flowFieldsHandle`) are
  unaffected (the store change is upstream of the fade dispatch).

## Phasing (green vertical slices, per the #295 precedent)

Each slice migrates one settings cluster end-to-end and stays green at every
commit — NOT a global expand-contract with a red window:

1. **Store scaffold** — `createStore` in `createEngine`, seeded from defaults;
   reducer/selector/action infra + the `handle.settingsStore` surface. No consumer
   migrated yet (store runs alongside the mirror).
2. **Migrate cluster-by-cluster** (surveys → tonemap → camera → bias → thumbnails →
   milkyWay → debug → filaments → volumes → flow → structures/labels): for each,
   move the source of truth to the store, point the engine reads + the handle
   setter at the store, switch the React consumer to `useStore`, and **delete that
   cluster's echo callback + mirror cell** within the slice. Green each commit.
3. **Delete the husk** — once the last consumer migrates: remove
   `seedSettingsCallbacks`' settings portion, the derive helpers, the emptied
   `useEngineSettings` cells, and the now-dead `EngineCallbacks` settings sub-bags.
4. **Radar pass** on the full diff (entanglement-radar): confirm one home, no new
   mirror, events-stay-callbacks boundary clean.

One PR off `main` (branch `settings-snapshot-seam` continues, or a fresh
`engine-settings-store`), executed via `subagent-driven-development`.
