# React store Containers (plan)

> **For agentic workers.** Execute this plan via the
> **REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`** — a fresh
> subagent per task, with the spec + per-task `Interfaces` block as its brief,
> plus the spec/quality reviews that workflow gates on. Each task is a TDD loop:
> write the failing test → run it and confirm it fails → minimal implementation
> → confirm it passes → commit.

**Goal.** Decompose `App.tsx`, the single radial subscriber to the Redux store,
into a layer of **Containers** that own store reach at each component boundary.
Push `useAppSelector` / `useAppDispatch` DOWN to the smallest subtree that
consumes them so a store change re-renders only that subtree, and the store
wiring lives next to what it drives. Purely structural: no Redux state shape
change, no engine change, no behaviour change.

**Architecture.** A `<Name>Container` (in a new `src/components/containers/`
dir) owns all store reach and renders a presentational `<Name>` that imports
nothing from `store/` or `state/`. Containers are `React.memo` by default;
presentational components are `React.memo` where non-trivial. Handlers are
`useCallback((…) => dispatch(setX(…)), [dispatch])` for stable identity. The
three view-projections currently in App (`volumeFields`,
`markerCategoryVisibility`, `labelCategoryVisibility`) move into their owning
container as `useMemo` keyed on the stable item-record ref. Engine-driven state
(`sourceCounts`, `structureCounts`) and engine-handle callbacks
(`onResetCamera`) keep flowing as props from App (an EngineContext is a
deliberately-deferred follow-up). SettingsPanel becomes a presentational shell
composing seven section containers; App sheds ~21 selectors, keeping only the
app-layout subscriptions it reads in its own JSX.

**Tech Stack.** React 19 + `react-redux` + Redux Toolkit; TS; Vitest +
`@testing-library/react` (jsdom). Store factory `createAppStore()`; typed hooks
`useAppSelector` / `useAppDispatch` in `src/store/hooks.ts`.

**Source of truth.** The approved design
[`2026-06-19-react-store-containers-design.md`](../specs/2026-06-19-react-store-containers-design.md).
Read it fully before starting; this plan is its rollout (§7) broken into TDD
tasks. The spec's §1 (convention), §5 (memoization), §6 (testing) are the
binding contracts every task must hit.

## Global Constraints

- **TS:** `export type X = …`, never `interface`. One type per file under
  `src/@types/` (filename = exported type). Single-function files in `utils/`
  named for the function. No barrels for components — import each component
  directly from its `.tsx`. Deep relative imports. Use `Vec2`/`Vec3` aliases,
  never raw tuples (not expected to come up here).
- **Component conventions (the `create-component` skill):** every component
  lives in its own file; presentational components keep their own folder
  `src/components/<Name>/<Name>.tsx` + `<Name>.module.css`. Containers are the
  one deliberate divergence — they all live flat under
  `src/components/containers/` (see §1 of the spec for why: a central index of
  every store boundary, and `src/state/` is framework-agnostic so containers
  can't live there). A container has no CSS module of its own; styling stays on
  the presentational pair.
- **The memo idiom is uniform and load-bearing** (spec §5): `import { memo }
  from 'react'`; define `function ComponentName(...) { … }`; `export default
  memo(ComponentName)`. Containers memo'd by default. Presentational components
  memo'd where non-trivial. Apply memo deliberately — verify per container that
  its props are absent or referentially stable before relying on the memo bite;
  do not wrap a component that takes frequently-changing props.
- **Container owns ALL store reach.** The presentational component it renders
  imports nothing from `store/` or `state/` — it is a pure function of props +
  transient local UI state. This is verifiable by grep: no `from '../../store`
  / `from '../../state` import in a presentational `.tsx`.
- **Reuse existing selectors verbatim.** Import the existing
  `src/state/*/selectors.ts` functions; do NOT rewrite any as `createSelector`.
  The projection helpers (`projectVolumeFieldRows`,
  `projectMarkerCategoryVisibility`, `projectLabelCategoryVisibility`) are
  reused verbatim too — only their *call site* moves into a container.
- **Didactic comments** (spec/CLAUDE.md style): each new container gets a short
  module header explaining *what store reach it owns* and *why this boundary*
  (the re-render-localization rationale), matching the multi-paragraph headers
  already on `App.tsx` / `SettingsPanel.tsx`. Timeless + terse — no dates, no PR
  refs, no "pre-X" history notes. Do NOT write the full header out in this plan;
  it is specified, the implementer writes it.
- **Tests** (spec §6): Vitest. Presentational components → plain-props tests, no
  Provider. Containers → render under `<Provider store={createAppStore().store}>`
  and assert (a) the container reads seeded state and (b) firing a control
  mutates the store (`store.getState()` via the matching selector). No mocking
  of `react-redux`. Mirror the existing store-backed component test verbatim in
  shape:
  [`tests/components/DebugPanel/RenderTogglesSection.test.ts`](../../../tests/components/DebugPanel/RenderTogglesSection.test.ts)
  (`.test.ts`, `createElement` not JSX, `makeWrapper(store)` helper). Tests
  mirror `src/` under `tests/` — container tests live in
  `tests/components/containers/`. Typed `vi.fn<() => void>()` for any callback
  spy (bare `vi.fn()` fails tsc against typed props).
- **The suite stays green at every task** (currently 590+ tests / 76 files).
  Each numbered task is independently shippable — the spec's rollout order
  guarantees no red step. After SettingsPanel is decomposed (Task 4) the old
  `SettingsPanel` prop interface is replaced wholesale, so the old
  SettingsPanel.tsx test (if any) is rewritten as a presentational-shell test in
  the same task — never left dangling red.
- **Branch + PR, squash-merge.** Commit with the user's git identity
  (Co-Authored-By trailer only, never `--author`). Stage specific paths, never
  `git add -A`. Prettier only the files you touched. (The implementer commits;
  the main thread runs `npm test` / `npm run typecheck`.)

## Naming contracts (spelled identically everywhere)

Every container is named `<Name>Container` and renders `<Name>` (name minus the
`Container` suffix). The presentational pair for the section containers are NEW
components extracted from `SettingsPanel.tsx`'s inline JSX.

| Container | Renders (presentational) | Home (container / presentational) |
| --- | --- | --- |
| `AutoRotateToggleContainer` | `AutoRotateToggle` (existing) | `containers/` / `AutoRotateToggle/` |
| `DebugPanelContainer` | `DebugPanel` (existing) | `containers/` / `DebugPanel/` |
| `TierChipContainer` | `TierChip` (existing) | `containers/` / `SettingsPanel/` |
| `GalaxiesSectionContainer` | `GalaxiesSection` (new) | `containers/` / `SettingsPanel/` |
| `CosmicWebSectionContainer` | `CosmicWebSection` (new) | `containers/` / `SettingsPanel/` |
| `FlowSectionContainer` | `FlowSection` (new) | `containers/` / `SettingsPanel/` |
| `StructuresSectionContainer` | `StructuresSection` (new) | `containers/` / `SettingsPanel/` |
| `LabelsSectionContainer` | `LabelsSection` (new) | `containers/` / `SettingsPanel/` |
| `DisplaySectionContainer` | `DisplaySection` (new) | `containers/` / `SettingsPanel/` |
| (none — shell) | `SettingsPanel` (rewritten) | — / `SettingsPanel/` |

Existing selectors and actions referenced below (spelled exactly):

- **settings selectors** (`src/state/settings/selectors.ts`):
  `selectGalaxyCatalogSize`, `selectDepthFade`, `selectHighlightFallback`,
  `selectRealOnly`, `selectVisibleSourceMask`, `selectToneMapCurve`,
  `selectAutoRotate`, `selectBiasMode`, `selectAbsMagLimit`,
  `selectShowPickBuffer`, `selectShowDiskRadiusRing`, `selectDisabledPasses`,
  `selectFilamentsEnabled`, `selectFilamentIntensity`, `selectVolumesEnabled`,
  `selectVolumeFieldItems`, `selectFlow`, `selectStructureItems`,
  `selectGalaxyCatalogItems`, `selectMilkyWayLabelEnabled`.
- **settings actions** (`src/state/settings/settingsSlice.ts`):
  `setGalaxyCatalogSize`, `setDepthFade`, `setHighlightFallback`, `setRealOnly`,
  `setFilamentIntensity`, `setAbsMagLimit`, `setToneMapCurve`, `setAutoRotate`,
  `setShowPickBuffer`, `setShowDiskRadiusRing`, `setStructureItemEnabled`,
  `setStructureLabelEnabled`, `setMilkyWayLabelEnabled`,
  `setGalaxyCatalogLabelEnabled`, `setFilamentsEnabled`,
  `setGalaxyCatalogVisible`, `setBiasMode`, `setVolumesEnabled`,
  `writeVolumeField`, `setFlow`, `setPassDisabled`.
- **tier** (`src/state/tier/selectors.ts`, `src/state/tier/requestTier.ts`):
  `selectTier`, `requestTier`.
- **ui** (`src/state/ui/selectors.ts`, `src/state/ui/uiSlice.ts`):
  `selectPaletteOpen`, `selectUiHidden`, `selectDebugPanelOpen`.
- **projections** (`src/state/settings/`): `projectVolumeFieldRows(items)`,
  `projectMarkerCategoryVisibility(structureItems)`,
  `projectLabelCategoryVisibility(structureItems, galaxyCatalogItems,
  milkyWayLabelEnabled)`.
- **id helpers:** `galaxyCatalogIdOf` (`src/utils/galaxyCatalogIdOf.ts`),
  `isStructureId` (`src/data/structure/structureIds.ts`).

---

## Task 1 — `AutoRotateToggleContainer` + establish the dir & convention note

Smallest possible first fold; sets the directory, the memo idiom, and a
convention note future containers point at.

**Files:**
- `src/components/containers/README.md` (new) — one-paragraph convention note.
- `src/components/containers/AutoRotateToggleContainer.tsx` (new).
- `tests/components/containers/AutoRotateToggleContainer.test.ts` (new).
- `src/components/App/App.tsx` (modify) — swap `<AutoRotateToggle …>` for
  `<AutoRotateToggleContainer hidden={paletteOpen || splash.splashVisible} />`;
  drop the now-dead `selectAutoRotate` / `setAutoRotate` reach **only if** no
  other App site uses it (it isn't used elsewhere — remove the
  `const autoRotate = …` line, the `selectAutoRotate` import, and the
  `setAutoRotate` import).

**README.md contract (≤ 1 short paragraph + the rule list):** state that
`src/components/containers/` holds every store-boundary component; the
`<Name>Container` → `<Name>` pairing rule; that containers own all
`useAppSelector` / `useAppDispatch` reach and render presentational pairs that
import nothing from `store/`/`state/`; the uniform `memo()` idiom; and that this
dir is the deliberate skymap analog of repperjs's `src/state/containers/` (which
skymap can't use because `src/state/` is framework-agnostic). Cite spec §1.

**Container contract:**

```tsx
// src/components/containers/AutoRotateToggleContainer.tsx
function AutoRotateToggleContainer({ hidden }: { hidden: boolean }): React.ReactElement
// reads: selectAutoRotate
// dispatches: onToggle = useCallback(() => dispatch(setAutoRotate(!autoRotate)), [dispatch, autoRotate])
// renders: <AutoRotateToggle playing={autoRotate} onToggle={onToggle} hidden={hidden} />
// export default memo(AutoRotateToggleContainer)
```

(See spec §1 contract sketch lines 97–109 — match it.)

- [x] Write `tests/components/containers/AutoRotateToggleContainer.test.ts`
  (store-backed, mirroring `RenderTogglesSection.test.ts`'s `makeWrapper`
  shape):
  - `'reflects autoRotate=false from a seeded store (renders the Play affordance)'`
    — seed a store, render, assert the toggle's `aria-pressed` is `false` /
    aria-label is the "Start camera auto-rotate" string.
  - `'dispatches setAutoRotate(true) when toggled from off'` — render with
    default store (autoRotate off), fire the toggle's click, assert
    `selectAutoRotate(store.getState())` is `true`.
  - `'forwards hidden through to the presentational toggle'` — render with
    `hidden: true`, assert the pill is hidden (its `hidden` styling/attr).
- [x] Run the test, confirm it fails (module not found).
- [x] Write `README.md` + the container against the contract above.
- [x] Update `App.tsx`: import + render `AutoRotateToggleContainer`, remove the
  dead `autoRotate` selector read and the two now-unused imports.
- [x] `npm test -- AutoRotateToggleContainer` → all pass; `npm run typecheck`
  clean.
- [x] Commit.

---

## Task 2 — `DebugPanelContainer` (+ absorb `RenderTogglesSection`'s dispatch)

Moderate reach; eliminates the codebase's one leaf-level store reach.

**Files:**
- `src/components/containers/DebugPanelContainer.tsx` (new).
- `tests/components/containers/DebugPanelContainer.test.ts` (new).
- `src/components/DebugPanel/DebugPanel.tsx` (modify) — add an `onTogglePass`
  prop; pass it down to `RenderTogglesSection`.
- `src/components/DebugPanel/RenderTogglesSection.tsx` (modify) — remove
  `useAppDispatch` + `setPassDisabled` import; accept `onTogglePass(name:
  string)` as a prop and call it from the checkbox `onChange`. The section
  becomes presentational (imports nothing from `store/`/`state/`).
- `tests/components/DebugPanel/RenderTogglesSection.test.ts` (rewrite) — drop
  the Provider; assert `onTogglePass` (a typed `vi.fn`) is called with the pass
  name on click. Keeps the render/checkbox-state assertions as plain-props.
- `src/components/App/App.tsx` (modify) — render `<DebugPanelContainer …/>`
  inside the existing `debugPanelOpen && handleRef.current && (…)` gate, passing
  only engine props (`slots`, `timingService`, `passNames`); remove all the
  debug selector reads + their dispatch arrows from App.

**Engine props stay on App** (low-frequency, not pushable yet): the
`debugPanelOpen && handleRef.current` mount gate stays in App, and App threads
`slots = handleRef.current.assetSlots`, `timingService =
handleRef.current.debug.timingService`, `passNames =
handleRef.current.debug.passOverrides.allNames` into the container as props.

**DebugPanel prop change (before/after, the changing line only):**

```tsx
// RenderTogglesSection: <RenderTogglesSection passNames={…} disabledPasses={…} />
//                    →  <RenderTogglesSection passNames={…} disabledPasses={…} onTogglePass={onTogglePass} />
```

**Container contract:**

```tsx
// src/components/containers/DebugPanelContainer.tsx
type DebugPanelContainerProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService;
  passNames: readonly string[];
};
function DebugPanelContainer(props: DebugPanelContainerProps): React.ReactElement
// reads: selectShowPickBuffer, selectShowDiskRadiusRing, selectDisabledPasses,
//        selectHighlightFallback, selectRealOnly, selectFlow
// dispatches (each useCallback([dispatch])):
//   onShowPickBufferChange → setShowPickBuffer
//   onShowDiskRadiusRingChange → setShowDiskRadiusRing
//   onHighlightFallbackChange → setHighlightFallback
//   onRealOnlyModeChange → setRealOnly
//   onFlowChange → setFlow(patch)
//   onTogglePass → setPassDisabled({ pass, disabled: disabledPasses[pass] !== true })
//     (this is the dispatch absorbed from RenderTogglesSection; the
//      disabledPasses dep means the callback is NOT [dispatch]-only — see note)
// renders <DebugPanel … /> with the engine props + reads + handlers + onTogglePass
// export default memo(DebugPanelContainer)
```

**`onTogglePass` dep note:** its body reads `disabledPasses[pass]`, so its
`useCallback` deps are `[dispatch, disabledPasses]` (NOT `[dispatch]`). The
existing `RenderTogglesSection` toggle computes `disabled` the same way
(`disabledPasses[name] !== true`); preserve that semantics exactly so the
rewritten section test still passes. `selectFlow` having a second subscriber
(`FlowSectionContainer`, Task 6) is expected and correct (spec §2).

- [x] Write `tests/components/containers/DebugPanelContainer.test.ts`
  (store-backed): seed a store, render with stub engine props (a `new Map()` for
  `slots`, a minimal `timingService` stub, a `passNames` array), then:
  - `'reflects showPickBuffer from the store'` — seed `showPickBuffer: true`,
    assert the "Show pick buffer" checkbox is checked.
  - `'dispatches setShowPickBuffer on checkbox toggle'` — fire it, assert
    `selectShowPickBuffer(store.getState())` flipped.
  - `'dispatches setPassDisabled(true) when a renderer-toggle box is unchecked'`
    — fire a `RenderTogglesSection` box, assert
    `selectDisabledPasses(store.getState())[name]` is `true` (this proves the
    absorbed dispatch path works end-to-end through the container).
  - `'dispatches setRealOnly on the data-quality toggle'` — fire it, assert the
    store changed.
- [x] Write `tests/.../RenderTogglesSection.test.ts` rewrite first as a failing
  presentational test (`onTogglePass` typed spy called with the pass name; no
  Provider). Confirm it fails against current (store-coupled) section.
- [x] Confirm the container test fails (module not found).
- [x] Implement: make `RenderTogglesSection` presentational (prop `onTogglePass`);
  add `onTogglePass` to `DebugPanel` props + pass-through; write the container.
- [x] Update `App.tsx`: render `DebugPanelContainer` in the existing gate;
  remove debug selector reads + dispatch arrows + now-unused imports
  (`selectShowPickBuffer`, `selectShowDiskRadiusRing`, `selectDisabledPasses`,
  `selectHighlightFallback`, `selectRealOnly`, `setShowPickBuffer`,
  `setShowDiskRadiusRing`, `setHighlightFallback`, `setRealOnly`, and the
  `DebugPanel` import → swap for `DebugPanelContainer`). Keep `selectFlow` /
  `setFlow` if still used by SettingsPanel (it is, until Task 6).
- [x] `npm test -- DebugPanel RenderTogglesSection` → all pass; `npm run
  typecheck` clean.
- [x] Commit.

---

## Task 3 — `TierChipContainer`

The first SettingsPanel-section container, and the simplest of them; lands
before the shell rewrite so the shell (Task 9) can compose it.

**Files:**
- `src/components/containers/TierChipContainer.tsx` (new).
- `tests/components/containers/TierChipContainer.test.ts` (new).

(No App edit yet — the chip is still rendered by `SettingsPanel` via
`headerExtra` until Task 9 rewrites the shell. This task purely introduces the
container so Task 9 can drop it in.)

**Container contract:**

```tsx
// src/components/containers/TierChipContainer.tsx
function TierChipContainer(): React.ReactElement
// reads: selectTier
// dispatches: onTierChange = useCallback((tier: Tier) => dispatch(requestTier(tier)), [dispatch])
// renders: <TierChip tier={tier} onTierChange={onTierChange} />
// export default memo(TierChipContainer)
```

`requestTier` is a command (spec §2 / App's tier docblock) — dispatching it lets
the tier saga run the transition; the slice value `selectTier` reads only
updates once the new bins are ready, so the chip tracks committed truth.

- [x] Write `tests/components/containers/TierChipContainer.test.ts`:
  - `'reflects the seeded tier in the select value'` — seed `tier: 'large'`,
    assert the `<select>` value is `large`.
  - `'dispatches requestTier when a new tier is picked'` — fire a `change` to
    `medium`, assert a `tier/requestTier` action reached the store. Because
    `selectTier` only commits after the saga, assert on the **dispatched
    action** rather than `selectTier` — subscribe a tiny spy reducer or assert
    via `store.dispatch` is observed. Simplest: render, fire change, and assert
    `selectTier(store.getState())` is unchanged (saga is async/needs the engine
    runner) while confirming no throw — OR use the documented approach: spy on
    `store.dispatch` by wrapping. **Pick the spy-on-dispatch approach** (wrap
    `store.dispatch` with a `vi.fn` passthrough before rendering) and assert it
    was called with `requestTier('medium')`. Note this in the test docblock.
- [x] Confirm it fails (module not found).
- [x] Implement the container against the contract.
- [x] `npm test -- TierChipContainer` → pass; `npm run typecheck` clean.
- [x] Commit.

---

## Task 4 — Extract presentational `GalaxiesSection` + `GalaxiesSectionContainer`

Begins the SettingsPanel decomposition. Each section task is two artifacts: a
new presentational component extracted from the current SettingsPanel JSX, and
its container. The section is NOT yet wired into the (still-monolithic)
SettingsPanel — it is exercised only by its own tests until Task 9 rewrites the
shell to compose all sections. The monolithic `SettingsPanel.tsx` keeps working
throughout (App still renders it with the full prop block) so the suite stays
green.

**Files:**
- `src/components/SettingsPanel/GalaxiesSection.tsx` (new, presentational) +
  reuse `SettingsPanel.module.css` (no new CSS — `composes`/import the existing
  module; check the `create-component` skill's shared-vocabulary rule).
- `src/components/containers/GalaxiesSectionContainer.tsx` (new).
- `tests/components/SettingsPanel/GalaxiesSection.test.ts` (new, plain-props).
- `tests/components/containers/GalaxiesSectionContainer.test.ts` (new,
  store-backed).

**`GalaxiesSection` presentational contract** (extract from
`SettingsPanel.tsx:511–634` — the Galaxies `CollapsibleSection`, including the
tri-state master derivation `galaxiesMaster` at `SettingsPanel.tsx:359–382`,
the Galaxy-catalogs subsection, and the Advanced block with point-size, depth
fade, and bias controls):

```tsx
type GalaxiesSectionProps = {
  visibleSourceMask: number;
  onToggleSource: (source: SourceType, visible: boolean) => void;
  sourceCounts?: Partial<Record<SourceType, number>>;
  pointSize: number;
  onPointSizeChange: (v: number) => void;
  depthFadeEnabled: boolean;
  onDepthFadeEnabledChange: (enabled: boolean) => void;
  biasMode: BiasModeT;
  onBiasModeChange: (mode: BiasModeT) => void;
  absMagLimit: number;
  onAbsMagLimitChange: (absMag: number) => void;
};
```

The `show*` opt-in gates **dissolve** (spec §2): under the Provider the
container always has its slice, so props are required (no `| undefined` except
`sourceCounts`, which is genuinely engine-absent before a catalog lands). The
tri-state master logic (the `galaxiesMaster` IIFE) moves INTO this component —
it is section-local. `export default memo(GalaxiesSection)`.

**`GalaxiesSectionContainer` contract:**

```tsx
type GalaxiesSectionContainerProps = { sourceCounts?: Partial<Record<SourceType, number>> };
function GalaxiesSectionContainer({ sourceCounts }): React.ReactElement
// reads: selectVisibleSourceMask, selectGalaxyCatalogSize, selectDepthFade,
//        selectBiasMode, selectAbsMagLimit
// dispatches (useCallback):
//   onToggleSource → setGalaxyCatalogVisible({ id: galaxyCatalogIdOf(source), enabled })
//   onPointSizeChange → setGalaxyCatalogSize
//   onDepthFadeEnabledChange → setDepthFade
//   onBiasModeChange → setBiasMode
//   onAbsMagLimitChange → setAbsMagLimit
// renders <GalaxiesSection … sourceCounts={sourceCounts} />
// export default memo(GalaxiesSectionContainer)
```

- [x] Write `tests/components/SettingsPanel/GalaxiesSection.test.ts`
  (plain-props): assert the master tri-state (`indeterminate` when a subset of
  `TOGGLEABLE_SOURCES` bits are set), that a per-catalog checkbox reflects
  `visibleSourceMask`, that the point-size slider echoes `pointSize`, and that
  toggling/sliding calls the matching typed-`vi.fn` prop with the right args.
- [x] Write `tests/components/containers/GalaxiesSectionContainer.test.ts`
  (store-backed): seed `sizePx`, assert the slider value; fire the slider,
  assert `selectGalaxyCatalogSize(store.getState())` changed; toggle a catalog,
  assert `selectVisibleSourceMask(store.getState())` changed.
- [x] Confirm both fail.
- [x] Implement the presentational section (extracting the JSX + master IIFE),
  then the container.
- [x] `npm test -- GalaxiesSection` → pass; `npm run typecheck` clean.
- [x] Commit.

---

## Task 5 — `CosmicWebSection` + `CosmicWebSectionContainer`

**Files:**
- `src/components/SettingsPanel/CosmicWebSection.tsx` (new) + reuse the module CSS.
- `src/components/containers/CosmicWebSectionContainer.tsx` (new).
- `tests/components/SettingsPanel/CosmicWebSection.test.ts` (new).
- `tests/components/containers/CosmicWebSectionContainer.test.ts` (new).

**`CosmicWebSection` presentational contract** (extract from
`SettingsPanel.tsx:636–742` — the Cosmic web `CollapsibleSection`: the
master-toggle handler `onCosmicWebMasterToggle` at `404–415`, the Style picker
derivation `deriveCosmicWebStyle` + `onSetCosmicWebStyle` at `268–273` /
`417–438`, the filament-intensity slider, and the per-cube `VolumeFieldRow`
list). All of that batching logic is section-local and moves INTO this
component:

```tsx
type CosmicWebSectionProps = {
  volumesEnabled: boolean;
  onVolumesEnabledChange: (enabled: boolean) => void;
  filamentsEnabled: boolean;
  onFilamentsChange: (enabled: boolean) => void;
  filamentIntensity: number;
  onFilamentIntensityChange: (value: number) => void;
  volumeFields: ReadonlyArray<VolumeFieldRowData>;
  onVolumeFieldEnabledChange: (id: VolumeFieldId, enabled: boolean) => void;
  onVolumeFieldIntensityChange: (id: VolumeFieldId, intensity: number) => void;
  onVolumeFieldContrastChange: (id: VolumeFieldId, contrast: number) => void;
  onVolumeFieldDensityScaleChange: (id: VolumeFieldId, value: number) => void;
  onVolumeFieldTrimChange: (id: VolumeFieldId, trim: number) => void;
  onVolumeFieldExposureChange: (id: VolumeFieldId, exposure: number) => void;
  onVolumeFieldPaletteChange: (id: VolumeFieldId, paletteId: ScalarFieldPaletteId) => void;
};
```

`deriveCosmicWebStyle` and the `CosmicWebStyle` type travel into this file (or a
co-located helper — keep them next to their sole consumer). `export default
memo(CosmicWebSection)`.

**`CosmicWebSectionContainer` contract:**

```tsx
function CosmicWebSectionContainer(): React.ReactElement
// reads: selectVolumesEnabled, selectVolumeFieldItems, selectFilamentsEnabled,
//        selectFilamentIntensity
// owns the volume-fields projection (moved from App.tsx:185–190):
//   const volumeFields = useMemo(
//     () => projectVolumeFieldRows(volumeFieldItems).filter((f) => !f.id.startsWith('debug-')),
//     [volumeFieldItems]);
// dispatches (useCallback):
//   onVolumesEnabledChange → setVolumesEnabled
//   onFilamentsChange → setFilamentsEnabled
//   onFilamentIntensityChange → setFilamentIntensity
//   onVolumeField*Change → writeVolumeField({ id, patch: { <key>: value } })
// renders <CosmicWebSection … volumeFields={volumeFields} />
// export default memo(CosmicWebSectionContainer)
```

The `debug-*` field filter and the `[volumeFieldItems]`-keyed `useMemo` move
verbatim — keying on the stable `items` ref is load-bearing (App.tsx:181–190
docblock). `selectFilamentsEnabled` having a second subscriber (it drives both
this section's Style picker and its own filament toggle) is internal to one
container — no cross-container concern.

- [x] Write `tests/components/SettingsPanel/CosmicWebSection.test.ts`
  (plain-props): assert the Style picker label derives correctly from
  `(volumesEnabled, filamentsEnabled)` (`smooth`/`filaments`/`both`/hidden), that
  the master toggle reflects `volumes OR filaments`, that clicking "Both" calls
  both `onVolumesEnabledChange(true)` and `onFilamentsChange(true)`, and that a
  `VolumeFieldRow` intensity change calls `onVolumeFieldIntensityChange`.
- [x] Write `tests/components/containers/CosmicWebSectionContainer.test.ts`
  (store-backed): toggle the master, assert `selectVolumesEnabled` /
  `selectFilamentsEnabled`; assert `debug-*` fields are filtered out of the
  rendered rows (seed a `volumes.items` with a `debug-` field if the initial
  state has one, else assert the projection ran by checking a real field row
  renders).
- [x] Confirm both fail.
- [x] Implement presentational + container.
- [x] `npm test -- CosmicWebSection` → pass; `npm run typecheck` clean.
- [x] Commit.

---

## Task 6 — `FlowSection` + `FlowSectionContainer`

**Files:**
- `src/components/SettingsPanel/FlowSection.tsx` (new) + reuse module CSS.
- `src/components/containers/FlowSectionContainer.tsx` (new).
- `tests/components/SettingsPanel/FlowSection.test.ts` (new).
- `tests/components/containers/FlowSectionContainer.test.ts` (new).

**`FlowSection` presentational contract** (extract from
`SettingsPanel.tsx:744–763` — the Flow `CollapsibleSection` wrapping the
existing `FlowRow`):

```tsx
type FlowSectionProps = {
  flow: FlowSettings;
  onFlowChange: (patch: Partial<FlowSettings>) => void;
};
```

The header toggle reads `flow.enabled` and emits `onFlowChange({ enabled })`;
the body renders `<FlowRow flow={flow} onChange={onFlowChange} />`. `export
default memo(FlowSection)`.

**`FlowSectionContainer` contract:**

```tsx
function FlowSectionContainer(): React.ReactElement
// reads: selectFlow
// dispatches: onFlowChange = useCallback((patch) => dispatch(setFlow(patch)), [dispatch])
// renders <FlowSection flow={flow} onFlowChange={onFlowChange} />
// export default memo(FlowSectionContainer)
```

`selectFlow` now has two independent subscribers (this + `DebugPanelContainer`);
correct per spec §2 — each re-renders only its own subtree on a flow change.

- [x] Write `tests/components/SettingsPanel/FlowSection.test.ts` (plain-props):
  master toggle reflects `flow.enabled`; toggling it calls `onFlowChange({
  enabled: <toggled> })`; a `FlowRow` control change calls `onFlowChange` with
  the patched key.
- [x] Write `tests/components/containers/FlowSectionContainer.test.ts`
  (store-backed): toggle the header, assert `selectFlow(store.getState()).enabled`
  flipped.
- [x] Confirm both fail.
- [x] Implement presentational + container.
- [x] `npm test -- FlowSection` → pass; `npm run typecheck` clean.
- [x] Commit.

---

## Task 7 — `StructuresSection` + `StructuresSectionContainer`

**Files:**
- `src/components/SettingsPanel/StructuresSection.tsx` (new) + reuse module CSS.
- `src/components/containers/StructuresSectionContainer.tsx` (new).
- `tests/components/SettingsPanel/StructuresSection.test.ts` (new).
- `tests/components/containers/StructuresSectionContainer.test.ts` (new).

**`StructuresSection` presentational contract** (extract from
`SettingsPanel.tsx:765–808` — the Structures `CollapsibleSection`, including the
tri-state master `structuresMaster` at `440–460`):

```tsx
type StructuresSectionProps = {
  markerCategoryVisibility: Readonly<Record<StructureId, boolean>>;
  onSetMarkerCategoryVisibility: (category: StructureId, visible: boolean) => void;
  structureCounts?: Partial<Record<StructureId, number>>;
};
```

The `structuresMaster` tri-state IIFE moves INTO this component. `export default
memo(StructuresSection)`.

**`StructuresSectionContainer` contract:**

```tsx
type StructuresSectionContainerProps = { structureCounts?: Partial<Record<StructureId, number>> };
function StructuresSectionContainer({ structureCounts }): React.ReactElement
// reads: selectStructureItems
// owns the marker projection (moved from App.tsx:209–212):
//   const markerCategoryVisibility = useMemo(
//     () => projectMarkerCategoryVisibility(structureItems), [structureItems]);
// dispatches: onSetMarkerCategoryVisibility =
//   useCallback((id, enabled) => dispatch(setStructureItemEnabled({ id, enabled })), [dispatch])
// renders <StructuresSection … markerCategoryVisibility={…} structureCounts={structureCounts} />
// export default memo(StructuresSectionContainer)
```

- [x] Write `tests/components/SettingsPanel/StructuresSection.test.ts`
  (plain-props): master tri-state derived from `STRUCTURE_IDS` membership; a
  per-category checkbox reflects `markerCategoryVisibility[cat]`; toggling calls
  `onSetMarkerCategoryVisibility(cat, …)`; a count renders when present.
- [x] Write `tests/components/containers/StructuresSectionContainer.test.ts`
  (store-backed): toggle a category, assert `selectStructureItems` /
  `selectVisibleSourceMask`-equivalent — assert the structure item's `enabled`
  flipped in the store via `selectStructureItems(store.getState())`.
- [x] Confirm both fail.
- [x] Implement presentational + container.
- [x] `npm test -- StructuresSection` → pass; `npm run typecheck` clean.
- [x] Commit.

---

## Task 8 — `LabelsSection` + `LabelsSectionContainer`

The most-entangled section: a label has three dispatch homes (structure /
milkyWay singleton / galaxy catalog), and its visibility projection takes three
inputs. The 3-way dispatch and the projection both travel into the container.

**Files:**
- `src/components/SettingsPanel/LabelsSection.tsx` (new) + reuse module CSS.
- `src/components/containers/LabelsSectionContainer.tsx` (new).
- `tests/components/SettingsPanel/LabelsSection.test.ts` (new).
- `tests/components/containers/LabelsSectionContainer.test.ts` (new).

**`LabelsSection` presentational contract** (extract from
`SettingsPanel.tsx:810–840` — the Labels `CollapsibleSection`, including the
tri-state master `labelsMaster` at `462–480`):

```tsx
type LabelsSectionProps = {
  labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
  onSetLabelCategoryVisibility: (category: LabelCategory, visible: boolean) => void;
};
```

The `labelsMaster` tri-state IIFE moves INTO this component. `export default
memo(LabelsSection)`.

**`LabelsSectionContainer` contract:**

```tsx
function LabelsSectionContainer(): React.ReactElement
// reads: selectStructureItems, selectGalaxyCatalogItems, selectMilkyWayLabelEnabled
// owns the label projection (moved from App.tsx:213–216):
//   const labelCategoryVisibility = useMemo(
//     () => projectLabelCategoryVisibility(structureItems, galaxyCatalogItems, milkyWayLabelEnabled),
//     [structureItems, galaxyCatalogItems, milkyWayLabelEnabled]);
// owns the 3-way label-home dispatch (moved verbatim from App.tsx:371–386),
//   wrapped useCallback([dispatch]):
//     if (isStructureId(category)) dispatch(setStructureLabelEnabled({ id: category, enabled }))
//     else if (category === 'milkyWay') dispatch(setMilkyWayLabelEnabled(enabled))
//     else dispatch(setGalaxyCatalogLabelEnabled({ id: category, enabled }))
// renders <LabelsSection labelCategoryVisibility={…} onSetLabelCategoryVisibility={…} />
// export default memo(LabelsSectionContainer)
```

The 3-way guard chain dispatches to three slice actions; keep the exact
narrowing order from App (structure → milkyWay → galaxy catalog else-branch) so
behaviour is byte-identical.

- [x] Write `tests/components/SettingsPanel/LabelsSection.test.ts`
  (plain-props): master tri-state over `LABEL_CATEGORIES`; per-category checkbox
  reflects `labelCategoryVisibility[cat]`; toggling calls
  `onSetLabelCategoryVisibility(cat, …)`.
- [x] Write `tests/components/containers/LabelsSectionContainer.test.ts`
  (store-backed): three assertions — toggling a structure-label category flips
  the structure item's label flag (`selectStructureItems`); toggling `milkyWay`
  flips `selectMilkyWayLabelEnabled`; toggling the `famousGalaxy` label category
  flips the galaxy catalog item's label flag (`selectGalaxyCatalogItems`). This
  is the critical test — it proves the 3-way dispatch lands on the right home.
- [x] Confirm both fail.
- [x] Implement presentational + container.
- [x] `npm test -- LabelsSection` → pass; `npm run typecheck` clean.
- [x] Commit.

---

## Task 9 — `DisplaySection` + `DisplaySectionContainer`

**Files:**
- `src/components/SettingsPanel/DisplaySection.tsx` (new) + reuse module CSS.
- `src/components/containers/DisplaySectionContainer.tsx` (new).
- `tests/components/SettingsPanel/DisplaySection.test.ts` (new).
- `tests/components/containers/DisplaySectionContainer.test.ts` (new).

**`DisplaySection` presentational contract** (extract from
`SettingsPanel.tsx:842–868` — the Display `CollapsibleSection` with the
tone-curve dropdown):

```tsx
type DisplaySectionProps = {
  toneMapCurve: ToneMapCurveT;
  onToneMapCurveChange: (curve: ToneMapCurveT) => void;
};
```

`export default memo(DisplaySection)`.

**`DisplaySectionContainer` contract:**

```tsx
function DisplaySectionContainer(): React.ReactElement
// reads: selectToneMapCurve
// dispatches: onToneMapCurveChange = useCallback((c) => dispatch(setToneMapCurve(c)), [dispatch])
// renders <DisplaySection toneMapCurve={…} onToneMapCurveChange={…} />
// export default memo(DisplaySectionContainer)
```

- [ ] Write `tests/components/SettingsPanel/DisplaySection.test.ts`
  (plain-props): dropdown reflects `toneMapCurve`; changing it calls
  `onToneMapCurveChange` with the parsed curve value.
- [ ] Write `tests/components/containers/DisplaySectionContainer.test.ts`
  (store-backed): change the dropdown, assert `selectToneMapCurve(store.getState())`
  changed.
- [ ] Confirm both fail.
- [ ] Implement presentational + container.
- [ ] `npm test -- DisplaySection` → pass; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 10 — Rewrite `SettingsPanel` as a presentational shell

Now that all seven section containers exist and are independently tested, the
monolithic `SettingsPanel` collapses to a layout-only shell with ZERO store
reach. This is the step that drops App's giant settings prop block.

**Files:**
- `src/components/SettingsPanel/SettingsPanel.tsx` (rewrite) — becomes the
  presentational shell from spec §2:

```tsx
type SettingsPanelProps = {
  defaultOpen?: boolean;
  sourceCounts?: Partial<Record<SourceType, number>>;
  structureCounts?: Partial<Record<StructureId, number>>;
  onResetCamera: () => void;
};
// renders:
// <Panel title="Settings" headerExtra={<TierChipContainer />} defaultOpen={defaultOpen}>
//   <GalaxiesSectionContainer sourceCounts={sourceCounts} />
//   <CosmicWebSectionContainer />
//   <FlowSectionContainer />
//   <StructuresSectionContainer structureCounts={structureCounts} />
//   <LabelsSectionContainer />
//   <DisplaySectionContainer />
//   <div className={styles.panelDivider} role="separator" />
//   <Button className={styles.resetButton} onClick={onResetCamera}>Reset camera</Button>
// </Panel>
// export const SettingsPanel (keep the named export App imports today, or switch
//   to default — pick named to minimize App churn; memo if non-trivial — here it
//   takes only stable/low-freq props so memo it).
```

The shell imports the section containers (NOT selectors/actions). The `~40-prop`
interface, every `show*` gate, the master IIFEs, `deriveCosmicWebStyle`, and
`TOGGLEABLE_SOURCES`/`CosmicWebStyle` (now relocated into their sections in
Tasks 4–9) are all GONE from this file. The module header is rewritten to
describe the shell's new role (layout + section order; the UX-audit rationale
for section composition stays, the props-driven-no-state paragraph is replaced
by "composes containers").

- [ ] Replace the existing `tests/components/SettingsPanel/SettingsPanel.*` test
  (if one exists — search `tests/components/SettingsPanel/`) with a shell test:
  render `SettingsPanel` under a `<Provider>` (it now mounts containers that need
  the store) with stub `sourceCounts`/`structureCounts`/`onResetCamera`; assert
  each section's heading renders (Galaxies / Cosmic web / Flow / Structures /
  Labels / Display) and that "Reset camera" fires `onResetCamera`. If no
  SettingsPanel test exists, add this as a new file.
- [ ] Confirm it fails against the current monolithic SettingsPanel (it will —
  the old one demands the full prop set / has no container children).
- [ ] Rewrite `SettingsPanel.tsx` as the shell.
- [ ] `npm test -- SettingsPanel` → pass; `npm run typecheck` clean.
- [ ] Commit.

---

## Task 11 — App cleanup: shed the dead reach, render the shell

App now renders the slim `SettingsPanel` shell + the chrome containers, and
sheds every selector/dispatch/import the containers absorbed.

**Files:**
- `src/components/App/App.tsx` (modify).

**App's retained store subscriptions after this task** (the verifiable end
state, spec §3/§4):
- `selectPaletteOpen`, `selectUiHidden`, `selectDebugPanelOpen` — read by App's
  own JSX (uiStack classes + chrome `hidden` props + the debug mount gate).
- `selectVisibleSourceMask` — kept ONLY for `useStructureMemberCount` (InfoCard
  container deferred). `GalaxiesSectionContainer` subscribes independently; two
  subscribers is fine (spec §3).
- `selectTier` — kept ONLY if `useStructureMemberCount` still needs `tier`
  (it does: App passes `tier: currentTier` into the hook). So `selectTier` stays.
- The palette/keyboard dispatch callbacks (`setPaletteOpen`, `toggleUiHidden`,
  `toggleDebugPanelOpen`) — App-layout, stay.

**App's render changes:**
- `<SettingsPanel … />` keeps only `defaultOpen`, `sourceCounts`,
  `structureCounts`, and `onResetCamera={() => handleRef.current?.camera.focusOnHome()}`
  (wrap in `useCallback` for the shell's memo to bite — App already wraps its
  memoized chrome callbacks).
- The whole `~360–471` settings prop block is deleted.

**Imports/locals to remove from App** (every symbol the containers now own and
App no longer references):
- selectors: `selectGalaxyCatalogSize`, `selectDepthFade`, `selectToneMapCurve`,
  `selectBiasMode`, `selectAbsMagLimit`, `selectFilamentsEnabled`,
  `selectFilamentIntensity`, `selectVolumesEnabled`, `selectVolumeFieldItems`,
  `selectFlow`, `selectStructureItems`, `selectGalaxyCatalogItems`,
  `selectMilkyWayLabelEnabled` (+ the debug-cluster ones already removed in
  Task 2: `selectShowPickBuffer`, `selectShowDiskRadiusRing`,
  `selectDisabledPasses`, `selectHighlightFallback`, `selectRealOnly`; and
  `selectAutoRotate` from Task 1).
- actions: `setGalaxyCatalogSize`, `setDepthFade`, `setFilamentIntensity`,
  `setAbsMagLimit`, `setToneMapCurve`, `setStructureItemEnabled`,
  `setStructureLabelEnabled`, `setMilkyWayLabelEnabled`,
  `setGalaxyCatalogLabelEnabled`, `setFilamentsEnabled`,
  `setGalaxyCatalogVisible`, `setBiasMode`, `setVolumesEnabled`,
  `writeVolumeField`, `setFlow` (+ those removed in Tasks 1–2).
- helpers no longer used by App: `galaxyCatalogIdOf`, `isStructureId`,
  `projectVolumeFieldRows`, `projectMarkerCategoryVisibility`,
  `projectLabelCategoryVisibility`, `requestTier` (moved to `TierChipContainer`),
  and the `volumeFields` / `markerCategoryVisibility` / `labelCategoryVisibility`
  / `onFlowChange` locals + the three `useMemo`s.
- Drop `useMemo` from the React import if App no longer uses it elsewhere — it
  still uses `useMemo` for `staticStructures`, so keep it. Keep `useCallback`
  (palette + keyboard + onResetCamera callbacks).

**Verification (this is the task's acceptance criterion):** after the edit,
grep App.tsx and confirm the ONLY `useAppSelector` calls remaining are
`selectPaletteOpen`, `selectUiHidden`, `selectDebugPanelOpen`,
`selectVisibleSourceMask`, `selectTier`. Any other selector left = unfinished.

- [ ] Add/extend an App-level test only if one exists today (search
  `tests/components/App/`); App is largely engine-coupled and may not have a
  unit test — if not, this task's safety net is the full suite + typecheck, not
  a new App test (don't fabricate one against the engine).
- [ ] Edit App: render the shell + chrome containers; delete the settings prop
  block; remove every dead import/local listed above; wrap `onResetCamera` in
  `useCallback`.
- [ ] `npm test` (full suite) → green; `npm run typecheck` clean; `npm run
  build` (tsc --noEmit + vite build) clean.
- [ ] Grep-verify App's retained selector set is exactly the five above.
- [ ] Commit.

---

## Definition of done

- [ ] All seven SettingsPanel section containers + their presentational pairs,
  `AutoRotateToggleContainer`, `DebugPanelContainer`, `TierChipContainer`, and
  the `SettingsPanel` shell exist under the conventions in §1.
- [ ] `RenderTogglesSection` is presentational (no `store/`/`state/` import) —
  the codebase has ZERO leaf-level store reach.
- [ ] App's retained `useAppSelector` set is exactly `selectPaletteOpen`,
  `selectUiHidden`, `selectDebugPanelOpen`, `selectVisibleSourceMask`,
  `selectTier`.
- [ ] No presentational component imports from `store/` or `state/`
  (grep-verifiable).
- [ ] Every container is `memo()`'d; presentational components are `memo()`'d
  where non-trivial, with `useCallback`-wrapped handlers from the containers.
- [ ] No selector was rewritten as `createSelector`; the three projection
  helpers are reused verbatim (only their call sites moved).
- [ ] Full suite green (≥ 590 tests), `npm run typecheck` + `npm run build`
  clean.
- [ ] `src/components/containers/README.md` documents the convention.

## Out of scope (do not scope-creep — spec §"Out of scope")

- **EngineContext.** `sourceCounts` / `structureCounts` / selection stay App
  props; engine-handle actions stay App callbacks. A context for engine state is
  a clean follow-up, deliberately deferred.
- **Moving `useStructureMemberCount` into a container** — App keeps it and its
  `selectVisibleSourceMask` / `selectTier` subscriptions. An InfoCard container
  is a later step.
- **Selector shape changes, store/slice/engine changes, any behaviour change.**
  Purely structural.
