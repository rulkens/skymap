# The `cosmicWebDensity` Layer — design spec

Decisions ledger: [`docs/grill-sessions/cosmic-web-density-layer-2026-09-22.md`](../../grill-sessions/cosmic-web-density-layer-2026-09-22.md) (Q1–Q15, final). This spec does not re-litigate those calls; it specifies how PR 2 lands them. Cited as "grill Qn".

Parent: [`2026-09-09-layer-composition-design.md`](2026-09-09-layer-composition-design.md) §10(e), the `volume` stub. Addendum: everything the parent says about the `Layer` contract, `createLayers`, facts and selection rows holds unless a section below says otherwise. Shape precedent: [`completed/2026-09-21-star-catalog-layer-design.md`](completed/2026-09-21-star-catalog-layer-design.md).

## 1. What this is

`src/layers/cosmicWebDensity/` is formed from its settings-only stub and takes ownership of the Physarum density cubes (MCPM, Polyphorm 2MRS, the MCPM workbench export): sources, slots, ingest, fade rows, one renderer instance, its own target + upsample, both passes and two UI sections (grill Q5, Q7, Q8). The scalar-volume **renderer, pass factory and liveness core stay generic core mechanism** that the Milky Way dust Layer instantiates later (grill Q5). The sibling `cosmicWebFilaments` gains its own settings section (grill Q7).

Behaviour is pixel-identical except: the Style picker is gone, the Cosmic web section splits in two, the per-cube sliders move to the DebugPanel, and the density pass is toggleable in the DebugPanel.

## 2. Ground preparation — PR 1 (#810, done)

Refactor-ground ran as the grill itself (grill Q14 ruled the prep PR, no deletion audit). PR 1 commits on `worktree-volume-layer`, all behaviour-neutral except two datasets gone:

| Commit | What it did | Grill |
|---|---|---|
| DEV synthetic volumes deleted | `debug-*` rows, codes 12/13/14 retired, `syntheticVolumeSlots`, fetcher, generator, `maybeLazyLoadDebugVolume`, the fade row's guard short-circuit + `post`; `binBaseName` non-null | Q1 |
| CF4 density cube deleted | source row, `Source.Cf4Density` retired, fetcher, slot, wiring row, R2 allow-list, three tools, e2e spec, `DATA.md` rows; raw `.npy` + registry key kept for `buildFlowField` | Q4 |
| `volume` → `cosmicWebDensity` | settings cluster, selectors, actions, types (`CosmicWebDensityFieldId`, `…SourceEntry`, `…Settings`), fade ids `cosmicWebDensity` / `cosmicWebDensityField`, visibility keys, source-row `type` | Q9, Q11 |
| `filaments` → `cosmicWebFilaments` | Layer folder, cluster, fade id, visibility key | Q10, Q11 |

Verdicts for PR 2's touchpoints, post-PR 1:

| Touchpoint | Verdict | Joint |
|---|---|---|
| Target + upsample owned by a Layer | growth | `Layer.targets`, `createUpsamplePass` (ZoA precedent) |
| Slots, asset rows, fade rows, sources, `ui` main/debug | growth | existing members (flow precedent) |
| Pass bound to one global renderer | bolt-on | `createScalarVolumePass` (§4.2) |
| Liveness reads `settings.cosmicWebDensity` | bolt-on | pure `deriveVolumeLiveness` (§4.3) |
| **Renderer reads the cosmic-web registry inside `upload`** | **bolt-on, not in the grill** | `upload` takes the statics; renderer generic over `Id` (§4.1) |
| **Ingest dispatches into the Layer's own slice** | **blocked** | see OQ1 |

No new `Layer` contract member is needed: `targets`, `passes`, `assets`, `fades`, `ui` (`main` + `debug`) all exist in `Layer.d.ts`.

## 3. The Layer folder

| File | Member | Moved from |
|---|---|---|
| `layer.ts` | `defineLayer({ name: 'cosmicWebDensity', settings, sources, targets, create, destroy, passes, assets, fades, ui })` | stub `state/` only |
| `create.ts` | `create` — renderer, upsample, the three slots | `gpuHandleRegistry.ts` rows `volumeFieldRenderer` / `volumeUpsample`; slot factories |
| `destroy.ts` | `destroy` — `renderer.destroy()`, `upsample.destroy()` | new |
| `state/cosmicWebDensity/{slice,initialState,selectors}.ts`, `state/slices.ts` | `settings` | already here (PR 1) |
| `state/defaults.ts` | seed helpers `getVolumeFieldDefaults` / `buildVolumeFieldSettings` / `seedVolumeFields` | `src/data/volume/volumeFieldDefaults.ts` (filters `type: 'cosmicWebDensity'`, so it is the Layer's; no tool imports it) |
| `sources/mcpm.ts`, `sources/polyphorm-2mrs.ts`, `sources/mcpm-workbench.ts`, `sources/cosmicWebDensitySourceRows.ts` | `sources` | `src/data/sources/*`; `data/sources.ts` swaps the `UNFORMED_` rows for `sourceRecordOf(COSMIC_WEB_DENSITY_SOURCE_ROWS)` |
| `load/cosmicWebDensityAssetRows.ts` | `assets` | `assetWiring.ts` rows `mcpm` / `polyphorm2Mrs` / `mcpmWorkbench` + the three `*_FIELD` constants |
| `load/createDensityFieldSlot.ts` | slot factory (one, §5) | `services/loading/slots/{mcpmSlot,polyphorm2MrsSlot,mcpmWorkbenchSlot}.ts` |
| `load/{mcpmFetcher,polyphorm2MrsFetcher,mcpmWorkbenchFetcher}.ts` | fetchers | `services/loading/fetchers/` |
| `passes/cosmicWebDensityPass.ts` | `passes` | `frame/passes/scalarVolumePass.ts` → `createScalarVolumePass` row |
| `passes/cosmicWebDensityUpsamplePass.ts` | `passes` | `frame/passes/volumeUpsamplePass.ts` → `createUpsamplePass` row |
| `present/deriveCosmicWebDensityLiveness.ts` | shared gate of both passes | the state reads of `frame/volumeLiveness.ts` (master, recession, camera distance) |
| `present/cosmicWebDensityFadeRows.ts` | `fades` | `fadeLayers.ts` rows `cosmicWebDensity` + `cosmicWebDensityField`, `volumeFieldIds()` |
| `ui/CosmicWebDensitySection.tsx` + `…Container.tsx` | `ui` `main` | master + enable half of `CosmicWebSection.tsx` / `VolumeFieldRow.tsx` |
| `ui/CosmicWebDensityTuningSection.tsx` + `…Container.tsx` + `ui/DensityFieldTuningRow.tsx` (+ `.module.css`) | `ui` `debug` | slider half of `VolumeFieldRow.tsx` |
| `ui/projectVolumeFieldRows.ts` | row projection for both sections | `src/state/settings/projectVolumeFieldRows.ts` |
| `@types/CosmicWebDensityRuntime.d.ts` | Runtime | new |
| `@types/CosmicWebDensitySettings.d.ts`, `@types/VolumeFieldRowData.d.ts`, `@types/MCPMReq.d.ts`, `@types/Polyphorm2MRSReq.d.ts` | Layer-only types | `src/@types/settings/`, `src/@types/loading/` |

`cosmicWebFilaments/` gains `ui/CosmicWebFilamentsSection.tsx` + `…Container.tsx` (`ui: [{ slot: 'main', … }]`): header toggle = `cosmicWebFilaments.enabled`, the intensity slider shown while on. Its `layer.ts` header loses the "UI moves with density" paragraph.

`APP_COMPOSITION` gains `cosmicWebDensityLayer` immediately before `cosmicWebFilamentsLayer`, so the two `main` sections sit adjacent ("Cosmic web density", "Cosmic web filaments"; grill Q10).

```ts
// src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime.d.ts
export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  readonly slots: {
    readonly mcpm: AssetSlot<ScalarCube, MCPMReq>;
    readonly polyphorm2Mrs: AssetSlot<ScalarCube, Polyphorm2MRSReq>;
    readonly mcpmWorkbench: AssetSlot<ScalarCube, void>;
  };
};

// layer.ts — the target row the core `volume` row becomes
targets: [{ id: 'cosmic-web-density', format: HDR_TARGET_FORMAT, depth: null, scale: 3,
            clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
```

## 4. Core mechanism changes

### 4.1 The renderer becomes generic (finding, not in the grill)

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

## 5. Load and the arrival-ordering invariant

The three slot files differ only in name, fetcher and id, and once they close over the Layer's renderer instead of `(state, cb)` they are rewritten anyway, so they fold into one factory:

```ts
// src/layers/cosmicWebDensity/load/createDensityFieldSlot.ts
export function createDensityFieldSlot<Req>(
  renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>,
  entry: CosmicWebDensitySourceEntry,   // id + statics
  name: string,
  fetch: Fetcher<ScalarCube, Req>,
): AssetSlot<ScalarCube, Req>;
```

Asset rows keep today's keys (`mcpm`, `polyphorm2Mrs`, `mcpmWorkbench` stay in core `AssetKey`, as `flow` / `filaments` do), `req`, `priority` and `demand: (ctx) => ctx.settings.cosmicWebDensity.items[id]?.enabled === true`; `factory: () => runtime.slots.<key>`. Still no `release` (grill Q13).

**Invariant** (grill inventory). `installFadeOnArrival` snapshots every fade row's guard, then on any slot's `ready` re-runs them and opens a fade on each false→true edge. The field row's guard is `runtime.renderer.listIds().includes(id)`, its intent `settings.cosmicWebDensity.items[id]?.enabled`. So:

1. the commit calls `renderer.upload(entry.id, cube, entry)` **synchronously inside `commit`**, before the slot resolves to `ready` (flow / filaments shape);
2. the intent is already true at that edge because `items` is seeded for every row at construction (`seedVolumeFields`); nothing in the ingest writes it;
3. the Layer's slots join `allSlots` through `createLayers` before `wireSlots` calls `installFadeOnArrival`, unchanged from flow.

The core ingest `uploadVolumeField.ts` is deleted. Flow's cube keeps its own path (decision #14).

## 6. UI split

| Section | Owner | Slot | Contents |
|---|---|---|---|
| Cosmic web density | `cosmicWebDensity` | `main` | header toggle = master; one enable checkbox per shipping cube (MCPM, Polyphorm 2MRS) |
| Cosmic web density (tuning) | `cosmicWebDensity` | `debug` | one row per cube, workbench included: enable checkbox + intensity, contrast, trim, density scale, exposure, palette |
| Cosmic web filaments | `cosmicWebFilaments` | `main` | header toggle = master; intensity slider while on |

The containers dispatch `setCosmicWebDensityEnabled` / `writeCosmicWebDensityField` / `setCosmicWebFilaments*` as the core container does today (the `ui/` exemption). Which cubes the main section lists is OQ3.

## 7. Deletions

| Deleted | Where | Why |
|---|---|---|
| pass-toggle exclusion of the `volume` target | `engine.ts:516-532` `passOverrides.allNames` | grill Q12; `allNames` = compute slots + `FRAME_ORDER_PASS_NAMES` |
| `uploadVolumeField` ratchet row + its comment clause | `tests/conventions/layerImportBoundary.test.ts:88-97` | the file is gone |
| `volumeFieldRenderer`, `volumeUpsample` handle rows, members, nulls | `gpuHandleRegistry.ts:210-219`, `EngineGpuHandles.d.ts`, `engine.ts:187-188`, `initGpu.hdrCapabilityWiring` stubs | Layer-owned |
| `mcpm` / `polyphorm2Mrs` / `mcpmWorkbench` slot fields + nulls | `EngineAssetSlots.d.ts:30-41`, `engine.ts:286-289` | Layer slots live in `state.layerSlots` |
| `volume` target row + its "why 1/3 scale" header prose | `renderTargets.ts:27-37,163-170` | moves to `layer.ts` (two lines) |
| `scalarVolumePass`, `volumeUpsamplePass`, `volumeLiveness`, `uploadVolumeField` | core, + `passes/index.ts` entries | replaced by §4 + the Layer |
| the two fade rows + `volumeFieldIds()` | `fadeLayers.ts:21-28,56-62,111-118` | Layer `fades` |
| Style picker, `deriveCosmicWebStyle`, `.stylePicker*` CSS, `CosmicWebSection.test.ts` | `SettingsPanel/` | grill Q7 |
| `CosmicWebSection.tsx`, `VolumeFieldRow.tsx`, `CosmicWebSectionContainer.tsx`, the hard mount | `SettingsPanel.tsx:17,50` | split into the Layers |
| `removeCosmicWebDensityField` + its slice test | Layer slice | grill Q13 (no dispatcher since #695) |
| `addCosmicWebDensityField` + `uploadVolumeField.test` | Layer slice | pending OQ1 |
| `VolumeSettings.d.ts` | `src/@types/settings/` | zero importers; duplicate of `CosmicWebDensitySettings` |

The six hand-kept fade tables (`FadeId`, `VisibilityLayerKey`, `visibilityLayerRows`, `visibilityActionRow`, …) stay core (grill inventory).

## 8. Types (grill Q9)

| Stays in `src/@types/` | Why |
|---|---|
| `ScalarCube`, `ScalarFieldPaletteId`, `VolumeFieldSettings`, `VolumeFieldDefaults`, `VolumeFieldRenderer`, `FieldEntry`, `VolumeFieldLiveness`, `ScalarVolumePassRow` | mechanism (Q9 list + §4) |
| `CosmicWebDensityFieldId` | core `FadeId` and `visibilityActionRow` name it (OQ2) |
| `CosmicWebDensitySourceEntry` | the core `SourceEntry` union names it, as for every formed Layer (OQ2) |

| Moves to `layers/cosmicWebDensity/@types/` |
|---|
| `CosmicWebDensityRuntime` (new), `CosmicWebDensitySettings`, `VolumeFieldRowData`, `MCPMReq`, `Polyphorm2MRSReq` |

## 9. Testing

Judged by "fails on a real bug nothing else catches":

- `deriveVolumeLiveness`: `null` with no active field; band factor applied at the given distance; clamp applied (moved from `volumeLiveness.test`, minus the state plumbing).
- `deriveCosmicWebDensityLiveness`: master off and faded → `null`; master off mid-fade → live.
- `createScalarVolumePass`: draws with `sizeOf(row.targetId)` as viewport and the scaled `pxPerRad` (moved from `scalarVolumePass.test`).
- `createVolumeFieldRenderer`: `upload` seeds the resident palette from `statics`, not a registry lookup.
- Arrival: slot `ready` after commit opens the field fade exactly once (moved `wireSlots` / `demandTable` cases to the Layer rows).
- Section containers: toggling a main checkbox writes `items[id].enabled`; the main section omits the workbench (per OQ3).
- `createLayers` duplicate-name / duplicate-target asserts already catch a half-moved pass or target.

## 10. Docs to update in PR 2

- Edenhofer spec (`2026-08-20-edenhofer-dust-volume.md:83`): the "third joint" paragraph becomes "two Layers, two instances": the dust Layer mints its own `createVolumeFieldRenderer` (with a blend parameter), target, upsample and `createScalarVolumePass` row, and its own ingest in its `load/`; no `absorptive` routing flag. Line 52's "(Ground preparation, third joint)" pointer and line 47's `VolumeFieldRow` palette-slot remark are re-pointed at the debug tuning row.
- `src/layers/README.md` status: `cosmicWebDensity` and `cosmicWebFilaments` formed (the line still says `filaments` / `volume`, a PR 1 leftover); stubs `body`, `milkyWay`, `structure`.
- Parent spec §10(e): `volume` done as `cosmicWebDensity`.
- `docs/backlog/2026-09-13-volume-field-vram-release.md`: paths → the Layer's `load/cosmicWebDensityAssetRows.ts`, `CosmicWebDensitySection` container, `present/cosmicWebDensityFadeRows.ts`; drop the `removeVolumeField` delete note (done).
- `docs/BACKLOG.md`: `:48` source-registry factory → the star-catalog remainder only (the density family has one slot factory now); `:71` liveness guards → `utils/volume/deriveVolumeLiveness.ts` + the Layer's wrapper; `:183` viewport formula → `createScalarVolumePass.ts`; `:185` producer toggle freeze gains `cosmic-web-density` as a reproducer.
- `docs/RENDERER.md` if it names `scalar-volume` / the `volume` target (none found at HEAD).

## 11. Definition of done

- `npm run build`, `npm run typecheck`, the suite green; `layerImportBoundary` and `frameFilePurity` ratchets green with the uploadVolumeField row gone.
- Smoke eye-checks (user, main app): MCPM visible at boot; Polyphorm 2MRS tick fades in, untick fades out; "Cosmic web density" and "Cosmic web filaments" both in the SettingsPanel, no Style picker; the per-cube sliders in the DebugPanel; `cosmic-web-density` toggleable in the DebugPanel pass list (it freezes like ZoA's, backlog `:185`).
- No perf gate: same renderer, shader, passes and target scale; only ownership moves (grill Q15).
- Deletion audit at `/feature-done`.

## 12. Open questions for the user

Each is a place the draft had to teach a special case or contradicts a grill note; the draft above assumes the recommendation.

1. **The ingest dispatch.** The grill inventory says the Layer's `load/` "keeps dispatch → upload → resolve". A Layer file outside `ui/` / `sagas/` cannot dispatch (`layerImportBoundary` no-dispatch sweep, Ruling 17), and the dispatch is a no-op: every id is seeded at construction and `addCosmicWebDensityField` returns early on a seeded id. Its only effect is the render wake that `watchWakeSaga` gives a `settings/` write. **Recommend** deleting `addCosmicWebDensityField` and the dispatch; the arrival wake then comes from the fade the arrival opens, as for flow and filaments. Alternative: keep it via `deps.requestRender()` after `upload` if the smoke shows a missed first frame.
2. **Q9's type list vs core readers.** Q9 puts `CosmicWebDensityFieldId` and `…SourceEntry` in the Layer's `@types/`, but core `FadeId`, `visibilityActionRow` and the `SourceEntry` union import them, and the README rule plus the star precedent keep core-read types core. **Recommend** they stay in `src/@types/` (§8). Moving them would mean core types importing a Layer.
3. **Which cubes the main section lists.** Polyphorm 2MRS and the workbench are both `visible: false`, so the registry has no field that separates "shipping" from "dev". A hard-coded `id !== 'mcpm-workbench'` filter in the section is the special case. **Recommend** a registry field on `CosmicWebDensitySourceEntry` (e.g. `panel: 'main' | 'debug'`) that the main section filters on.
4. **Enable checkbox on every debug row.** "The workbench's enable sits beside its sliders" read literally puts a checkbox on one debug row only. **Recommend** a uniform debug row (enable + sliders for all three), so MCPM / Polyphorm show their enable in both panels.
5. **One slot factory.** Folding the three slot files into `createDensityFieldSlot` (§5) was not ruled; it is what makes the `:48` backlog rewrite true. Confirm, or keep three moved files.
