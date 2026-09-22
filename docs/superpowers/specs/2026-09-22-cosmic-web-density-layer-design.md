# The `cosmicWebDensity` Layer — design spec

Decisions ledger: [`docs/grill-sessions/cosmic-web-density-layer-2026-09-22.md`](../../grill-sessions/cosmic-web-density-layer-2026-09-22.md) (Q1–Q15, final). This spec does not re-litigate those calls; it specifies how PR 2 lands them. Cited as "grill Qn"; the user's rulings on the draft are listed in §13.

Parent: [`2026-09-09-layer-composition-design.md`](2026-09-09-layer-composition-design.md) §10(e), the `volume` stub. Addendum: everything the parent says about the `Layer` contract, `createLayers`, facts and selection rows holds unless a section below says otherwise. Shape precedent: [`completed/2026-09-21-star-catalog-layer-design.md`](completed/2026-09-21-star-catalog-layer-design.md).

## 1. What this is

`src/layers/cosmicWebDensity/` is formed from its settings-only stub and takes ownership of the Physarum density cubes (MCPM, Polyphorm 2MRS, the MCPM workbench export): sources, slots, ingest, fade rows, one renderer instance, its own target + upsample, both passes and two UI sections (grill Q5, Q7, Q8). The scalar-volume **renderer, pass factory and liveness core stay generic core mechanism** that the Milky Way dust Layer instantiates later (grill Q5). The sibling `cosmicWebFilaments` gains its own settings section (grill Q7).

PR 2 opens by moving boot visibility and intensity out of the source registry into app state for every Layer (§5), a whole backlog item picked up as its own commit.

Behaviour is pixel-identical except: the Style picker is gone, the Cosmic web section splits in two, the per-cube sliders move to the DebugPanel, and the density pass is toggleable in the DebugPanel.

## 2. Ground preparation

### PR 1 (#810, done)

Refactor-ground ran as the grill itself (grill Q14 ruled the prep PR, no deletion audit). PR 1 commits on `worktree-volume-layer`, all behaviour-neutral except two datasets gone:

| Commit | What it did | Grill |
|---|---|---|
| DEV synthetic volumes deleted | `debug-*` rows, codes 12/13/14 retired, `syntheticVolumeSlots`, fetcher, generator, `maybeLazyLoadDebugVolume`, the fade row's guard short-circuit + `post`; `binBaseName` non-null | Q1 |
| CF4 density cube deleted | source row, `Source.Cf4Density` retired, fetcher, slot, wiring row, R2 allow-list, three tools, e2e spec, `DATA.md` rows; raw `.npy` + registry key kept for `buildFlowField` | Q4 |
| `volume` → `cosmicWebDensity` | settings cluster, selectors, actions, types (`CosmicWebDensityFieldId`, `…SourceEntry`, `…Settings`), fade ids `cosmicWebDensity` / `cosmicWebDensityField`, visibility keys, source-row `type` | Q9, Q11 |
| `filaments` → `cosmicWebFilaments` | Layer folder, cluster, fade id, visibility key | Q10, Q11 |

### PR 2 commit order

| # | Commit | Gate |
|---|---|---|
| 1 | Registry `visible` / `intensity` → app state (§5), deletes `docs/backlog/2026-09-21-registry-visible-intensity-to-app-state.md` and its `docs/BACKLOG.md` index line | `INITIAL_SETTINGS` dump byte-identical before/after |
| 2 | Generic renderer, pass factory, pure liveness core (§4) | suite green, core still owns the instance |
| 3 | Layer formed: sources, state defaults, load, passes, fades move; core rows deleted (§3, §6, §8) | suite green, ratchets green |
| 4 | UI split (§7) | suite green |
| 5 | Docs (§10) | — |

The plan may split rows further; commit 1 stays first and alone.

### Verdicts for PR 2's touchpoints

| Touchpoint | Verdict | Joint |
|---|---|---|
| Boot state read from the source registry | bolt-on | Layer `initialState` literals (§5) |
| Target + upsample owned by a Layer | growth | `Layer.targets`, `createUpsamplePass` (ZoA precedent) |
| Slots, asset rows, fade rows, sources, `ui` main/debug | growth | existing members (galaxyCatalog / starCatalog per-row precedent) |
| Pass bound to one global renderer | bolt-on | `createScalarVolumePass` (§4.2) |
| Liveness reads `settings.cosmicWebDensity` | bolt-on | pure `deriveVolumeLiveness` (§4.3) |
| Renderer reads the cosmic-web registry inside `upload` | bolt-on, found after the grill | `upload` takes the statics; renderer generic over `Id` (§4.1) |
| Ingest dispatches into the Layer's own slice | deleted | the dispatch is a no-op; the ingest is a plain `renderer.upload` (§6) |

No new `Layer` contract member is needed: `targets`, `passes`, `assets`, `fades`, `ui` (`main` + `debug`) all exist in `Layer.d.ts`.

## 3. The Layer folder

| File | Member | Moved from |
|---|---|---|
| `layer.ts` | `defineLayer({ name: 'cosmicWebDensity', settings, sources, targets, create, destroy, passes, assets, fades, ui })` | stub `state/` only |
| `create.ts` | `create` — renderer, upsample, one slot per source row | `gpuHandleRegistry.ts` rows `volumeFieldRenderer` / `volumeUpsample`; slot files |
| `destroy.ts` | `destroy` — `renderer.destroy()`, `upsample.destroy()` | new |
| `state/cosmicWebDensity/{slice,initialState,selectors}.ts`, `state/slices.ts` | `settings` | already here (PR 1) |
| `state/defaults.ts` | `getVolumeFieldDefaults` / `buildVolumeFieldSettings` | `src/data/volume/volumeFieldDefaults.ts` (filters `type: 'cosmicWebDensity'`, so it is the Layer's; no tool imports it) |
| `sources/mcpm.ts`, `sources/polyphorm-2mrs.ts`, `sources/mcpm-workbench.ts`, `sources/cosmicWebDensitySourceRows.ts` | `sources` | `src/data/sources/*`; `data/sources.ts` swaps the `UNFORMED_` rows for `sourceRecordOf(COSMIC_WEB_DENSITY_SOURCE_ROWS)` |
| `load/cosmicWebDensityAssetRows.ts` | `assets` | `assetWiring.ts` rows `mcpm` / `polyphorm2Mrs` / `mcpmWorkbench` + the three `*_FIELD` constants |
| `load/createCosmicWebDensitySlot.ts` | per-row slot factory (§6) | `services/loading/slots/{mcpmSlot,polyphorm2MrsSlot,mcpmWorkbenchSlot}.ts` |
| `load/cosmicWebDensityFetcher.ts`, `load/cosmicWebDensityRequest.ts` | the one fetcher + its request builder (§6) | `services/loading/fetchers/{mcpm,polyphorm2Mrs,mcpmWorkbench}Fetcher.ts` |
| `passes/cosmicWebDensityPass.ts` | `passes` | `frame/passes/scalarVolumePass.ts` → `createScalarVolumePass` row |
| `passes/cosmicWebDensityUpsamplePass.ts` | `passes` | `frame/passes/volumeUpsamplePass.ts` → `createUpsamplePass` row |
| `present/deriveCosmicWebDensityLiveness.ts` | shared gate of both passes | the state reads of `frame/volumeLiveness.ts` (master, recession, camera distance) |
| `present/cosmicWebDensityFadeRows.ts` | `fades` | `fadeLayers.ts` rows `cosmicWebDensity` + `cosmicWebDensityField`, `volumeFieldIds()` |
| `ui/CosmicWebDensitySection.tsx` + `…Container.tsx` | `ui` `main` | master + enable half of `CosmicWebSection.tsx` / `VolumeFieldRow.tsx` |
| `ui/CosmicWebDensityTuningSection.tsx` + `…Container.tsx` + `ui/DensityFieldTuningRow.tsx` (+ `.module.css`) | `ui` `debug` | slider half of `VolumeFieldRow.tsx` |
| `ui/projectVolumeFieldRows.ts` | row projection for both sections | `src/state/settings/projectVolumeFieldRows.ts` |
| `@types/CosmicWebDensityRuntime.d.ts`, `@types/CosmicWebDensityReq.d.ts` | Runtime, request | new |
| `@types/CosmicWebDensitySettings.d.ts`, `@types/VolumeFieldRowData.d.ts` | Layer-only types | `src/@types/settings/` |

`COSMIC_WEB_DENSITY_SOURCE_ROWS` is the one list: slots, asset rows, fade rows and both sections map over it, as the star section maps `STAR_CATALOG_IDS`. There is no second named list of ids and no presentation field on the row.

`cosmicWebFilaments/` gains `ui/CosmicWebFilamentsSection.tsx` + `…Container.tsx` (`ui: [{ slot: 'main', … }]`): header toggle = `cosmicWebFilaments.enabled`, the intensity slider shown while on. Its `layer.ts` header loses the "UI moves with density" paragraph.

`APP_COMPOSITION` gains `cosmicWebDensityLayer` immediately before `cosmicWebFilamentsLayer`, so the two `main` sections sit adjacent ("Cosmic web density", "Cosmic web filaments"; grill Q10).

```ts
// src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime.d.ts
export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  readonly slots: Readonly<Record<CosmicWebDensityFieldId, AssetSlot<ScalarCube, CosmicWebDensityReq>>>;
};

// src/layers/cosmicWebDensity/@types/CosmicWebDensityReq.d.ts
/** `tier` is absent for an untiered row, so the request and the file it names cannot disagree. */
export type CosmicWebDensityReq = { readonly binBaseName: string; readonly tier?: Tier };

// layer.ts — the target row the core `volume` row becomes
targets: [{ id: 'cosmic-web-density', format: HDR_TARGET_FORMAT, depth: null, scale: 3,
            clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
```

## 4. Core mechanism changes

### 4.1 The renderer becomes generic

Grill Q5's table says the renderer "knows about cosmic web: no". It does, twice: `upload` calls `getVolumeFieldDefaults(id)` (a `type: 'cosmicWebDensity'` registry walk) for `paletteId` / `contrastCenter` / `envelope`, and its handle type is keyed by `CosmicWebDensityFieldId`. A second instance for dust could not upload. The joint:

```ts
// src/@types/rendering/VolumeFieldRenderer.d.ts
export type VolumeFieldRenderer<Id extends string = string> = {
  readonly label: string;
  /** `statics` are the per-cube, non-tunable presentation facts, read once here. */
  upload(id: Id, cube: ScalarCube,
         statics: Pick<VolumeFieldDefaults, 'paletteId' | 'contrastCenter' | 'envelope'>): void;
  unload(id: Id): void;
  hasActiveFields(settingsOf: (id: Id) => VolumeFieldSettings | undefined,
                  fadeOpacityOf?: (id: Id) => number): boolean;
  listIds(): Id[];
  draw(pass: GPURenderPassEncoder, viewProj: Mat4, viewportPx: Vec2, pxPerRad: number,
       cameraPosWorld: Readonly<Vec3>,
       settingsOf: (id: Id) => VolumeFieldSettings | undefined,
       fadeOpacityOf: (id: Id) => number): void;
  destroy(): void;
};

// volumeFieldRenderer.ts
export function createVolumeFieldRenderer<Id extends string>(
  device: GPUDevice, targetFormat: GPUTextureFormat, fadeBgl: FadeUniformsBgl,
): VolumeFieldRenderer<Id>;
```

`FieldEntry.id` widens to `string`. The renderer loses its `data/volume/volumeFieldDefaults` import. Blend stays baked-additive; the dust Layer adds a blend parameter when it needs one (grill Q5).

### 4.2 The pass factory

```ts
// src/@types/engine/frame/ScalarVolumePassRow.d.ts — twin of UpsamplePassRow
export type ScalarVolumePassRow<Id extends string> = {
  readonly name: string;
  /** `RenderTargetSpec.id` this raymarch draws into; its `sizeOf` is the viewport. */
  readonly targetId: string;
  readonly renderer: VolumeFieldRenderer<Id>;
  /** Shared with the upsample row's `enabled`; `null` = nothing live. */
  liveness(state: PassState, ctx: FrameView): VolumeFieldLiveness<Id> | null;
};

// src/services/engine/frame/passes/createScalarVolumePass.ts
export function createScalarVolumePass<Id extends string>(row: ScalarVolumePassRow<Id>): ContentPass;
```

The body is today's `scalarVolumePass` with `'volume'` → `row.targetId` and `state.gpu.volumeFieldRenderer` → `row.renderer` (the null check goes: the Layer's renderer is non-null by construction).

### 4.3 The pure liveness core

```ts
// src/@types/rendering/VolumeFieldLiveness.d.ts
export type VolumeFieldLiveness<Id extends string> = {
  readonly settingsOf: (id: Id) => VolumeFieldSettings | undefined; // clamped
  readonly fadeOpacityOf: (id: Id) => number;                       // × per-field bands
};

// src/utils/volume/deriveVolumeLiveness.ts — no state, settings or fade read inside
export function deriveVolumeLiveness<Id extends string>(
  renderer: VolumeFieldRenderer<Id>,
  fieldSettingsOf: (id: Id) => VolumeFieldSettings | undefined, // raw rows
  fadeOpacityOf: (id: Id) => number,                            // field fade × recessed master
  cameraDistanceMpc: number,
): VolumeFieldLiveness<Id> | null;
```

It clamps (`clampVolumeFieldSettings`), multiplies each field's `bands` at `cameraDistanceMpc`, and returns `null` unless `renderer.hasActiveFields(…)`. The Layer's `present/deriveCosmicWebDensityLiveness(runtime, state, ctx)` keeps the reads: master off-and-faded short-circuit, `resolveLayerOpacity` for the master and per field, `Math.hypot(ctx.drawCamPos)`. Same split as ZoA's `deriveZoneOfAvoidanceLiveness`.

### 4.4 Names

| Thing | Before | After |
|---|---|---|
| raymarch pass | `scalar-volume` | `cosmic-web-density` |
| target | `volume` | `cosmic-web-density` |
| upsample pass | `volume-upsample` | `cosmic-web-density-upsample` |

`FRAME_ORDER` (`frameSections.ts:95-99,120`) stays core-authored and takes the new strings; string-literal sites to sweep: `renderFrameSplitBaseline`, `decodeTimestampBuffer`, `renderFrame.timing` tests, `ReadyFrameContext` / `RenderTargetSpec` doc examples, `renderTargets.ts:507` comment. Shaders stay at `src/services/gpu/shaders/scalarVolume/`.

## 5. Boot visibility and intensity leave the registry (PR 2, commit 1)

A source row describes an asset, not what the app does with it at boot. `SourceEntryBase.visible` leaves every row; `intensity` leaves `ConstellationsSourceEntry`, `CosmicWebFilamentsSourceEntry` and `VolumeFieldDefaults`. Each value becomes a literal in the owning Layer's `initialState`, the flow convention (`src/layers/flow/state/defaults.ts`). No special casing per Layer.

Readers re-pointed (re-verified at `1eaf234df`):

| Reader | Becomes |
|---|---|
| `constellations/state/constellations/initialState.ts` (`visible`, `intensity`) | literals `enabled: false`, `intensity: 1.0` |
| `cosmicWebFilaments/state/cosmicWebFilaments/initialState.ts` (`visible`, `intensity`) | literals `enabled: false`, `intensity: 1.0` |
| `milkyWay/state/milkyWay/initialState.ts` (`visible`) | literal |
| `galaxyCatalog/state/galaxyCatalogs/initialState.ts` (`enabled: e.visible`) | `desiDeep` / `desiWedge` / `desiSgw` explicitly off, the rest on |
| `starCatalog/state/starCatalogs/initialState.ts`, `body/state/bodies/initialState.ts` (`enabled: e.visible`) | `enabled: true` (every row is `true` today) |
| `src/data/volume/volumeFieldDefaults.ts` `buildVolumeFieldSettings` (`visible`, `intensity ?? DEFAULT_VOLUME_FIELD_INTENSITY`) | returns only the registry-borne look fields; `cosmicWebDensity/initialState.ts` spells `items` as a `Record<CosmicWebDensityFieldId, VolumeFieldSettings>` literal over it (`mcpm` on, the other two off, `intensity: 1.0` each), and `seedVolumeFields` deletes |
| `src/data/exhibits/cosmicWeb.ts` (via `buildVolumeFieldSettings`) | spreads the initialState item instead |
| `src/utils/allVisibleMask.ts` (`SOURCE_REGISTRY[src].visible`) | folds `INITIAL_SETTINGS.galaxyCatalogs.items`, so the startup `drawMask` / `pickMask` cannot diverge from boot state |
| `tools/fetch/fetchPrebuiltData.ts` `volumeVisibilityByFileName` (`entry.visible`) | reads boot state for the density + flow `.scfd` files it decides (not galaxy catalogs, as the backlog item said) |

The `Record<CosmicWebDensityFieldId, …>` literal is compiler-complete, so it is not a second list that can drift from the rows. Tests that build rows with `visible` (`fetchPrebuiltData`, `sStarSource`, `demandTable`, `GalaxiesSection`, the two catalog slice tests, `tour.integration`) drop it. Registry comments that explain `visible` (`SourceEntryBase`, `gaia-stars`, `famous-star`, `flow`, the three cube rows) go with the field.

Gate: the `INITIAL_SETTINGS` dump is byte-identical before and after this commit. The commit deletes the backlog detail file and its `docs/BACKLOG.md` index line.

## 6. Load and the arrival-ordering invariant

One fetcher and one per-row slot factory serve all three cubes, driven by the source row, as `galaxyCatalogFetcher` + `wireGalaxyCatalogSourceSlot(entry)` and `createStarCatalogSlot` do:

```ts
// src/layers/cosmicWebDensity/load/cosmicWebDensityRequest.ts — `tiered` picks the shape
export function cosmicWebDensityRequest(entry: CosmicWebDensitySourceEntry, tier: Tier): CosmicWebDensityReq;

// src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher.ts — `binBaseName[-tier].scfd`
export const cosmicWebDensityFetcher: Fetcher<ScalarCube, CosmicWebDensityReq>;

// src/layers/cosmicWebDensity/load/createCosmicWebDensitySlot.ts
export function createCosmicWebDensitySlot(
  entry: CosmicWebDensitySourceEntry,   // id + statics
  renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>,
): AssetSlot<ScalarCube, CosmicWebDensityReq>;
```

The untiered workbench row's request carries no `tier`, so a tier flip never reloads it; the tiered rows reload per tier as today. `MCPMReq`, `Polyphorm2MRSReq` and the workbench's `void` request collapse into `CosmicWebDensityReq`.

Asset rows are one per source row, keyed by the row's `Source` code as galaxyCatalog's are: `req: (tier) => cosmicWebDensityRequest(entry, tier)`, today's `priority`, `demand: (ctx) => ctx.settings.cosmicWebDensity.items[entry.id]?.enabled === true`, `factory: () => runtime.slots[entry.id]`. The string keys `'mcpm'`, `'polyphorm2Mrs'`, `'mcpmWorkbench'` leave `AssetKey` (and its header's `'mcpm'` clause). Still no `release` (grill Q13).

The ingest is a plain `renderer.upload`, with no dispatch. **Invariant** (grill inventory): `installFadeOnArrival` snapshots every fade row's guard, then on any slot's `ready` re-runs them and opens a fade on each false→true edge. The field row's guard is `runtime.renderer.listIds().includes(id)`, its intent `settings.cosmicWebDensity.items[id]?.enabled`. So:

1. `commit` calls `renderer.upload(entry.id, cube, entry)` synchronously, so the upload lands before the slot reports `ready` (flow / filaments shape);
2. the intent is already true at that edge because `items` is complete in `initialState` for every row; nothing in the ingest writes settings;
3. the fade that arrival opens wakes the render, as for flow and filaments;
4. the Layer's slots join `allSlots` through `createLayers` before `wireSlots` calls `installFadeOnArrival`, unchanged from flow.

The core ingest `uploadVolumeField.ts` is deleted. Flow's cube keeps its own path (decision #14).

## 7. UI split

| Section | Owner | Slot | Contents |
|---|---|---|---|
| Cosmic web density | `cosmicWebDensity` | `main` | header toggle = master; one enable checkbox per source row, the workbench included |
| Cosmic web density (tuning) | `cosmicWebDensity` | `debug` | one identical row per source row: intensity, contrast, trim, density scale, exposure, palette; no enable checkbox |
| Cosmic web filaments | `cosmicWebFilaments` | `main` | header toggle = master; intensity slider while on |

Both density sections map `COSMIC_WEB_DENSITY_SOURCE_ROWS` (through `projectVolumeFieldRows`); the main section lists every cube, as today's panel does. The containers dispatch `setCosmicWebDensityEnabled` / `writeCosmicWebDensityField` / `setCosmicWebFilaments*` as the core container does today (the `ui/` exemption).

## 8. Deletions

| Deleted | Where | Why |
|---|---|---|
| `SourceEntryBase.visible`, `intensity` on the constellations / filaments entries and `VolumeFieldDefaults`, `seedVolumeFields` | registry types, `volumeFieldDefaults.ts` | §5 |
| pass-toggle exclusion of the `volume` target | `engine.ts:516-532` `passOverrides.allNames` | grill Q12; `allNames` = compute slots + `FRAME_ORDER_PASS_NAMES` |
| `uploadVolumeField` ratchet row + its comment clause | `tests/conventions/layerImportBoundary.test.ts:88-97` | the file is gone |
| `volumeFieldRenderer`, `volumeUpsample` handle rows, members, nulls | `gpuHandleRegistry.ts:210-219`, `EngineGpuHandles.d.ts`, `engine.ts:187-188`, `initGpu.hdrCapabilityWiring` stubs | Layer-owned |
| `mcpm` / `polyphorm2Mrs` / `mcpmWorkbench` slot fields + nulls, their `AssetKey` members | `EngineAssetSlots.d.ts:30-41`, `engine.ts:286-289`, `AssetKey.d.ts` | Layer slots live in `state.layerSlots`, keyed by `Source` code |
| three slot files, three fetchers, `MCPMReq`, `Polyphorm2MRSReq` | `services/loading/`, `src/@types/loading/` | §6 |
| `volume` target row + its "why 1/3 scale" header prose | `renderTargets.ts:27-37,163-170` | moves to `layer.ts` (two lines) |
| `scalarVolumePass`, `volumeUpsamplePass`, `volumeLiveness`, `uploadVolumeField` | core, + `passes/index.ts` entries | replaced by §4 + the Layer |
| the two fade rows + `volumeFieldIds()` | `fadeLayers.ts:21-28,56-62,111-118` | Layer `fades` |
| Style picker, `deriveCosmicWebStyle`, `.stylePicker*` CSS, `CosmicWebSection.test.ts` | `SettingsPanel/` | grill Q7 |
| `CosmicWebSection.tsx`, `VolumeFieldRow.tsx`, `CosmicWebSectionContainer.tsx`, the hard mount | `SettingsPanel.tsx:17,50` | split into the Layers |
| `removeCosmicWebDensityField` + its slice test | Layer slice | grill Q13 (no dispatcher since #695) |
| `addCosmicWebDensityField`, its reducer + `uploadVolumeField.test` | Layer slice | a no-op: every id is in `initialState`, and a Layer file outside `ui/` / `sagas/` cannot dispatch (`layerImportBoundary`, Ruling 17) |
| `VolumeSettings.d.ts` | `src/@types/settings/` | zero importers; duplicate of `CosmicWebDensitySettings` |

The six hand-kept fade tables (`FadeId`, `VisibilityLayerKey`, `visibilityLayerRows`, `visibilityActionRow`, …) stay core (grill inventory).

## 9. Types (grill Q9)

A type core names stays in `src/@types/`; only types core never names move into the Layer (the starCatalog precedent).

| Stays in `src/@types/` | Why |
|---|---|
| `ScalarCube`, `ScalarFieldPaletteId`, `VolumeFieldSettings`, `VolumeFieldDefaults`, `VolumeFieldRenderer`, `FieldEntry`, `VolumeFieldLiveness`, `ScalarVolumePassRow` | mechanism (Q9 list + §4) |
| `CosmicWebDensityFieldId` | core `FadeId` and `visibilityActionRow` name it |
| `CosmicWebDensitySourceEntry` | the core `SourceEntry` union names it, as for every formed Layer |

| Moves to (or is born in) `layers/cosmicWebDensity/@types/` |
|---|
| `CosmicWebDensityRuntime`, `CosmicWebDensityReq` (new), `CosmicWebDensitySettings`, `VolumeFieldRowData` |

## 10. Testing

Judged by "fails on a real bug nothing else catches":

- `INITIAL_SETTINGS`: the §5 gate is a dump diff, run once for commit 1, not a standing test; `allVisibleMask` equals the mask of the enabled `galaxyCatalogs.items`.
- `deriveVolumeLiveness`: `null` with no active field; band factor applied at the given distance; clamp applied (moved from `volumeLiveness.test`, minus the state plumbing).
- `deriveCosmicWebDensityLiveness`: master off and faded → `null`; master off mid-fade → live.
- `createScalarVolumePass`: draws with `sizeOf(row.targetId)` as viewport and the scaled `pxPerRad` (moved from `scalarVolumePass.test`).
- `createVolumeFieldRenderer`: `upload` seeds the resident palette from `statics`, not a registry lookup.
- `cosmicWebDensityRequest`: a tiered row carries `tier`, an untiered one does not (the fetcher's filename follows).
- Arrival: slot `ready` after commit opens the field fade exactly once (moved `wireSlots` / `demandTable` cases to the Layer rows).
- Section containers: toggling a main checkbox writes `items[id].enabled`.
- `createLayers` duplicate-name / duplicate-target asserts already catch a half-moved pass or target.

## 11. Docs to update in PR 2

- Edenhofer spec (`2026-08-20-edenhofer-dust-volume.md:83`): the "third joint" paragraph becomes "two Layers, two instances": the dust Layer mints its own `createVolumeFieldRenderer` (with a blend parameter), target, upsample and `createScalarVolumePass` row, and its own ingest in its `load/`; no `absorptive` routing flag. Line 52's "(Ground preparation, third joint)" pointer and line 47's `VolumeFieldRow` palette-slot remark are re-pointed at the debug tuning row.
- `src/layers/README.md` status: `cosmicWebDensity` and `cosmicWebFilaments` formed (the line still says `filaments` / `volume`, a PR 1 leftover); stubs `body`, `milkyWay`, `structure`.
- Parent spec §10(e): `volume` done as `cosmicWebDensity`.
- `docs/backlog/2026-09-13-volume-field-vram-release.md`: paths → the Layer's `load/cosmicWebDensityAssetRows.ts`, `CosmicWebDensitySection` container, `present/cosmicWebDensityFadeRows.ts`; drop the `removeVolumeField` delete note (done).
- `docs/BACKLOG.md`: `:48` source-registry factory → the star-catalog remainder only (the density family has one fetcher and one per-row slot factory now); `:71` liveness guards → `utils/volume/deriveVolumeLiveness.ts` + the Layer's wrapper; `:183` viewport formula → `createScalarVolumePass.ts`; `:185` producer toggle freeze gains `cosmic-web-density` as a reproducer. The `:39` registry-visible line goes with commit 1 (§5).
- `docs/RENDERER.md` if it names `scalar-volume` / the `volume` target (none found at HEAD).

## 12. Definition of done

- `npm run build`, `npm run typecheck`, the suite green; `layerImportBoundary` and `frameFilePurity` ratchets green with the uploadVolumeField row gone.
- Commit 1: `INITIAL_SETTINGS` dump unchanged; no `visible` on any source row, no `intensity` on the constellations / filaments entries or `VolumeFieldDefaults`; the backlog detail file and its index line gone.
- Smoke eye-checks (user, main app): MCPM visible at boot; Polyphorm 2MRS tick fades in, untick fades out; "Cosmic web density" (all three cubes listed) and "Cosmic web filaments" both in the SettingsPanel, no Style picker; the per-cube sliders in the DebugPanel; `cosmic-web-density` toggleable in the DebugPanel pass list (it freezes like ZoA's, backlog `:185`); the default `npm run fetch-data` pulls the same `.scfd` files as before.
- No perf gate: same renderer, shader, passes and target scale; only ownership moves (grill Q15).
- Deletion audit at `/feature-done`.

## 13. Rulings on the draft's open questions

1. Ingest dispatch: `addCosmicWebDensityField` and its reducer delete; the ingest is a plain `renderer.upload` landing before `ready`, and the arrival fade wakes the render (§6).
2. Types: `CosmicWebDensityFieldId` and `CosmicWebDensitySourceEntry` stay in `src/@types/` because core names them; only types core never names move (§9).
3. The main section lists every cube, the workbench included, derived from the Layer's rows; no named list, no registry field; each enable checkbox lives in main (§7).
4. The debug section has one identical slider row per cube and no enable checkbox (§7).
5. One fetcher and one per-row slot factory driven by the source row; the per-cube request types collapse into `CosmicWebDensityReq` (§6).
6. The whole registry `visible` / `intensity` backlog item lands as PR 2's first commit, gated on an unchanged `INITIAL_SETTINGS` dump (§5).

## Remaining open questions

1. **`fetchPrebuiltData`'s boot-state read.** `volumeVisibilityByFileName` decides density and flow `.scfd` downloads, so reading boot state means two shapes (`flow.enabled`, `cosmicWebDensity.items[id].enabled`) and a `tools/` → `INITIAL_SETTINGS` import that drags the settings graph into the fetch tool. The alternative, an explicit filename list, is a second source of truth that can drift from boot state. Which one?
