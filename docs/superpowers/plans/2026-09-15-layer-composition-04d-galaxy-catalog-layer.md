# Layer composition (d), PR-D first half — the `galaxyCatalog` Layer forms

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(d): the ideal-shape sketch (`src/layers/galaxyCatalog/` tree), rulings **D1, D2, D4, D6 (the
`EngineData` sentence), D7, D8, D9, D10, D11, D12, D13**, the joints-table rows "Per-frame prelude",
"Liveness and readiness", "Settings-driven subsystem effects", "Bootstrap phase for Layers",
"Swap-format rebuild", the **PR packaging** table (PR-D row), the "PR-D also folds the hi-res famous
pair" paragraph and "Open at plan time" (the `biasCorrection` check); §12 (shaders stay put); §14's
last three rows.

Plan 04d of the layer-composition sequence; follows plan 04c
([`completed/2026-09-15-layer-composition-04c-galaxy-side-unbraids.md`](completed/2026-09-15-layer-composition-04c-galaxy-side-unbraids.md)).
PR-D is split in two by user ruling (2026-09-15): **04d (this plan) — the Layer forms, engine side:**
everything a pass, fade, label, asset row or selection row reaches through a closure over the
runtime. **04e (next plan) — the shell channel and the reference engine:** the facts bag beyond the
one fact this plan is forced to publish (Ruling 6), the remaining `EngineHandle` sub-handles,
`useAliasIndex` / `useStructureMemberCount` / `engineHandleRef`, `RequestKey` + `ctx.request`,
`galaxiesOnly.ts`, the §15 docs, the deletion audit.

Branch: `worktree-layer-composition-04d` (off `55a3bd33e`, #722). One PR, **7 tasks**, every commit
`npm run typecheck:fast` + targeted tests green; `tsc` and the suite at the gate. Gate (spec PR-D
row, halved): the suite, `npm run build`, the three ratchets, a user visual pass (the checks under
Definition of Done) and paired `npm run perf` A-B-A-B on `full-survey`, `milky-way` and
`solar-system` — the per-frame work moves from `runFrame`'s prelude and `CONTENT_PASSES` into a
Layer's `frame` and `passes` closures, so the A-B must show the move is free. **Deletion audit
deferred to 04e's `/feature-done`** (user ruling: audit once at the feature).

Dispatches (serial, Sonnet unless tagged; group by file locality): **D1 = Tasks 1–2** (core joints
over the empty tuple, then the pure moves), **D2 = Tasks 3–4** (the runtime — the one large wiring
commit — then the present/ rows that restore labels, picking and fades; Opus), **D3 = Tasks 5–6**
(the frame reconcile, the settings clusters), **D4 = Task 7** (the sweep). Edges: 3 needs 1 and 2;
4 restores what 3 deletes on the core side, so they share a dispatch; 5 needs 3; 6 needs 3 (the
runtime's `frame` reads `state.settings.bias`, which 6 re-homes without changing its path); 7 last.

## Goal

`APP_COMPOSITION.layers` is `[galaxyCatalogLayer]`. Every galaxy-family object core built by hand —
seven renderers, the atlas and disk subsystems, the disk-planner walk, the hi-res famous pair, bias
correction, nine point slots plus the famous-meta and pgc-alias sidecars, the synthetic fallback
gate, four passes, two fade rows, one label producer, one selection row, the per-frame prelude and
its liveness terms, the bias reconcile — is built in one `create(deps)`, reached through closures
over one runtime object, and torn down in one `destroy(runtime)`. Core keeps no galaxy field:
`EngineGpuHandles`, `EngineSubsystemHandles`, `EngineAssetSlots`, `EngineData`, `GPU_HANDLE_ROWS`,
`ASSET_WIRING`, `FADE_LAYERS`, `CONTENT_PASSES`, `coreSelectionRows` and `ResolveDeps` lose their
galaxy members; `watchBiasBakeSaga` and `ReconcileEffects.bakeBias` die with the reconcile that
replaces them.

Behaviour-neutral, with one named exception the spec rules (D9): the disk-radius ring keys its
pipeline by the canvas format at draw instead of being rebuilt by core's swap-format walk — the same
frames draw. One shell channel changes shape without changing behaviour: the command palette reads
the famous meta from the Layer's fact (`state.engine.galaxyCatalog.famousMeta`) instead of
`engine.meta.famousGalaxies` (Ruling 6).

## Architecture

- **Core composes every contribution kind before the first Layer lands (Task 1).** 04c wired
  `selection` and `frame` (`instantiateLayer.ts:24-28`, `runFrame.ts:204-206`); `passes`, `assets`,
  `fades` and `labels` are declared on the contract but reach nothing. `LayerInstance` grows the four
  lists plus `runtime`, and `createLayers` assembles `state.passes`, `state.assetRows`,
  `state.fadeRows` and `state.layerSlots` from `[...core, ...layers]`, in tuple order after core.
  Consumers stop reading the module constants: `renderFrame`, `startLoop`, the `pickProgram` row and
  the demand loop read the composed lists; the fade sync and seed walk `state.fadeRows`; label
  producers register on `cosmoLabelDirector` inside `createLayers`. Over `[]` every composed list
  equals its constant, so Task 1 is `tsc`-proven neutral.
- **The runtime is the family's data store and handle bag (Task 3).** `GalaxyCatalogRuntime` holds
  what `state.gpu.*`, `state.subsystems.*`, `state.assetSlots.*` and `state.data.galaxies` hold
  today, as plain fields; `catalogs` is a `Map<SourceType, GalaxyCatalog>` (the `GalaxyStore` wrapper
  dissolves, D6). `create` builds in today's order (point renderer → bias subsystem attached to it;
  atlas → textured/procedural planners → walk; pick renderer over `deps.focusUniform`; slots last),
  which is exactly the order `initGpu` + `wireSlots` + `wireImpostorSubsystems` run today. `destroy`
  runs `engine.ts:533-552,576-578` in that order, on the runtime.
- **The hi-res pair lives in its slot (Task 3).** `EngineSubsystemHandles.hiResFamous` /
  `.hiResFamousTexture` were a mirror of `slot.committed()`; `frame` reads the slot and `destroy`
  destroys `committed()` subsystem-before-texture, then the slot. The lifecycle point the spec
  schedules: `commit` needs the previous pair after the hand-over; it reads `slot.committed()` before
  the slot swaps if `createAssetSlot` calls `commit` before it writes `lastReady`, else the slot hands
  `previous` to `commit` (Ruling 4).
- **The shell keeps its two read paths for one PR (Ruling 5, the bridge).** `handle.sources.getCloud`
  / `.getCloudObjIds` and `handle.selection.loadAliases` read the galaxy runtime by name through a
  structural type in `src/@types/`, never by importing `src/layers/`. The famous meta cannot ride the
  bridge — the slot that writes it moves into the Layer, and a Layer file may not dispatch a
  `src/state` action (outbound ratchet) — so it becomes the first published fact (Ruling 6).
- **Settings clusters travel as one tuple (Task 6).** `bias` and `thumbnails` become fragments
  beside `galaxyCatalogs`, exported together as the Layer's `settings` tuple; `settingsSlice` imports
  that one tuple where it imported the one fragment, so the import-boundary row stays at its number.

## Global Constraints

Binding on every task, from CLAUDE.md, the brief and the spec:

- **One symbol per file** in `src/utils/` and `src/@types/`; the Layer's `types/` folder is that
  convention's home inside the Layer (one type per file there too). `type` aliases, never
  `interface`. No barrels; deep relative imports. `layer.ts` exports the one Layer object.
- **Frame files (`src/services/engine/frame/**`, incl. `timing/`and`passes/`) declare only their
own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts`only ever
shrinks.** The Layer's`passes/`files keep the same discipline (one export, the pass) even though
the sweep does not reach`src/layers/`.
- **Named byte offsets and sizes stay named constants** (`UNIFORM_BYTES`, `SLOTS_PER_GALAXY_POINT`,
  `HI_RES_LAYER_COUNT`, …): a move never inlines a number.
- **No handles, no tier hook, no query rows; `deps` = creation-time objects only (D7); the shell reads
  only the store (D6)** — Ruling 5's bridge is the one recorded exception, deleted in 04e.
- **Shaders stay in `src/services/gpu/shaders/`** (§12). A moved renderer keeps its `?static` import
  pointing there; after every move, `rg -n "package::" src --glob '*.wesl'` and
  `rg -n "shaders/" src/layers` confirm the specifiers.
- **Every file move goes through `npm run move-files -- <from> <to>`** (or `-- --manifest
<moves.json>`; `--dry` first), never `git mv`; then `rg` the old paths across `src tests tools
docs` — ts-morph rewrites import specifiers, not `vi.mock('…')` strings or prose.
- **The import-boundary ratchet** (`tests/conventions/layerImportBoundary.test.ts`): no file under
  `src/layers/` imports `src/state/` or `src/store/`; `src/services/engine/**` and `src/state/**`
  import `src/layers/` only through the one `settingsSlice` row, at its current count. A moved file
  that imports `src/state` today loses that import in the same task (Task 3 lists the two).
- **Comment budget** per [`comments.md`](../conventions/comments.md): header ≤ 5 lines, comment lines
  ≤ half the code lines. Every moved file whose header narrates the core wiring it just left
  (`wireGalaxyCatalogSourceSlot.ts`, `wireHiResFamousSlot.ts`, `wireImpostorSubsystems.ts`,
  `biasCorrectionSubsystem.ts:1-89`, `createSyntheticFallback.ts:1-90`) comes under budget in the
  task that moves it; deleted prose is not re-homed.
- **Tests** are judged by [`testing.md`](../conventions/testing.md); moved tests move with
  `move-files`; the four new assertions each name the real bug they catch.
- Commit after every task (Task 2 may be two commits: the manifest move, then the import sweep).

## Findings at HEAD `55a3bd33e`

Verified in this worktree; the inventory (`inventory-04d.md`) is the site list and is trusted over
the spec's line numbers.

| #   | Fact                                                                                                                                                                                                                                                                                                                                                                                     | Where                                                                                             | What it means                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `LayerInstance` is `{ name, selection, frame, destroy }`; `instantiateLayer` never calls `passes`/`assets`/`fades`/`labels`. `runFrame.ts:204-206` already ORs every `frame` into liveness; `engine.ts:530` destroys instances in reverse.                                                                                                                                               | `LayerInstance.d.ts`, `instantiateLayer.ts:24-28`                                                 | Task 1 is a real gap, not a rename: without it a Layer's passes draw nothing.                                                                                                                                |
| 2   | `CONTENT_PASSES` is read at module init by `MAX_PROGRAM` (`timing/maxProgram.ts`), which feeds `timedSlots` / `passGroupKeys` / `timedSlotGroups`; at runtime by `renderFrame.ts:53`, `startLoop.ts:28-33`, the `pickProgram` row (`gpuHandleRegistry.ts:519`) and `passOverrides.allNames` (`engine.ts:612`). `expandFrameOrder.ts:42` resolves a name with `passes.find`.              | as listed                                                                                         | Runtime readers switch to `state.passes`; `allNames` derives from `FRAME_ORDER` (static names); the timing layout is Ruling 2.                                                                               |
| 3   | `FADE_LAYERS` has two readers, `syncVisibilityFades.ts:68,92` and `seedFades` (`fadeLayers.ts:230`, called from `wireSlots.ts:152`, after `createLayers`). `ASSET_WIRING` has one code reader, `wireSlots.ts:100` (`buildSlotsFromRegistry`), which is where the demand loop's rows and the debug rank map originate. Label producers register at `engine.ts:364-382`, before bootstrap. | as listed                                                                                         | The composed lists have a small, known consumer set (Task 1).                                                                                                                                                |
| 4   | `slotFor.ts:57` reads `state.assetSlots.points.get(key)` for numeric keys; `installSlots.ts:65` writes `state.assetSlots[key]`; `createSyntheticFallback.ts:99,148` reads the points map; `installLoadProgress` enumerates `allSlots`.                                                                                                                                                   | as listed                                                                                         | The Layer's slots need one lookup path core already walks: `state.layerSlots` (Task 1), consulted by `slotFor` first and enumerated into `allSlots`.                                                         |
| 5   | `state.contentVersion` is bumped only by the galaxy commit (`wireGalaxyCatalogSourceSlot.ts:59`) and read only by `scheduleSkyCaptures.ts:67,98`.                                                                                                                                                                                                                                        | as listed                                                                                         | Ruling 3: the bump moves into core's `reportSourceCount` closure; no new dep field.                                                                                                                          |
| 6   | `SettingsPanel.tsx:46` already renders `layer.ui`; `LayerUiSection = ComponentType`. But `GalaxiesSectionContainer` imports `src/state` selectors and store hooks, and `settingsSlice` → `APP_SETTINGS_FRAGMENTS` → `APP_COMPOSITION` → `layer.ts` is a runtime chain, so a `layer.ts` that imports the container closes a module-init cycle through the store.                          | `SettingsPanel.tsx:46`, `appSettingsFragments.ts:41-44`, `initialSettings.ts`, `settingsSlice.ts` | Ruling 8: `ui` is not declared in 04d; the panel keeps its hand-written Galaxies child.                                                                                                                      |
| 7   | `famousGalaxiesMetaSlot.ts:11,27,31` dispatches `engineFamousGalaxiesMetaReported` (a `src/state` import); `wireGalaxyCatalogSourceSlot` dispatches the source count through `cb`; `createSyntheticFallback.ts:166` writes `state.requests`.                                                                                                                                             | as listed                                                                                         | Once moved under `src/layers/`, the first is an outbound-ratchet violation (Ruling 6); the second is `deps.reportSourceCount`; the third becomes a runtime flag (Ruling 7).                                  |
| 8   | `GalaxyCatalogId` has twelve importers, five of them under the inbound sweep (`state/settings/selectors.ts`, `services/animation/*`, `frame/deriveSourceMasks.ts` via `GALAXY_CATALOG_SOURCES`, `@types/animation/FadeId.d.ts`); `GalaxyCatalogRegistryEntry` / `GalaxyCatalogSourceType` likewise. `SOURCE_REGISTRY` has 74 importers, ten under `src/data/`, read at module init.      | `rg -l "GalaxyCatalogId'" src`, `rg -l "SOURCE_REGISTRY\b" src/data`                              | Ruling 1: the id types stay in `src/@types/data/galaxyCatalog/` (moving them adds ratchet rows) and the composed `SOURCE_REGISTRY` stays in `src/data/sources.ts`, built from the leaf tuple as 04c left it. |
| 9   | `biasCorrection`'s readers are `engine.ts:254,533`, `initGpu.ts:93` (attach), `makeReconcileEffects.ts:22` (`bakeBias`) and the subsystem itself; nothing reads it before the GPU exists.                                                                                                                                                                                                | `rg -n "biasCorrection\b" src`                                                                    | The spec's open check passes: it moves to `create` whole.                                                                                                                                                    |
| 10  | `wireHiResFamousSlot.ts:51-62` destroys the previous pair from the mirror after `bindHiResArray` + `setHiResFamous`; `engine.ts:537-552` explains the atlas → planner → texture order.                                                                                                                                                                                                   | as listed                                                                                         | Ruling 4 schedules the read of the previous pair.                                                                                                                                                            |
| 11  | `RequestKey` is `'paletteOpened' \| 'syntheticFallback'`; `engine.ts:498` raises the first, `createSyntheticFallback.ts:166` the second; `DemandCtx.request` is read by the two rows only (`assetWiring.ts:96,347`).                                                                                                                                                                     | as listed                                                                                         | Ruling 7: `'syntheticFallback'` dies here (runtime flag), `'paletteOpened'` survives to 04e with `ctx.request`.                                                                                              |
| 12  | `utils/network/fetchGalaxyBitmap.ts` imports `GALAXY_ATLAS_SLOT_SIDE` from `subsystems/galaxyAtlasSubsystem.ts`.                                                                                                                                                                                                                                                                         | spec adjacent finding                                                                             | Once the subsystem is under `src/layers/`, that is a `utils → layers` edge; the constant moves to `src/data/` in Task 2.                                                                                     |

## Rulings

Made at plan time against the code above. Do not re-open during execution; a reviewer who disagrees
escalates to the user. Rulings 1, 2, 6, 7 and 8 are the ones the user may veto (listed in the reply).

**Ruling 1 — `SOURCE_REGISTRY` is not re-homed and `composeSources(layers)` is not minted in 04d;
`GalaxyCatalogId` / `GalaxyCatalogRegistryEntry` / `GalaxyCatalogSourceType` stay in
`src/@types/data/galaxyCatalog/`.** Finding 8: ten `src/data/` modules read galaxy entries at module
init, and `src/data/` may not import `services/` (§12). A registry composed from `APP_COMPOSITION`
would sit on the chain `data → compositions/app → layer.ts → render/* → data/sources`, a module-init
cycle whose first `tsc`-invisible symptom is a TDZ throw at boot. The leaf edge 04c's Ruling 1
accepted (`data/sources.ts` → `layers/galaxyCatalog/sources/galaxyCatalogSourceRows.ts`, a file that
imports only `data/source.ts` and types) is the safe shape, and `layer.ts` declares
`sources: GALAXY_CATALOG_SOURCE_ROWS` from the same file — one authority, two readers. With no
composed registry there is no consumer for `composeSources`, and 04c's Ruling 5 declines unconsumed
functions. The id types cannot leave `src/@types/` while `state/settings/selectors.ts` and the
`services/animation` rows import them (ratchet rows would grow). Cost if wrong: the brief's "re-home
so the ratchet needs no exemption" sentence is not honoured; the ratchet is green regardless because
`src/data/` is outside both sweeps. Recorded under Deferred for 04e or a later un-braid that first
moves the ten data readers.

**Ruling 2 — the timing layout stays static; runtime pass lists are composed.** `MAX_PROGRAM` sizes
the GPU timing slots at module init (Finding 2) and cannot see Layer closures. Task 1's implementer
verifies at dispatch what `expandFrameOrder` reads off a content pass: if `name` only, `MAX_PROGRAM`
expands over name-only stubs derived from `FRAME_ORDER`'s render steps and `CONTENT_PASSES` is no
longer an input to timing; if it also reads a per-pass field (`target`, `timed`), `MAX_PROGRAM` and
`TIMED_SLOTS` move to a `createLayers`-time computation stored on `state.timing`, and their
module-level readers take the value from state. Either way `CONTENT_PASSES` shrinks to core's passes
and the four galaxy names stay in `FRAME_ORDER`, resolved against `state.passes` per frame. Reason:
a pass name in `FRAME_ORDER` with no pass in the list is a boot-time `checkFrameOrder` error today,
which is the totality the spec keeps (§5); a Layer pass missing from the timing layout would be a
silent timing gap, which is why the branch is decided by what the expander needs, not by taste.

**Ruling 3 — `contentVersion` bumps inside core's `reportSourceCount`.** Finding 5: the galaxy commit
is its only writer and it already calls `reportSourceCount` there (Task 3). A source count landing
IS a content change for the sky capture that reads the version. The star commit now bumps it too;
the implementer verifies at dispatch that `scheduleSkyCaptures`' roster already re-bakes on the star
commit (it captures the star field), so the extra bump is a no-op there — if it is not, add
`bumpContentVersion: () => void` to `LayerCoreDeps` instead and keep the star path unchanged.

**Ruling 4 — the previous hi-res pair is read from `slot.committed()` inside `commit`, before the
slot swaps.** Task 3's implementer verifies at dispatch that `createAssetSlot` invokes `commit(value)`
before it writes `lastReady`; if so, `committed()` inside `commit` is the previous pair and no
signature changes. If the order is the reverse, `createAssetSlot`'s `commit` gains a second argument
`previous: T | null` (a generic change in `services/loading`, with one assertion in its test), and
every other commit ignores it. Reason: the mirror fields exist only to answer this one question, and
the answer belongs to the slot that already holds both values.

**Ruling 5 — the bridge is `GalaxyCatalogBridge`, a structural type in `src/@types/engine/layer/`,
and `LayerInstance.runtime`.** `engine.ts` reads
`state.layers.find((l) => l.name === 'galaxyCatalog')?.runtime as GalaxyCatalogBridge | undefined`
in one helper, `galaxyBridgeOf(state)`, and `handle.sources.getCloud` / `.getCloudObjIds` /
`handle.selection.loadAliases` read `catalogs` and `pgcAlias` through it. `GalaxyCatalogRuntime`
extends `GalaxyCatalogBridge` so `tsc` pins the shape from the Layer side. `services/engine/**`
imports nothing under `src/layers/`. 04e deletes the type, the helper, the two sub-handles and
`LayerInstance.runtime`'s only reader. Reason: the shell's three readers (`useAliasIndex`,
`useStructureMemberCount`, the palette) have no facts channel until 04e, and the alternative — leaving
the galaxy store in core for one PR — keeps `EngineData.galaxies` and every `state.data.galaxies`
reader alive, which is most of what this PR deletes.

**Ruling 6 — the famous meta is 04d's one published fact; the redux copy dies here.** Finding 7: the
slot that writes the meta moves into the Layer and may not dispatch `engineFamousGalaxiesMetaReported`.
The spec's D10 already names the replacement: `facts: { famousMeta: [] }`, `deps.publish({ famousMeta })`
at commit and `[]` on error (a copy — immer freezes store state). `CommandPaletteContainer` reads
`state.engine.galaxyCatalog.famousMeta`; `engineFamousGalaxiesMetaReported`,
`CoreEngineSliceState.meta.famousGalaxies` and `selectFamousGalaxiesMeta` are deleted with their
tests (`engineSlice.test.ts:43`). The other three facts (`provenanceCounts`, `aliasIndex`,
`structureMemberCount`) stay 04e's. Cost: 04d touches the shell's facts typing (Task 3 verifies
whether the engine slice state already composes `FactsOf<AppLayers>`; if not, it adds that
composition the way `EngineSettingsState.d.ts` composes `APP_SETTINGS_FRAGMENTS`).

**Ruling 7 — the synthetic-fallback trigger is a runtime flag; `RequestKey` shrinks to
`'paletteOpened'`.** The gate (`createSyntheticFallback`) subscribes to runtime-owned point slots and
today raises a flag on `EngineState`, which a Layer does not hold. It sets `runtime.syntheticArmed`
and the Synthetic row's `demand` reads it — the same trigger, one fetch (D6 says the slot states;
the gate's count-aware policy IS that read, kept as is). `pgcAlias` keeps `ctx.request('paletteOpened')`
until 04e deletes `ctx.request` with `loadAliases` (the demand flip to `ui.paletteOpen` rides the
hook that raises the key, per P5).

**Ruling 8 — `ui` is not declared in 04d (D13 waits for 04e).** Finding 6: `layer.ts` importing
`GalaxiesSectionContainer` closes `settingsSlice → APP_SETTINGS_FRAGMENTS → APP_COMPOSITION →
layer.ts → container → store hooks → settingsSlice`. The mechanism 04b shipped is fine; the cycle is
in what the container imports. 04e resolves it (a `src/compositions/appUi.ts` that lists the sections
without `layer.ts` importing components is the obvious shape) and moves `GalaxiesSection(+Container)`
then. The panel keeps rendering the child by hand; nothing user-visible changes.

**Ruling 9 — the disk-radius ring owns its format (D9).** The ring renderer keys its pipeline by the
format it is asked to draw into and rebuilds lazily on the first draw after a change; the pass
passes the current canvas format from the frame context (the implementer verifies at dispatch where
`applySwapFormat` publishes the format the `rebuildOnSwapFormat` walk reads, and reads the same
value). `rebuildOnSwapFormat: true` leaves with the ring's `GPU_HANDLE_ROWS` row; core's seven-row
walk is untouched (spec: adjacent).

**Ruling 10 — companion expansion runs per Layer.** `assets(runtime)` returns rows already passed
through `expandCompanionRows` (the famous-meta row's parent is a Layer row; no companion relation
crosses a Layer). Core's `ASSET_WIRING` keeps its own expansion call for the star sidecar.

**Ruling 11 — no new types move to the Layer's `types/` except `GalaxyCatalogRuntime`.** The eight
galaxy-family files under `src/@types/loading/` and the renderer/subsystem `.d.ts` files keep
importers outside the Layer (the shell hook, the bridge) or are consumed only through the runtime;
moving them is a diff with no reader benefit. Deletion beats addition; a relocation is neither.

## File structure

**Created**

```
src/layers/galaxyCatalog/layer.ts                                  defineLayer({ name: 'galaxyCatalog', settings, sources, facts, create, destroy, passes, assets, fades, labels, selection, frame })
src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts             the runtime (extends GalaxyCatalogBridge)
src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts               { famousMeta: readonly FamousGalaxyMetaEntry[] }
src/layers/galaxyCatalog/settings/galaxyCatalogLayerSettings.ts    [galaxyCatalogsSettingsFragment, biasSettingsFragment, thumbnailsSettingsFragment] as const
src/layers/galaxyCatalog/settings/biasSettings.ts                  the `bias` cluster fragment (out of CoreSettingsState)
src/layers/galaxyCatalog/settings/thumbnailsSettings.ts            the `thumbnails` cluster fragment
src/layers/galaxyCatalog/create.ts                                 create(deps): GalaxyCatalogRuntime
src/layers/galaxyCatalog/destroy.ts                                destroy(runtime)
src/layers/galaxyCatalog/frame.ts                                  frame(runtime) — prelude, liveness, bias reconcile
src/layers/galaxyCatalog/load/galaxyCatalogAssetRows.ts            assets(runtime)
src/layers/galaxyCatalog/present/galaxyCatalogFadeRows.ts          fades(runtime)
src/@types/engine/layer/GalaxyCatalogBridge.d.ts                   { catalogs, pgcAlias } — Ruling 5, dies in 04e
src/data/galaxyCatalog/galaxyAtlasSlotSide.ts                      GALAXY_ATLAS_SLOT_SIDE (Finding 12)
tests/services/engine/phases/createLayers.composition.test.ts      Task 1's one assertion
tests/layers/galaxyCatalog/frame.biasReconcile.test.ts             Task 5's one assertion
```

**Moved** (Task 2, one `--manifest`; tests follow automatically, `vi.mock` strings swept by hand)

```
src/services/gpu/renderers/galaxyCatalog/{catalogStore,galaxyPointRenderer,galaxyPickRenderer,texturedDiskRenderer,proceduralDiskRenderer,instancedQuadRenderer,galaxyPointVertexLayout}.ts
                                                                → src/layers/galaxyCatalog/render/<same>.ts
src/services/gpu/renderers/devTools/diskRadiusRing.ts           → src/layers/galaxyCatalog/render/diskRadiusRing.ts
src/utils/gpu/packGalaxyPointUniforms.ts                        → src/layers/galaxyCatalog/render/packGalaxyPointUniforms.ts
src/services/engine/helpers/pickUniformBytesOf.ts               → src/layers/galaxyCatalog/render/pickUniformBytesOf.ts
src/services/engine/subsystems/{galaxyAtlasSubsystem,texturedDiskSubsystem,proceduralDiskSubsystem,diskPlannerWalk,hiResFamousSubsystem,biasCorrectionSubsystem}.ts
                                                                → src/layers/galaxyCatalog/subsystems/<same>.ts
src/services/biasCorrection/galaxyCatalogConstants.ts           → src/layers/galaxyCatalog/subsystems/galaxyCatalogConstants.ts   (the dir is then empty; delete it)
src/services/engine/bake/computeSchechterRatios.worker.ts, computeAngularWeights.worker.ts, and the pure modules they import that have no other reader
                                                                → src/layers/galaxyCatalog/subsystems/bake/<same>   (verify at dispatch: `rg -l "engine/bake/" src tools`; a module `tools/` imports stays — spec adjacent)
src/services/engine/frame/passes/{galaxyPointSpritesPass,proceduralDisksPass,texturedDisksPass,diskRadiusRingPass}.ts
                                                                → src/layers/galaxyCatalog/passes/<same>.ts
src/services/engine/wiring/{wireGalaxyCatalogSourceSlot,wireHiResFamousSlot,wireImpostorSubsystems,createSyntheticFallback,galaxyCatalogRequest}.ts
                                                                → src/layers/galaxyCatalog/load/<same>.ts
src/services/loading/slots/{famousGalaxiesMetaSlot,pgcAliasSlot}.ts
src/services/loading/fetchers/{galaxyCatalogFetcher,syntheticPointFetcher,famousGalaxiesMetaFetcher,pgcAliasFetcher}.ts
                                                                → src/layers/galaxyCatalog/load/<same>.ts
src/services/engine/presentation/produceFamousGalaxyLabels.ts   → src/layers/galaxyCatalog/present/produceFamousGalaxyLabels.ts
src/services/engine/helpers/extractGalaxyRow.ts                 → src/layers/galaxyCatalog/present/extractGalaxyRow.ts
src/services/engine/selection/galaxyCatalogSelectionRow.ts      → src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow.ts
```

Not moved, on purpose: `src/utils/galaxy/*` (spec: an ISM-generator folder wearing the wrong name),
`src/utils/galaxy/buildAliasIndex.ts` and `src/hooks/useAliasIndex.ts` (04e, with the `aliasIndex`
fact), `src/services/loading/awaitSlotReady.ts` (generic), `src/data/galaxyCatalog/*` (shared wire
format), `src/@types/loading/*` and the renderer/subsystem `.d.ts` files (Ruling 11),
`src/components/**` (Ruling 8), `src/state/selection/captureGalaxyFocusIds.ts` (state, reads
`src/@types` only).

**Modified** — per task below. **Deleted** — per task; the headline list is under Definition of Done.

---

## Task 1 — core composes passes, assets, fades and labels from every Layer (empty tuple)

**review: yes** — the frame program and the GPU timing layout (renderer landmine area); the
composition's silent-drop bug class is invisible to `tsc`.

**Files:** `src/@types/engine/layer/LayerInstance.d.ts`, `src/@types/engine/state/EngineState.d.ts`,
`src/services/engine/layer/instantiateLayer.ts`, `src/services/engine/phases/createLayers.ts`,
`src/services/engine/engine.ts` (`state` literal seeds; `passOverrides.allNames` at `:612`;
`contentVersion` seed stays), `src/services/engine/frame/renderFrame.ts:53`,
`src/services/engine/phases/startLoop.ts:28-33`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts:519`,
`src/services/engine/frame/timing/maxProgram.ts` (Ruling 2), `src/services/engine/wiring/syncVisibilityFades.ts:68,92`,
`src/services/engine/wiring/fadeLayers.ts:230` (`seedFades`), `src/services/engine/wiring/slotFor.ts`,
`src/services/engine/phases/wireSlots.ts:100` and the `installLoadProgress` enumeration (verify at
dispatch: `installLoadProgress.ts:43-91` is where `allSlots` is filled), the demand loop's row source
(verify at dispatch: follow `buildSlotsFromRegistry`'s return into `reevaluateDemand`'s row argument
and the debug `assetPriorities` map), `tests/services/engine/phases/createLayers.composition.test.ts`
(new), `tests/services/engine/phases/createLayers.test.ts` (fixture: the stub instance gains the
four lists).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own
symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Produces:**

```ts
// src/@types/engine/layer/LayerInstance.d.ts
export type LayerInstance = {
  readonly name: string;
  readonly runtime: unknown;                       // Ruling 5's bridge reads it; 04e deletes it
  readonly passes: readonly ContentPass[];
  readonly assets: readonly AssetWiringRow[];      // already companion-expanded (Ruling 10)
  readonly fades: readonly FadeLayer<unknown>[];
  readonly labels: readonly Label2DProducer[];
  readonly selection: readonly SelectionKindRow[];
  readonly frame: ((ctx: ReadyFrameContext, state: PassState) => boolean) | null;
  destroy(): void;
};

// EngineState — four composed lists, seeded to the core constants in engine.ts, replaced in createLayers
passes: readonly ContentPass[];            // [...CONTENT_PASSES, ...layers.flatMap((l) => l.passes)]
assetRows: readonly AssetWiringRow[];      // [...ASSET_WIRING, ...layers.flatMap((l) => l.assets)]
fadeRows: readonly FadeLayer<unknown>[];   // [...FADE_LAYERS, ...layers.flatMap((l) => l.fades)]
layerSlots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>;  // every Layer row's factory, called once
```

**Behaviour:** `createLayers` builds the four lists in tuple order after core, calls each Layer
asset row's `factory` once (a Layer row's factory returns the runtime-owned slot; `SlotDeps` is
still passed for signature parity) into `layerSlots`, and registers each Layer's label producers on
`state.subsystems.cosmoLabelDirector` (the COSMO slab is the only director a Layer needs in (d); the
NEAR0 director stays core's). `slotFor` consults `state.layerSlots` before its core branches;
`installLoadProgress` enumerates `layerSlots` into `allSlots`; the demand loop and the rank map walk
`state.assetRows`; `renderFrame`, `startLoop.checkFrameOrder` and the `pickProgram` row read
`state.passes`; `syncVisibilityFades` and `seedFades` walk `state.fadeRows`. `passOverrides.allNames`
derives from `FRAME_ORDER`'s render steps (static names; today's volume-target filter unchanged), so
the handle literal no longer depends on the pass list at construction. `reportSourceCount`'s core
closure does `state.contentVersion += 1` (Ruling 3, verify the star-commit note). Over `layers: []`
every list equals its constant and nothing observable changes.

- [ ] Test (`createLayers.composition.test.ts`) `createLayers composes a Layer's passes, assets, fades
  and labels after core's, in tuple order` — a stub composition of two Layers whose hooks return
      one distinctly named pass / row / fade / producer each; assert `state.passes` is
      `[...CONTENT_PASSES, a, b]` by name, `state.fadeRows` ends with the two fade keys in order,
      `state.layerSlots` holds both asset keys mapped to the objects the factories returned, and the
      cosmo director's `registerProducer` stub saw both producer ids in order. Real bug it catches:
      a contribution kind wired for one Layer but not appended for the next, or a factory called
      per frame instead of once — neither fails `tsc` nor any existing test.
- [ ] No test for the consumer switches: `renderFrame`/`startLoop` are exercised by
      `runFrame.test.ts` and `startLoop`'s existing tests over the same constants.
- [ ] `npm run typecheck:fast`; `npm test -- createLayers runFrame startLoop syncVisibilityFades fadeLayers slotFor frameFilePurity timedSlots` green. Commit.

## Task 2 — the moves

**Files:** the **Moved** table above as one `moves.json` manifest; `src/data/galaxyCatalog/galaxyAtlasSlotSide.ts`
(new; `utils/network/fetchGalaxyBitmap.ts` and `galaxyAtlasSubsystem.ts` import it there);
`src/services/biasCorrection/` (delete the empty dir); `tests/**` `vi.mock('…')` string paths naming
any moved file (sweep with `rg -n "vi.mock\('.*(galaxyCatalog|Disk|hiResFamous|biasCorrection|syntheticFallback|famousGalaxiesMeta|pgcAlias|galaxyPointSprites|diskRadiusRing)" tests`).

No behaviour change and no wiring change: after this task every moved module is imported from its
new path by the same core files that imported it before. The one content edit is Finding 12's
constant. Header comments that narrate core wiring are cut in Task 3, where the wiring changes.

- [ ] `npm run move-files -- --manifest moves.json --dry`, read the report, then for real; confirm
      `tests/layers/galaxyCatalog/**` received every mirror test.
- [ ] `rg -n "services/gpu/renderers/galaxyCatalog|renderers/devTools/diskRadiusRing|engine/subsystems/(galaxyAtlas|texturedDisk|proceduralDisk|diskPlannerWalk|hiResFamous|biasCorrection)|services/biasCorrection|frame/passes/(galaxyPointSprites|proceduralDisks|texturedDisks|diskRadiusRing)|wiring/(wireGalaxyCatalogSourceSlot|wireHiResFamousSlot|wireImpostorSubsystems|createSyntheticFallback|galaxyCatalogRequest)|slots/(famousGalaxiesMeta|pgcAlias)Slot|fetchers/(galaxyCatalog|syntheticPoint|famousGalaxiesMeta|pgcAlias)Fetcher|presentation/produceFamousGalaxyLabels|helpers/(extractGalaxyRow|pickUniformBytesOf)|selection/galaxyCatalogSelectionRow|utils/gpu/packGalaxyPointUniforms" src tests tools docs`
      shows prose hits only (docs are 04e's); `rg -n "package::" src --glob '*.wesl' | rg -i galaxy` is empty;
      `rg -n "\?static" src/layers/galaxyCatalog/render` resolves to `src/services/gpu/shaders/…`.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog layerImportBoundary oneSymbolPerFile filenameMatchesExport frameFilePurity` green
      (the outbound sweep now reaches the moved files: `famousGalaxiesMetaSlot.ts`'s `src/state` import
      fails it — expected; Task 3 removes it. If the dispatch cannot leave a red ratchet between
      commits, land Tasks 2 and 3 as one dispatch with two commits and run the ratchet after 3).
- [ ] Commit (two commits allowed: the manifest move, then the sweep).

## Task 3 — the runtime: `create`, `destroy`, `passes`, `assets`, the prelude in `frame`, the hi-res fold, the famous-meta fact

**review: yes** — Redux state (the fact), the slot lifecycle (Ruling 4), the destroy order, and the
`?worker` module graph; CI sees only the types.

**Files:** `src/layers/galaxyCatalog/{layer,create,destroy,frame}.ts`,
`src/layers/galaxyCatalog/types/{GalaxyCatalogRuntime,GalaxyCatalogFacts}.ts`,
`src/layers/galaxyCatalog/load/galaxyCatalogAssetRows.ts` (new); every file under
`src/layers/galaxyCatalog/{render,subsystems,passes,load}/` (closures over the runtime; header cuts);
`src/@types/engine/layer/GalaxyCatalogBridge.d.ts` (new); `src/compositions/app.ts`;
`src/services/engine/engine.ts:31,37,57,169-170,198-199,215,243-258,325,328,347,406-407,493-509,533-552,576-578,584-591`;
`src/services/engine/gpuHandles/gpuHandleRegistry.ts` (the five galaxy rows and their imports;
`pickProgram` stays); `src/services/engine/phases/initGpu.ts:93`; `src/services/engine/phases/wireSlots.ts:100-135`
(the galaxy mint loop, the impostor block, the hi-res mint, the synthetic gate) and its header;
`src/services/engine/wiring/assetWiring.ts:13,23-24,32,39,82-110,224-232,344,361+` (the eleven
galaxy rows and the companion row); `src/services/engine/frame/runFrame.ts:36,222-262`;
`src/services/engine/helpers/shouldKeepTicking.ts:47`; `src/@types/engine/handles/{EngineGpuHandles,EngineSubsystemHandles}.d.ts`,
`src/@types/engine/state/EngineAssetSlots.d.ts`, `src/@types/engine/data/{EngineData,GalaxyStore}.d.ts`,
`src/services/engine/data/createGalaxyStore.ts` (delete), `src/@types/engine/ResolveDeps.d.ts:1,7,15`
(`catalogs` goes; Task 4 re-points the row), `src/@types/loading/RequestKey.d.ts` (Ruling 7),
`src/state/engine/engineSlice.ts:117-121,198`, `src/state/engine/selectors.ts:34,66-71`,
`src/components/containers/CommandPaletteContainer.tsx:16,30,48-53`, the engine-slice state type
(verify at dispatch, Ruling 6), `tests/**` mirrors of every file above (fixtures: `createTestStore.ts`,
`engine.destroyOrder.test.ts`, `engine.tier-swap-race.test.ts`, `hoverPickDriver.test.ts`,
`engineSlice.test.ts:43`, `runFrame.test.ts`, `shouldKeepTicking.test.ts`, `gpuHandleRegistry.test.ts`,
`initGpu.hdrCapabilityWiring.test.ts`, `assetWiring.test.ts`, `demandTable.test.ts`, `wireSlots.test.ts`,
`tests/layers/galaxyCatalog/**`).

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own
symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only. The
Layer's `passes/*.ts` keep one export each.

**Produces:**

```ts
// src/@types/engine/layer/GalaxyCatalogBridge.d.ts — Ruling 5; the shell's two read paths for one PR
export type GalaxyCatalogBridge = {
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly pgcAlias: AssetSlot<PgcAliasMap, PgcAliasReq>; // verify at dispatch: the slot's req type name
};

// src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts — plain fields, mutable where a commit writes them
export type GalaxyCatalogRuntime = GalaxyCatalogBridge & {
  readonly catalogs: Map<SourceType, GalaxyCatalog>; // ex-GalaxyStore.catalogs
  famousMeta: readonly FamousGalaxyMetaEntry[]; // ex-GalaxyStore.famousMeta; also published
  readonly points: ReadonlyMap<SourceType, AssetSlot<GalaxyCatalog, GalaxyCatalogReq>>;
  readonly famousGalaxiesMeta: AssetSlot<FamousGalaxiesPayload, GalaxyCatalogReq>;
  readonly hiResFamous: AssetSlot<HiResFamousPair, HiResFamousReq>;
  readonly pointRenderer: GalaxyPointRenderer;
  readonly pickRenderer: GalaxyPickRenderer;
  readonly texturedDiskRenderer: TexturedDiskRenderer;
  readonly proceduralDiskRenderer: ProceduralDiskRenderer;
  readonly diskRadiusRing: DiskRadiusRing;
  readonly galaxyAtlas: GalaxyAtlasSubsystem;
  readonly texturedDisks: TexturedDiskSubsystem;
  readonly proceduralDisks: ProceduralDiskSubsystem;
  readonly diskPlannerWalk: DiskPlannerWalk;
  readonly biasCorrection: BiasCorrectionSubsystem;
  biasLastApplied: BiasMode; // Task 5's reconcile
  syntheticArmed: boolean; // Ruling 7
  readonly syntheticGate: Destroyable; // createSyntheticFallback's subscription
};

// src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts — Ruling 6
export type GalaxyCatalogFacts = { readonly famousMeta: readonly FamousGalaxyMetaEntry[] };

// src/layers/galaxyCatalog/layer.ts
export const galaxyCatalogLayer = defineLayer({
  name: 'galaxyCatalog',
  settings: galaxyCatalogLayerSettings, // Task 6; until then [galaxyCatalogsSettingsFragment] as const
  sources: GALAXY_CATALOG_SOURCE_ROWS,
  facts: { famousMeta: [] } as GalaxyCatalogFacts,
  create,
  destroy,
  passes,
  assets,
  fades,
  labels,
  selection,
  frame, // fades/labels/selection: Task 4; frame: prelude here, reconcile Task 5
});

// src/compositions/app.ts
export const APP_COMPOSITION = { layers: [galaxyCatalogLayer] as const, home: EARTH_HOME };
// verify at dispatch: EngineComposition<typeof APP_COMPOSITION.layers> still satisfies createEngine's parameter

// passes(runtime): the four passes, each a closure — `galaxyPointSpritesPass(runtime)`, etc.; names unchanged, FRAME_ORDER untouched
// assets(runtime): expandCompanionRows([ ...GALAXY_CATALOG_SOURCES.map((code) => pointRow(runtime, SOURCE_REGISTRY[code])),
//   { key: 'famousGalaxiesMeta', factory: () => runtime.famousGalaxiesMeta, companionOf: Source.FamousGalaxy },
//   { key: 'pgcAlias', factory: () => runtime.pgcAlias, demand: (ctx) => ctx.request('paletteOpened'), priority: <today's> },
//   { key: 'hiResFamous', factory: () => runtime.hiResFamous, req/demand/priority: today's assetWiring.ts:361+ row } ])
//   pointRow: today's derived row (04c Ruling 2) with the Synthetic branch's demand = () => runtime.syntheticArmed
```

**Behaviour:** `create(deps)` runs, in order: the point renderer (`deps.ctx`, `deps.fadeBgl`,
`deps.sourceBgl`), the bias subsystem constructed over it (no `attachRenderer` step: the renderer is
a constructor dep now; `getMode` reads `runtime.biasLastApplied`, `catalogs` reads
`runtime.catalogs`), the textured and procedural disk renderers, the ring, the pick renderer
(`deps.focusBgl`, `deps.focusUniform.bindGroup`, `SLAB_REVERSED_Z[COSMO]`), the atlas → planners →
walk cluster (`wireImpostorSubsystems`' body, returning the objects instead of assigning
`state.subsystems`), the nine point slots (`wireGalaxyCatalogSourceSlot`'s body: commit uploads to
`runtime.pointRenderer`, writes `runtime.catalogs`, calls `deps.reportSourceCount`, calls
`deps.fades`' per-item re-sync through the registry it already receives — verify at dispatch what
the commit calls today at `wireGalaxyCatalogSourceSlot.ts:57-70` and map each call to a `deps` field;
a call with no `deps` equivalent is a STOP, not a new field), the famous-meta slot (commit writes
`runtime.famousMeta` and `deps.publish({ famousMeta: [...meta] })`; error writes and publishes `[]`),
the pgc-alias slot, the hi-res slot (`wireHiResFamousSlot`'s body over `deps.ctx.device` and
`runtime.texturedDiskRenderer`; `commit` per Ruling 4; `requestRender` = `deps.requestRender`), and the
synthetic gate (`createSyntheticFallback` over `runtime.points`, setting `runtime.syntheticArmed`
and calling `deps.requestRender`). `destroy(runtime)` is `engine.ts:533-552,576-578` verbatim on the
runtime, plus `runtime.hiResFamous.committed()`'s pair (subsystem before texture) and every slot's
`release()`/`destroy()` in the order the slot API requires (verify at dispatch), then the renderers.
`frame(runtime)` returns the closure that runs `runFrame.ts:222-262` (hi-res `runFrame` over
`runtime.hiResFamous.committed()?.subsystem`, then the shared walk) and returns
`runtime.texturedDisks.hasInFlightWork()` (the `shouldKeepTicking.ts:47` term); the bias compare is
Task 5. `engine.ts` seeds no galaxy field, constructs no bias subsystem, registers nothing galaxy, and its
`getCloud` / `getCloudObjIds` / `loadPgcAliasesFn`
read `galaxyBridgeOf(state)` (a local helper; `undefined` before `createLayers` → the same
`undefined` / empty-map results the shell tolerates today). `resolveDeps()` loses `catalogs`.

**Three core sites are deleted here and re-added on the Layer in Task 4**, so this commit is `tsc`
green on its own: the `famousLabels` registration (`engine.ts:372-375`; `produceFamousGalaxyLabels`
loses its `state.data.galaxies` read at `:166` and takes the runtime — its one caller is the Layer
from Task 4), the galaxy row in `coreSelectionRows.ts:7,18` (`galaxyCatalogSelectionRow` takes the
runtime; the `catalogs` read at `:40,48,75-76,148` re-points), and the two galaxy rows in
`fadeLayers.ts:99-106,148-157` (with the `GALAXY_CATALOG_IDS` import at `:18`). Between this commit
and Task 4 the app draws galaxies but has no famous labels, no galaxy picking and no galaxy fades —
one commit inside one PR, never a landed state. The
two outbound-ratchet imports die: the meta slot's action import (the fact replaces it) and — verify
at dispatch — any `src/state` import in `createSyntheticFallback.ts` or `wireGalaxyCatalogSourceSlot.ts`
(`cb.store.dispatch(engineSourceCountReported…)` becomes `deps.reportSourceCount`). Module headers of
the moved wiring files drop to ≤ 5 lines (the wiring they narrated is this task's diff).

The 192-byte pick image (`pickUniformBytesOf`, `packGalaxyPointUniforms`, `UNIFORM_BYTES`) is now
private to `render/`; `src/services/gpu/lib/cameraUniforms.ts`, `src/data/pickPaddingPx.ts` and
`EnginePickingState.d.ts` keep only prose references (verify at dispatch; a code import there is a
STOP).

- [ ] Adapt `wireHiResFamousSlot.test.ts` (now under `tests/layers/galaxyCatalog/load/`): the
      existing "previous pair destroyed after hand-over, subsystem before texture" assertion is
      re-pointed at `slot.committed()` (Ruling 4) — the real bug is the mirror's removal leaving the
      previous pair alive (a leaked hi-res array texture per tier swap).
- [ ] Adapt `famousGalaxiesMetaSlot.test.ts`: `commit publishes a copy of the meta and error publishes []`
      — assert `publish` was called with an array that is not the payload's array by identity (immer
      freezes what the reducer stores; a shared reference freezes the runtime's copy too, and the
      next `setHiResFamous` fold would throw on write). Replaces the dispatch assertion.
- [ ] Fixture sweep, no new assertion: `createTestStore.ts`, `hoverPickDriver.test.ts`,
      `engine.destroyOrder.test.ts` (asserts the same order on the runtime), `engine.tier-swap-race.test.ts`,
      `runFrame.test.ts`, `shouldKeepTicking.test.ts:47`'s case dies with its term, `gpuHandleRegistry.test.ts`
      and `initGpu.hdrCapabilityWiring.test.ts` totality shrink by five rows, `assetWiring.test.ts` /
      `demandTable.test.ts` boot sets lose the galaxy keys, `wireSlots.test.ts` loses its galaxy stubs,
      `engineSlice.test.ts:43` dies with the reducer, the palette container test reads the fact.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog createLayers engine runFrame assetWiring demandTable wireSlots gpuHandleRegistry initGpu engineSlice CommandPalette layerImportBoundary frameFilePurity` green.
      Boot the dev server (`/link-data`): the nine sources render, a tier swap re-commits, famous
      thumbnails and hi-res appear on approach — the `?worker` and `?static` imports now sit in the
      store's module graph through `APP_COMPOSITION`, and a TDZ cycle or a worker-loader gap shows
      here first, not in `tsc`. Commit.

## Task 4 — `fades`, `labels`, `selection` close over the runtime

**review: yes** — the deep-link resolver (Redux/saga area): a galaxy id arriving before
`createLayers` is claimed by no row until the Layer exists.

**Files:** `src/layers/galaxyCatalog/present/galaxyCatalogFadeRows.ts` (new),
`src/layers/galaxyCatalog/present/{produceFamousGalaxyLabels,galaxyCatalogSelectionRow,extractGalaxyRow}.ts`,
`src/layers/galaxyCatalog/layer.ts` (the three hooks); `src/services/engine/wiring/fadeLayers.ts`'s
`layer()` row helper — verify at dispatch: if it is module-local, extract it to
`src/utils/animation/fadeLayerRow.ts` (one symbol) so both callers share it; do not import
`wiring/fadeLayers.ts` from the Layer. The core-side deletions already happened in Task 3
(`engine.ts:372-375`, `coreSelectionRows.ts:7,18`, `fadeLayers.ts:18,99-106,148-157`); this task
restores the three behaviours from the Layer. Tests `fadeLayers.test.ts`, `coreSelectionRows.test.ts`,
`composeSelectionRows.test.ts:68-86`, `resolveFocusId`'s composed-resolver test, and the three moved
tests under `tests/layers/galaxyCatalog/present/`.

**Produces:**

```ts
// present/galaxyCatalogFadeRows.ts — the two rows of fadeLayers.ts:99-106,148-157, guard over the runtime
export function galaxyCatalogFadeRows(runtime: GalaxyCatalogRuntime): readonly FadeLayer<unknown>[];
//   'surveyLabel' unchanged; 'survey' guard: (_, id) => runtime.pointRenderer.hasCatalog(id)

// present/galaxyCatalogSelectionRow.ts — was (deps: ResolveDeps); catalogs/famousMeta now read the runtime
export function galaxyCatalogSelectionRow(
  runtime: GalaxyCatalogRuntime,
): SelectionKindRow<GalaxyRef>;

// present/produceFamousGalaxyLabels.ts — was reading state.data.galaxies (line 166)
export function produceFamousGalaxyLabels(
  runtime: GalaxyCatalogRuntime,
): Label2DProducer['produceLabels'];
// labels(runtime) → [{ id: 'famousLabels', produceLabels: produceFamousGalaxyLabels(runtime) }]
```

**Behaviour:** `layer.ts` declares `fades: galaxyCatalogFadeRows`, `labels`, `selection: (runtime) =>
[galaxyCatalogSelectionRow(runtime)]`. The fade keys (`survey`, `surveyLabel`) and the handle shapes are
unchanged, so `VisibilityLayerKey`, `visibilityLayerRows.ts` and the tour's visibility actions see
the same rows through `state.fadeRows`. The label producer's id is unchanged (the director keys by
id). `extractGalaxyRow` takes the meta from the runtime instead of an optional argument.

Deep links: `composeSelectionRows` resolves against `state.selectionKindRows`, which gains the galaxy
row only when `createLayers` runs. Verify at dispatch how the composed resolver treats an id no row
claims during the boot window (before `createLayers`): if it defers (as a claimed id with a null
`decode` does), nothing changes; if it resolves to "unknown" and drops the id, the focus-id gate must
wait for `state.layers` to be populated — the DoD's "deep link by pgc-/famous id" check is the pin,
and the reviewer reads `resolveFocusRefDeferring` against D6'2.

- [ ] Adapt the three moved tests to take a runtime fixture (a `Map` and an array) instead of a
      `ResolveDeps` / `EngineState` cast; no new assertion — the behaviours (claims, decode deferral,
      label placement) are the ones already pinned.
- [ ] `fadeLayers.test.ts`'s per-layer seed pins for the two galaxy keys move to the Layer's fade-row
      test file; `coreSelectionRows.test.ts` expects five rows.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog fadeLayers coreSelectionRows composeSelectionRows resolveFocus syncVisibilityFades` green. Commit.

## Task 5 — the bias reconcile in `frame`; the saga and the effect die

**review: yes** — Redux sagas and the reconcile seam (state landmines: "saga puts late").

**Files:** `src/layers/galaxyCatalog/frame.ts`, `tests/layers/galaxyCatalog/frame.biasReconcile.test.ts`
(new); `src/store/effects/watchBiasBakeSaga.ts` + `tests/store/effects/watchBiasBakeSaga.test.ts`
(delete); `src/store/rootSaga.ts:16,39`; `src/store/effects/ReconcileEffects.ts:17,32,37`;
`src/services/engine/wiring/makeReconcileEffects.ts:22` + `tests/services/engine/wiring/makeReconcileEffects.test.ts`
(the `bakeBias` case dies).

**Behaviour:** `frame(runtime)`'s closure compares `state.settings.bias.mode` with
`runtime.biasLastApplied` each frame; on a difference it sets `biasLastApplied` first, then calls
`runtime.biasCorrection.setMode(mode)` (the bake is async and may throw into a warning; a compare
that waits for the bake would re-fire every frame during it). `absMagLimit` reaches the subsystem the
way it does today (verify at dispatch: through `BiasCorrectionDeps` or the mode call). The saga, the
effect field and its `makeReconcileEffects` line go; `rootSaga` forks one saga fewer.

- [ ] Test `the frame hook re-bakes once per bias-mode change, not per frame` — drive the closure
      three frames at mode A, then two at mode B; assert `setMode` was called once, with B. Real bug:
      the compare written against the subsystem's own async `getMode` (which lags the bake) re-bakes
      every frame for the bake's duration — a ~200 ms worker job per frame, invisible to the suite.
- [ ] `npm run typecheck:fast`; `npm test -- layers/galaxyCatalog rootSaga makeReconcileEffects ReconcileEffects` green. Commit.

## Task 6 — `bias` and `thumbnails` become Layer settings clusters

**Files:** `src/layers/galaxyCatalog/settings/{biasSettings,thumbnailsSettings,galaxyCatalogLayerSettings}.ts`
(new), `src/layers/galaxyCatalog/layer.ts` (`settings: galaxyCatalogLayerSettings`);
`src/@types/settings/CoreSettingsState.d.ts:42-50`, `src/state/settings/coreInitialSettings.ts:72-78`,
`src/state/settings/settingsSlice.ts:22,34,95-105,245-246`; tests `tests/state/settings/settingsSlice.test.ts`
(the bias/thumbnails cases move to `tests/layers/galaxyCatalog/settings/`), `tests/conventions/layerImportBoundary.test.ts`
(unchanged — the row's number must hold).

**Produces:**

```ts
// settings/biasSettings.ts — the shape galaxyCatalogsSettings.ts:52 uses
export const biasSettingsFragment = {
  key: 'bias',
  initialState: { mode, absMagLimit },
  reducers: { setBiasMode, setBiasAbsMagLimit },
} as const;
export const thumbnailsSettingsFragment = {
  key: 'thumbnails',
  initialState: { enabled },
  reducers: { setThumbnailsEnabled },
} as const;
// settings/galaxyCatalogLayerSettings.ts
export const galaxyCatalogLayerSettings = [
  galaxyCatalogsSettingsFragment,
  biasSettingsFragment,
  thumbnailsSettingsFragment,
] as const;
```

**Behaviour:** state paths (`settings.bias.mode`, `settings.thumbnails.enabled`) and action creator
names are unchanged, so `GalaxiesSectionContainer`, `state/settings/selectors.ts`, the three passes
and the URL/persistence layer need no edit (verify at dispatch: `liftClusterReducers` keeps the
reducer key as the action creator name — `galaxyCatalogs`' lifted reducers are the precedent).
`settingsSlice.ts:22` imports `galaxyCatalogLayerSettings` instead of the one fragment and spreads
the tuple into `liftClusterReducers`; its inline `bias`/`thumbnails` reducers at `:95-105` go, as do
the two clusters in `CoreSettingsState` and `coreInitialSettings`. `APP_SETTINGS_FRAGMENTS` gains the
two fragments through `settingsOf` with no edit. The ratchet row for `settingsSlice` keeps its
number: one import replaces one import (verify at dispatch that the ratchet counts import
statements, not specifiers; if specifiers, keep the count by importing the tuple only).

- [ ] No new test: the fragment-uniqueness and seeded-keys tests already cover a derived tuple
      (P1); the moved reducer cases are fixtures, not new assertions.
- [ ] `npm run typecheck:fast`; `npm test -- settings layerImportBoundary initialSettings` green. Commit.

## Task 7 — the sweep: leftovers, ratchets, spec §14, backlog

**Files:** `src/services/engine/phases/wireSlots.ts:1-60` (header: no galaxy sentence survives),
`src/services/engine/engine.ts` (comments naming the deleted fields; the destroy block's ordering
comment at `:537-540` is gone with the block), `src/@types/engine/frame/PassState.d.ts` (header),
`src/@types/loading/AssetKey.d.ts:17` (the `'famousGalaxiesMeta'` member stays — it is a slot key —
confirm no dead members), `src/@types/loading/DemandCtx.d.ts:30` (the `request` doc names one key),
`docs/superpowers/specs/2026-09-09-layer-composition-design.md` §14 (three rows: Ruling 1, Ruling 6,
Ruling 8 — each "spec said X / plan did Y / why"), `docs/BACKLOG.md` (no item is consumed here that
04c did not already; confirm with `rg -n "galaxy" docs/BACKLOG.md` and touch nothing unrelated).

- [ ] `rg -n "state\.data\.galaxies|GalaxyStore|subsystems\.(galaxyAtlas|texturedDisks|proceduralDisks|diskPlannerWalk|hiResFamous|biasCorrection)|gpu\.(galaxyPoint|galaxyPick|texturedDisk|proceduralDisk|diskRadiusRing)|assetSlots\.(points|famousGalaxiesMeta|pgcAlias|hiResFamous)|engineFamousGalaxiesMetaReported|selectFamousGalaxiesMeta|watchBiasBakeSaga|bakeBias|syntheticFallback'" src tests tools`
      is empty (prose in `docs/` is 04e's).
- [ ] Ratchets: `layerImportBoundary.test.ts` byte-identical to `55a3bd33e`; `frameFilePurity.test.ts`'s
      allow-list unchanged (the four galaxy passes were never listed; their files left the sweep);
      `oneSymbolPerFile`, `filenameMatchesExport` green over `src/layers/galaxyCatalog/types/`.
- [ ] `npm run typecheck` (both projects, `tsc`), `npm run build`, `npm test` green. Commit.

---

## Definition of Done

**Deliverable inventory**

- [ ] `src/layers/galaxyCatalog/layer.ts` exports `galaxyCatalogLayer` via `defineLayer` with
      `name`, `settings` (three fragments), `sources` (the 04c tuple), `facts` (`{ famousMeta: [] }`),
      `create`, `destroy`, `passes`, `assets`, `fades`, `labels`, `selection`, `frame`; no `ui`
      (Ruling 8), no `targets`, no `sagas`. `APP_COMPOSITION.layers` is `[galaxyCatalogLayer]`.
- [ ] `LayerInstance` carries `runtime`, `passes`, `assets`, `fades`, `labels`; `EngineState` carries
      `passes`, `assetRows`, `fadeRows`, `layerSlots`; `createLayers` composes them and registers
      label producers.
- [ ] Core is galaxy-free: no galaxy member on `EngineGpuHandles`, `EngineSubsystemHandles`,
      `EngineAssetSlots`, `EngineData` (`galaxies` gone; `structures`, `bodies` stay), `GPU_HANDLE_ROWS`
      (five rows fewer; `pickProgram` keeps `constructPhase: 'wireInput'`), `ASSET_WIRING` (eleven rows
      fewer), `FADE_LAYERS` (two fewer), `CONTENT_PASSES` (four fewer; `FRAME_ORDER` unchanged),
      `coreSelectionRows` (five rows), `ResolveDeps` (no `catalogs`); `engine.ts` seeds, constructs,
      registers and destroys nothing galaxy; `initGpu.ts` has no `attachRenderer`; `wireSlots.ts` has
      no galaxy mint loop, impostor block, hi-res mint or synthetic gate.
- [ ] Deleted: `src/services/biasCorrection/`, `createGalaxyStore.ts`, `GalaxyStore.d.ts`,
      `watchBiasBakeSaga.ts` (+ test), `ReconcileEffects.bakeBias`, the `makeReconcileEffects` line, the
      `rootSaga` fork, `engineFamousGalaxiesMetaReported`, `CoreEngineSliceState.meta.famousGalaxies`,
      `selectFamousGalaxiesMeta`, `RequestKey`'s `'syntheticFallback'`, `EngineSubsystemHandles.hiResFamous`
      / `.hiResFamousTexture`, `rebuildOnSwapFormat` on the ring (the row itself is gone).
- [ ] Still present, by design (04e's): `EngineHandle.sources` / `.selection` (reading
      `GalaxyCatalogBridge`), `useAliasIndex`, `useStructureMemberCount`, `engineHandleRef`,
      `RequestKey` = `'paletteOpened'`, `ctx.request`, `GalaxiesSectionContainer` rendered by hand in
      `SettingsPanel.tsx`, `SOURCE_REGISTRY` in `src/data/sources.ts`, the id types in
      `src/@types/data/galaxyCatalog/`.
- [ ] Four new assertions exist (Tasks 1, 3 ×2, 5); every moved test lives under
      `tests/layers/galaxyCatalog/`.

**Named observable behaviours** (user-attested on the branch's dev server with `/link-data`;
f.lux off for the thumbnail check)

- [ ] Boot: the app reaches the Earth home with no console error; DebugPanel › assets lists the nine
      `<id>-points` slots, `famousGalaxiesMeta` right after `famousGalaxy-points`, `pgcAlias` idle,
      `hi-res-famous` — the same names as on `main`.
- [ ] Nine sources render: with every galaxy catalog enabled at 200 Mpc, the point cloud matches
      `main` by eye; toggling SDSS off fades it (the `survey` fade row); toggling Famous › Labels off
      fades the names (the `surveyLabel` row).
- [ ] Tier swap small ↔ medium: catalogs re-commit in place, no black frame; after the swap the
      famous thumbnails and the hi-res array are back (DebugPanel › assets: `hi-res-famous` ready
      once, not twice).
- [ ] Famous thumbnails + hi-res on approach: fly to M87 from 30 Mpc; the atlas quad appears, then the
      hi-res texture swaps in without a flicker (the `frame` order: hi-res before the shared walk).
- [ ] Bias mode change re-bakes: Settings › Galaxies › bias mode from `none` to the corrected mode;
      the cloud re-weights once within a second and the DevTools worker list shows one Schechter
      worker, not one per frame.
- [ ] Disk-radius ring overlay: DebugPanel's ring toggle draws the ring on the selected galaxy; then
      toggle HDR (the swap-format path) and the ring still draws (Ruling 9).
- [ ] Pick a galaxy: hover highlights, click selects, InfoCard shows the row (`extractGalaxyRow` over
      the runtime); pick a structure ring and the Milky Way — unchanged from 04c.
- [ ] Deep link by `pgc-` and by famous id: open `#focus=pgc-<n>` and `#focus=m87` in a fresh tab;
      both select once their catalog lands (Task 4's boot-window check).
- [ ] Cmd+K lists famous galaxies (the palette reads the fact) and PGC aliases resolve after the first
      open (`pgcAlias` demand raised through the bridge).
- [ ] Synthetic fallback offline: block `*.bin` in DevTools and reload; the synthetic cloud appears
      (Ruling 7's flag).
- [ ] Paired `npm run perf` A-B-A-B (`full-survey`, `milky-way`, `solar-system`) against `main`'s
      server: CPU frame time within noise; the four galaxy passes' GPU timings present under the same
      names.

**The deferral boundary** — see Deferred. Nothing under `src/components/` moves; no fact beyond
`famousMeta` is published; `EngineHandle` keeps `sources` and `selection`; no `galaxiesOnly`
composition exists; no docs under §15 are updated; the deletion audit is not run.

## Deferred

**04e (the shell channel and the reference engine):** the facts `provenanceCounts`, `aliasIndex`
(with `buildAliasIndex` into the Layer and PGC stored as a number) and `structureMemberCount` (a
frame reconcile over `runtime.catalogs`, keyed on the selected structure, the catalogs version and
the visible mask — spec D6); the deletions of `EngineHandle.sources` / `.selection`,
`GalaxyCatalogBridge`, `galaxyBridgeOf`, `LayerInstance.runtime`, `useAliasIndex`,
`useStructureMemberCount`, `engineHandleRef`, `RequestKey` + `ctx.request` + `state.requests` (the
`pgcAlias` demand flips to `ui.paletteOpen`); D13's `ui` with the module-cycle fix (Ruling 8) and
`GalaxiesSection(+Container)` into `ui/`; `galaxiesOnly.ts` + its `tools/` entry; §15 docs
(`add-data-source` skill, RENDERER.md, CLAUDE.md, DATA.md's galaxy folder line); the deletion audit.

**Later, unruled by this sequence:** `composeSources(layers)` and the composed `SOURCE_REGISTRY`'s
home (Ruling 1: needs the ten `src/data/` readers of galaxy entries to stop reading at module init
first); `GalaxyCatalogId` and friends into the Layer's `types/` (blocked by the `state` and
`animation` importers); the timing layout's static shape if Ruling 2 lands its second branch.

**Adjacent, unruled** (ask the user, per the adjacent-findings rule; not planned): the
`?worker` and `?static` imports now sit in the store's module graph through `APP_COMPOSITION` —
every store test evaluates the renderer modules; if that shows in suite time, the composition could
take Layers as thunks. `instancedQuadRenderer.ts:101`'s second `UNIFORM_BYTES = 96` (04c adjacent)
now lives beside the first inside one folder.
