# React store Containers (design)

> **Status:** approved design, awaiting implementation plan.
> **Why this exists:** `App.tsx` is the single radial subscriber to the Redux
> store — ~25 `useAppSelector` calls + ~24 dispatches + 8 engine-handle reaches,
> all funnelled down to presentational children as props (SettingsPanel alone
> takes ~40 props). Any one selector firing re-renders App and cascades through
> the entire HUD, and the wiring is concentrated in one ~550-line file. This spec
> introduces **Containers** — a pattern borrowed from the reference repo
> (`~/Development/js/repperjs/packages/motif-segmentation`) — that push store
> subscriptions DOWN to each component boundary, so a store change re-renders only
> that subtree and store wiring lives next to what consumes it.

## Scope

Introduce a Container layer that owns store reach at component boundaries, in
service of **re-render localization** (the push-down shape, not a single top
`AppContainer`):

1. **Convention.** `<Name>Container` renders `<Name>` (presentational, minus
   "Container"). Containers live in a dedicated `src/components/containers/` dir.
   Container owns all store reach; presentational component imports nothing from
   `store/` or `state/`.
2. **Chrome.** `AutoRotateToggleContainer` as the pattern-setter (one
   self-contained store reach).
3. **DebugPanel.** `DebugPanelContainer` owns the debug store reach and absorbs
   `RenderTogglesSection`'s lone rogue `dispatch`.
4. **SettingsPanel decomposition.** `SettingsPanel` becomes a presentational
   shell; each thematic section becomes its own container so a slider drag
   re-renders only its section.
5. **App cleanup.** App sheds ~21 selectors, keeping only genuinely app-level
   subscriptions.

**Out of scope (do not scope-creep):**

- **EngineContext.** Engine-driven state (`sourceCounts`, `structureCounts`,
  selection) and engine-handle actions (`focusOn`, `selection.clear`,
  `resetCamera`) keep flowing as props from App for now. A React context that
  lets containers read engine state directly is a clean follow-up, deliberately
  deferred. These values are low-frequency (a catalog *landing*, not a slider
  drag), so prop-threading them does not undermine the re-render win.
- **Selector shape changes.** Existing `src/state/*/selectors.ts` are reused
  verbatim — plain arrows for primitives, `createSelector` for derived. We do
  NOT adopt repperjs's "createSelector everything" (skymap's primitive-selector
  docblock explicitly rejects it as a memo layer that buys nothing).
- **Store shape / slices / engine.** No Redux state shape change, no engine
  change, no behaviour change. Purely structural.
- **Moving `useStructureMemberCount` into a container.** App keeps it (and its
  `selectVisibleSourceMask` subscription) for now; an InfoCard container is a
  later step.

---

## 1. The convention

### Naming and pairing

A container is named `<Name>Container` and renders a `<Name>` presentational
component — the name minus the `Container` suffix. This makes the pairing
trivially scannable: `GalaxiesSectionContainer` → `GalaxiesSection`. The one
licensed divergence: when a single reusable presentational component is driven by
more than one container, the names won't line up — that's fine, and expected.

This is the reference repo's idiom (`CutoutListItemContainer` → `CutoutListItem`)
adopted unchanged.

### Location — the one deliberate divergence from repperjs

repperjs places containers in `src/state/containers/`. skymap **cannot**: its
`src/state/` is framework-agnostic by contract (the `store/hooks.ts` docblock
states react-redux may be imported only in the store seam and in components,
never in `src/state/`). Containers call `useAppSelector` / `useAppDispatch`, so
they live under components, in a dedicated `src/components/containers/` dir —
the react-redux-respecting analog of repperjs's location, and a central index of
every store boundary in the app.

### The split

- **Container** owns *all* store reach:
  - reads via `useAppSelector(selectX)` using the existing
    `src/state/*/selectors.ts`;
  - handlers via `const dispatch = useAppDispatch()` then
    `useCallback((…) => dispatch(setX(…)), [dispatch])`. Because
    `useAppDispatch()` returns the invariant `store.dispatch`, the `[dispatch]`
    dep is stable for the component's lifetime, giving stable handler identity
    for memoized presentational children.
  - the three view-projections currently in App (`volumeFields`,
    `markerCategoryVisibility`, `labelCategoryVisibility`) move into their owning
    container as a `useMemo` keyed on the stable item-record ref — same pattern,
    new home.
- **Presentational component** imports nothing from `store/` or `state/`; it is a
  pure function of props + transient local UI state (e.g. `CollapsibleSection`'s
  open/closed). It is testable with plain props, no Provider.

### Contract sketch

```tsx
// src/components/containers/AutoRotateToggleContainer.tsx
import { memo, useCallback } from 'react';

function AutoRotateToggleContainer({ hidden }: { hidden: boolean }) {
  const autoRotate = useAppSelector(selectAutoRotate);
  const dispatch = useAppDispatch();
  const onToggle = useCallback(() => dispatch(setAutoRotate(!autoRotate)), [dispatch, autoRotate]);
  return <AutoRotateToggle playing={autoRotate} onToggle={onToggle} hidden={hidden} />;
}

export default memo(AutoRotateToggleContainer);
```

The memo idiom is uniform: define `function ComponentName(...)`, then
`import { memo } from 'react'` and `export default memo(ComponentName)` — both for
containers and for presentational components that warrant it. Same default-export
shape skymap components already use, with `memo()` applied at the export.

Note `hidden` is passed in: it derives from `paletteOpen || splashVisible`, which
is App-layout state (see §4), so it is NOT the container's to subscribe to.

---

## 2. Container inventory

### Chrome (self-contained)

- **`AutoRotateToggleContainer` → `AutoRotateToggle`** — owns `selectAutoRotate`
  + `setAutoRotate`. `hidden` stays an App prop.

The other top-bar items (`SearchTrigger`, `HomeButton`, `AboutPill`) are NOT
containerized: their only reactive input is `paletteOpen` / `splashVisible`
(app-layout state App owns) and their actions are engine-handle calls
(`focusOnHome`) or App-owned dispatches (`setPaletteOpen`). No private slice to
push down.

### DebugPanel

- **`DebugPanelContainer` → `DebugPanel`** — owns `selectShowPickBuffer`,
  `selectShowDiskRadiusRing`, `selectDisabledPasses`, `selectHighlightFallback`,
  `selectRealOnly`, `selectFlow` + their setters and `setPassDisabled`. Engine
  bits (`assetSlots`, `timingService`, `passNames`) arrive as props from App,
  which still owns the `debugPanelOpen && handleRef.current` mount gate.
  `RenderTogglesSection`'s direct `useAppDispatch` is removed — the container
  passes an `onTogglePass` handler down, eliminating the one leaf-level store
  reach in the codebase.

### SettingsPanel — per-section decomposition (the high-value cut)

`SettingsPanel` becomes a **presentational shell** with ZERO store reach:

```tsx
// presentational — composes containers, owns layout + section order only
<Panel title="Settings" headerExtra={<TierChipContainer />} defaultOpen={defaultOpen}>
  <GalaxiesSectionContainer sourceCounts={sourceCounts} />
  <CosmicWebSectionContainer />
  <FlowSectionContainer />
  <StructuresSectionContainer structureCounts={structureCounts} />
  <LabelsSectionContainer />
  <DisplaySectionContainer />
  <PanelDivider />
  <Button onClick={onResetCamera}>Reset camera</Button>
</Panel>
```

The current ~40-prop interface and every `show*` opt-in gate **dissolve**: under
the Provider each container always has its slice, so sections render
unconditionally with required props (the gates existed only because props were
optional for partial test wirings — containers test against a real store
instead).

Section containers and their store reach:

| Container → presentational | Store reach | Engine prop | Owns |
| --- | --- | --- | --- |
| `TierChipContainer` → `TierChip` | `selectTier`, `requestTier` | — | header chip |
| `GalaxiesSectionContainer` → `GalaxiesSection` | visibleSourceMask, pointSize, depthFade, biasMode, absMagLimit + setters | `sourceCounts` | tri-state galaxies master |
| `CosmicWebSectionContainer` → `CosmicWebSection` | volumesEnabled, volumeFieldItems (→`useMemo`), filamentsEnabled, filamentIntensity + setters | — | Style-picker batching, volumes-field projection |
| `FlowSectionContainer` → `FlowSection` | `selectFlow` + `setFlow` | — | — |
| `StructuresSectionContainer` → `StructuresSection` | structureItems (→marker `useMemo`) + `setStructureItemEnabled` | `structureCounts` | tri-state structures master |
| `LabelsSectionContainer` → `LabelsSection` | structureItems + galaxyCatalogItems + milkyWayLabelEnabled (→label `useMemo`) + 3 label setters | — | tri-state labels master, 3-way label-home dispatch |
| `DisplaySectionContainer` → `DisplaySection` | `selectToneMapCurve` + `setToneMapCurve` | — | — |

Each section's master-toggle tri-state derivation and any batching logic
(cosmic-web Style picker, the 3-way label-category dispatch) travels INTO its
section — it is section-local logic that has no reason to sit in a shared parent.

`selectFlow` ends up with two independent subscribers (`FlowSectionContainer` and
`DebugPanelContainer`). That is correct: both display flow state, and each
re-renders only its own subtree on a flow change.

---

## 3. What App keeps

App loses ~21 of its 25 selectors and the bulk of its dispatches. It retains:

- `useEngine` (canvas, `handleRef`, engine-driven state slices) and `useSplash`.
- **App-layout-only** subscriptions: `selectPaletteOpen`, `selectUiHidden`,
  `selectDebugPanelOpen`. These gate the `uiStack` wrapper classes and the chrome
  `hidden` props — they are read by App's *own* JSX, so they are genuinely App's
  to own, not pushable down.
- `selectVisibleSourceMask` — kept for `useStructureMemberCount` (deferred to a
  future InfoCard container). `GalaxiesSectionContainer` subscribes
  independently; two subscribers is fine.
- Threading low-frequency engine state (`sourceCounts`, `structureCounts`,
  `selected`, `scale`, `status`, `loadProgress`) and handle callbacks down as
  props — removed later by EngineContext.

App's render reduces to layout + mounting containers; the dense settings-wiring
block (App.tsx lines ~360–530) disappears into the section containers.

---

## 4. Re-render outcome

| Interaction | Today | After |
| --- | --- | --- |
| point-size slider drag | App → entire HUD | `GalaxiesSection` only |
| label category toggle | App → entire HUD | `LabelsSection` only |
| debug checkbox | App → entire HUD | `DebugPanel` only |
| auto-rotate toggle | App → entire HUD | `AutoRotateToggle` only |
| tier swap | App → entire HUD | `TierChip` (+ engine-driven re-render on landing) |

App itself re-renders only on `paletteOpen` / `uiHidden` / `debugPanelOpen` /
splash / engine-state changes — none of them per-interaction with a setting.

But the table above is only true with §5 — `React.memo` is the mechanism that
makes the localization real, not optional polish.

---

## 5. Memoization — load-bearing, not polish

A container re-renders in two situations:

- **(a) its own `useAppSelector` value changed** — the re-render we WANT;
- **(b) its parent re-rendered for an unrelated reason** — App re-rendering on a
  `paletteOpen` change cascades into every container it renders.

`React.memo` is what cuts (b), and without it the §4 table is false (an
auto-rotate toggle would still re-render every section container via the App
cascade). The rules:

The idiom is uniform (see §1 sketch): `import { memo } from 'react'`, define
`function ComponentName(...)`, `export default memo(ComponentName)`.

- **Containers are `React.memo` by default.** A memo'd container with no props
  (or referentially-stable props) does NOT run its body when App / the
  SettingsPanel shell re-renders for unrelated reasons — yet its `useAppSelector`
  subscription STILL fires on its own slice change (memo gates prop-driven
  re-renders from the parent; it never gates store subscriptions). Net: the
  container re-renders on exactly its slice and nothing else. This is the primary
  lever that delivers §4.
- **Presentational components are `React.memo` where non-trivial.** Backstop for
  the case where a container re-renders but emits referentially-equal props
  (e.g. a sibling selector value changed). The `useCallback((…) => dispatch(…),
  [dispatch])` handler wrapping is what makes these memos actually bail — a fresh
  inline arrow each render would defeat them. skymap already memos
  `SearchTrigger` / `AutoRotateToggle` / `HomeButton` / `NavigationPanel`; this
  extends the same discipline to the new presentational components.
- **Prerequisite — stable prop identity from App.** For a container's memo to
  bite, the props App threads into it must be referentially stable across App's
  unrelated re-renders: `sourceCounts` / `structureCounts` are `useEngine` state
  (stable between catalog landings, by `setState` identity); engine-handle
  callbacks (`onResetCamera`, `focusOn`) must be `useCallback`-wrapped in App
  (App already does this for its memoized chrome). The `hidden` prop on
  `AutoRotateToggleContainer` is a plain boolean — value-equal across re-renders
  when unchanged, so shallow compare bails correctly.

Apply memo deliberately, not as a blanket: a container or component that takes
frequently-changing props gains nothing from memo and pays the compare cost. The
default-on guidance above holds because these containers take no props or stable
ones — verify that assumption per container during implementation rather than
wrapping reflexively.

---

## 6. Testing

- **Presentational components** test with plain props and no Provider — pure
  functions of input. The existing SettingsPanel/DebugPanel tests largely become
  presentational-component tests (props in, callbacks asserted).
- **Containers** test against a real store via `createAppStore(...)` +
  `<Provider>` (the pattern the repo already uses for store-backed tests):
  render the container, assert it reads seeded state, fire a control, assert the
  store changed. No mocking of `react-redux`.

---

## 7. Rollout sequencing

Each step is independently shippable and keeps the suite green:

1. **`AutoRotateToggleContainer`** — establishes the dir, the convention, and a
   short convention note (e.g. a `src/components/containers/README.md` or
   docblock). Smallest possible first fold.
2. **`DebugPanelContainer`** — moderate reach; absorbs `RenderTogglesSection`'s
   rogue dispatch.
3. **SettingsPanel decomposition** — the section containers + the presentational
   shell; the largest step, drops App's biggest prop block.
4. **App cleanup** — remove the now-dead selectors/dispatches/imports; confirm
   App's retained subscriptions are exactly the app-layout set.

## 8. Relationship to in-flight work

Purely structural and component-scoped, so it composes cleanly with the
concurrent `src/state/`-side efforts: the settings store zustand→RTK migration
and the camera intent slice both touch slices/selectors, not components — these
containers consume whatever selectors exist. No coordination beyond rebasing.
