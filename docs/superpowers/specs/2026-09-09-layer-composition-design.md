# Layer composition design

> **Status.** Design spec, not yet planned. Reopens and supersedes decision #17's deferral
> of the umbrella type (§2). Written against the grill rulings of 2026-09-09 (ten items) and
> 2026-09-10 (four more, §13); all are premises. Nothing in it is open.
> **Sources.** [Layer-composition review](../../research/engine/layer-composition-review-2026-09-09.md)
> (facts, `file:line` evidence, the 18 registry-like tables) ·
> [grill transcript](../../grill-sessions/layer-composition-2026-09-09.md) (the rulings) ·
> [engine decisions record](../../research/engine/decisions.md) ·
> [ADR 0011](../../adrs/0011-engine-composition-bundle-rows.md).
> Where the review and the files disagree, the files win; §14 footnotes each divergence.

## 1. The ask

1. A data layer is defined in one place, as one module.
2. That module has one seam per subsystem: settings, loading, rendering, UI, pick.
3. An engine is assembled at build time from a chosen list of those modules. A layer absent
   from the list is absent from the bundle: no renderer constructed, no settings cluster, no
   slot, no pass, no import.

First consumers, in order: a galaxies-only reference engine in-repo (a compile gate), then
`tools/scene-workbench` (LiDAR today, splats next) as the first real one.

## 2. Relation to decision #17

#17 deferred the umbrella type on one recorded objection: it would be "a thin grouping over
rows that already exist". That was weighed against the consumers that existed then, all of which
enumerate rows one family at a time and none of which needed a family to be _absent_.

**Build-time omission is a consumer the objection never weighed.** To omit a layer you must name the
set of contributions that leave with it, and no such name exists: the galaxy layer's presence is
spread across nine `GPU_HANDLE_ROWS` rows, eight `ASSET_WIRING` rows, five `ContentLayer` rows, a
settings cluster, three label producers, a saga, a SettingsPanel section and two boot preconditions,
joined only by a reader's knowledge. A grouping that costs nothing while every family is present is
the difference between possible and impossible once one is not. #17's own reopen condition ("a
consumer needing cross-family enumeration of one subsystem's rows reopens the umbrella question
early") names the reference engine exactly.

The unit is called `Layer`, not `SubsystemBundle`: it groups by _source-type family_, the axis
settings clusters, fetchers, renderers and slots are already cut along, and "subsystem" is spoken
for by `EngineSubsystemHandles`. Everything else in #9-#18 stands: rows keyed in their own domain
(#12), a misfit changes a contract rather than earning an optional field (#10), no toposort (#4), no
schema-generated UI (#4), the store stays fade-free.

## 3. Vocabulary

| Word            | Means                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Layer**       | One source-type family as one module: `galaxyCatalog`, `starCatalog`, `structure`, `volume`, `body`, plus the singletons `filaments`, `flow`, `milkyWay`, `constellations`, `zoneOfAvoidance`. The unit of composition. Lives at `src/layers/<name>/`.                                                             |
| **ContentPass** | Today's `ContentLayer`, renamed and narrowed: a name and a gated draw. WHERE it draws is `FRAME_ORDER`'s business (§5), not the row's. A Layer owns several; `galaxyCatalog` owns four.                                                                                                                            |
| **core**        | What an engine has before any Layer: device/context, camera and input, the frame executor and pass order, render targets, tone-map/bloom/compositor, the pick program and selection encoding, the fade registry, the render scheduler, the asset queue and demand loop, the label mechanisms, tour/clip machinery. |
| **composition** | The build-time list of Layers plus the boot parameters an engine needs (home, tier, data URL). One per app: main app, reference engine, workbench.                                                                                                                                                                 |
| **source row**  | One `SourceEntry`, living in its Layer's `sources/` folder (§4.7): a datum _inside_ a Layer, not a unit of composition. A fifth survey is a row; LiDAR is a Layer.                                                                                                                                                 |

## 4. Data delta

### 4.1 `ContentLayer` becomes `ContentPass`

Pure rename: `src/@types/engine/frame/ContentLayer.d.ts` to `ContentPass.d.ts`, and the 37
`*Layer.ts` files under `src/services/engine/frame/passes/` to `*Pass.ts`. Load-bearing for the rest
of this spec: `ContentLayer` currently means "one draw call's worth of a layer", which is the thing
a `Layer` owns several of.

Nothing but the rename rides PR (a). The contract change lands in (c), where `FRAME_ORDER` is
authored, because the two halves are one contract:

- **Fields out.** `target`, `slab`, `skyCapture` and `hdrPostLensing` are deleted (§5): a pass no
  longer states where it draws, so the row and the order cannot disagree.
- **Signature in.** `enabled` / `draw` / `pickEnabled` / `drawPick` take `PassState` — a `Pick` of
  `EngineState` that refuses `booted`, `requests`, `cameraRuntime`, `skyCubemapCapture` and
  `picking` — instead of the whole `EngineState`. (`CoreFrameState`, the narrower cut that also
  drops `gpu`, is minted in (d) once each Layer holds its own renderers; §13 A4.) A pass reaches
  its own Layer's renderers through the closure it was constructed in (§4.2), not through a global
  bag. That answers the review's finding that "every method takes the whole `EngineState`, so a layer can
  read anything; nothing scopes it".

```ts
// src/@types/engine/frame/ContentPass.d.ts, after
export type ContentPass = {
  readonly name: string;
  enabled(state: PassState, ctx: ReadyFrameContext, view: SlabView): boolean;
  draw(pass: GPURenderPassEncoder, view: SlabView, ctx: ReadyFrameContext, state: PassState): void;
  pickEnabled?(state: PassState, ctx: ReadyFrameContext, view: SlabView): boolean;
  drawPick?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: PassState,
  ): void;
};
```

`blend` is NOT on the row. It was, and the argument ran: one `(target, slab)` group already mixes
blends (`hdr` carries additive emission plus `milky-way`'s multiplicative dust), so it is a property
of the draw, not of the step. True — but that argues about WHERE a blend would live, and no code
ever read the field; the blend each pass actually uses is baked into the renderer pipeline its
`draw` call binds. `CompositeStep.blend`, which the executor does read, is a different type. §13 A9.

### 4.2 `Layer` and `defineLayer`

```ts
// src/@types/engine/layer/Layer.d.ts   (sub-shapes each get their own file)
export type Layer<Name extends string, Runtime, Facts = undefined> = {
  readonly name: Name;

  /** This Layer's settings clusters. Absent = no knobs (§4.3). */
  readonly settings?: readonly SettingsFragmentLike[];

  /** This Layer's store-visible facts: a plain initial value the shell selects (§9(d)). */
  readonly facts?: Facts;

  // Static contributions: plain data, readable without booting anything.
  readonly targets?: readonly RenderTargetSpec[];
  readonly sagas?: readonly SagaFactory[];
  /** This Layer's `SOURCE_REGISTRY` rows, keyed by their global `Source` code (§4.7). */
  readonly sources?: readonly (readonly [SourceType, SourceEntry])[];
  /** The SettingsPanel section: a hand-written component, never generated. */
  readonly ui?: LayerUiSection;

  // Lifecycle: this Layer's private renderers, subsystems, data store and asset slots.
  create(deps: LayerCoreDeps<Facts>): Runtime;
  destroy(runtime: Runtime): void;

  // Runtime-bound contributions: closures over the Layer's own state.
  passes(runtime: Runtime): readonly ContentPass[];
  assets?(runtime: Runtime): readonly AssetWiringRow[];
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  labels?(runtime: Runtime): readonly Label2DProducer[];
  /** One row per `SelectionRef` type: pick, row extraction and durable id (§9(d)). */
  selection?(runtime: Runtime): readonly SelectionKindRow[];
  /** Once per frame, after the focus uniform, before any pass; `true` keeps the loop awake. */
  frame?(runtime: Runtime): (ctx: ReadyFrameContext, state: PassState) => boolean;
};

// src/services/engine/layer/defineLayer.ts
export function defineLayer<const Name extends string, Runtime, Facts>(
  layer: Layer<Name, Runtime, Facts>,
): Layer<Name, Runtime, Facts>;
```

**Hooks the contract deliberately lacks,** each ruled in §9(d) with the mechanism that replaces it:
no `handle`, because a Layer's only channel to the shell is `facts` in the store (D6); no `tier`,
because tier is an input to the demand loop's request-drift edge, not a transition (D3); no
`swapFormat`, because a renderer that draws to the canvas tracks its own format at draw (D9); no
`liveness`, because `frame`'s return value is it (D2). `Settings` and `Sources` join `Facts` as
inferred const type parameters in (d), which is what closes §13 A8.

`defineLayer` is an identity function whose only job is inference: `const Name` pins the name as a
literal (const type parameters, TS 5.0+; the repo is on 6.0.3) and `Runtime` is inferred from
`create`'s return type. A Layer may own several clusters, so `settings` is a LIST bounded by
`SettingsFragmentLike` rather than one `Cluster` type parameter — which means the field erases the
literal keys `ComposedClusters` needs, and `APP_SETTINGS_FRAGMENTS` stays the settings authority
until (d) closes that (§13 A8).

**`LayerCoreDeps` carries creation-time core objects only** (§13 A7, extended in (d)): `ctx`, the
three bind-group layouts, `focusUniform`, the `fades` registry, `store`, `requestRender`,
`publish(patch)` and `reportSourceCount(source, count)`. Per-frame values — settings, tier,
selection, clip-player opacity, the label renderer, the camera — reach a Layer through the frame
context its passes and producers already take, never through `deps`; `renderTargets` and
`fontAtlases` join when the Layers needing them do (§9(d), D7).

**Data versus closure.** `targets` / `sagas` / `sources` / `ui` have no dependency on the Layer's own
allocations, so they stay plain data, per #14 D4's standing form. The rest cannot: their whole point
is that a pass reads its own Layer's renderer and nothing else, and `(runtime) => rows` is what buys
§4.1's scoping. `assets` moved into that group with the 2026-09-10 slot ruling: an
`AssetWiringRow`'s `factory` returns the slot and its `demand` predicate reads it, and the slot is
now the Layer's private state (§4.5), so the row must close over the `Runtime` that holds it.

**What this costs.** `GPU_HANDLE_ROWS`' compile-time totality check (`gpuHandleRegistry.ts:519-525`)
does not survive: there is no longer one `EngineGpuHandles` union to be total over. It catches
"added a handle field, forgot the construct row"; under a Layer that bug class is dissolved rather
than left unchecked, because the field and its construction are the same expression, the record
`create` returns. Teardown keeps a guard by reusing the galaxy-field ledger idiom (`own()` at the
allocation site, `destroy` a reverse walk) plus `EngineSubsystemHandles.d.ts`'s
`_EnforceDestroyable` shape applied to `Runtime`.

### 4.3 Composed settings

```ts
// src/@types/settings/LayerSettingsFragment.d.ts
export type LayerSettingsFragment<Key extends string, Cluster> = {
  readonly key: Key;
  readonly initialState: Cluster;
  /**
   * Case reducers over this cluster alone; `liftClusterReducers` re-bases them on the root,
   * keeping the FLAT `settings/<reducerName>` action types the containers already dispatch.
   */
  readonly reducers: LayerCaseReducers<Cluster>;
};

// src/@types/settings/ComposedSettings.d.ts
type ClusterKeyOf<L> = L extends { settings: { key: infer K extends string } } ? K : never;
type ClusterOf<L> = L extends { settings: { initialState: infer C } } ? C : never;

export type ComposedSettings<Layers extends readonly Layer<string, unknown, unknown>[]> =
  CoreSettingsState & { [L in Layers[number] as ClusterKeyOf<L>]: ClusterOf<L> };
```

**TS features relied on, named so a reviewer can check them:** const type parameters (5.0) for tuple
inference at the composition call site; key-remapped mapped types with `as` (4.1), where a `never`
key silently drops out, which is what lets a settings-free Layer contribute nothing without a
branch; `infer K extends string` (4.8) to keep the key literal. Deliberately unused:
`UnionToIntersection`, which works but turns every downstream error into a wall of intersected
object types, and any recursive variadic-tuple walk.

**Reducers do not compose at the type level, and that is the honest boundary.** RTK's `createSlice`
wants one reducer map over one state type, so the root settings slice is assembled at _runtime_ by
merging each Layer's `reducers` under its key, with `ComposedSettings<L>` asserted once at the store
seam, covered by a test that the seeded object's keys equal the composed type's keys.

**Core cannot read a Layer's cluster, structurally.** `EngineState.settings` narrows from
`EngineSettingsState` (22 top-level clusters, 523 lines) to `CoreSettingsState`: `orientation`,
`camera`, `tonemap`, `hdr`, `bloom`, `bias`, `thumbnails`, `labels`, `debug`. A core file naming
`settings.galaxyCatalogs` is then a type error, which is ruling #5.

**A Layer reaches its own cluster through one widening accessor** it exports from
`src/layers/<name>/settings/`: ten known casts in ten known files, each covered by a test that the
seeded cluster satisfies the accessor's return type. Ruled 2026-09-10, against both alternatives.
Making `EngineState` generic over the composition was rejected because it infects every signature
that mentions it (`ContentPass`, `FadeLayer`, `AssetWiringRow`, every selector) to buy ten casts;
declaration-merging a registry `interface` was rejected outright, and the type-aliases-only
convention stands unamended.

```ts
// src/layers/galaxyCatalog/settings/galaxyCatalogSettings.ts
export function galaxyCatalogSettings(settings: CoreSettingsState): GalaxyCatalogSettings {
  return (settings as CoreSettingsState & { galaxyCatalogs: GalaxyCatalogSettings }).galaxyCatalogs;
}
```

The cast is the honest expression of the one fact the type system cannot carry here: this Layer is
present, so its key is in the composed state. Every other file in the Layer calls the accessor, so a
second cast anywhere in `src/layers/` is a review finding.

**Rides this change.** `captureSettings` (`src/state/tour/captureSettings.ts:39-63`) stops being a
roster of ten cluster names spelled twice that silently omits eleven others: each Layer declares
whether its cluster is tour-captured, and the list is a filter over present Layers. Layer-specific
sagas move into their Layers: `watchFlowReseedSaga` to `flow`, `watchBiasBakeSaga` to
`galaxyCatalog` (`src/store/rootSaga.ts`).

### 4.4 `EngineComposition`

```ts
// src/@types/engine/EngineComposition.d.ts
export type EngineComposition<Layers extends readonly Layer<string, unknown>[]> = {
  readonly layers: Layers;
  /** Boot camera + home target + whether to seed selection. Leaves `wireInput`; §9(b). */
  readonly home: EngineHomeConfig;
};
```

`createEngine` takes one. `tier` and `dataUrl` are deliberately absent (§13 A5, A6): `tier` stays
store state the autoLod loop writes, and `dataUrl` is read from the environment, so neither is a
property of the composition. There is likewise no frame-order field: `FRAME_ORDER` is global and
hand-authored in core (§5, ruling #7), and a composition drops what it does not contribute rather
than restating an order.

### 4.5 `EngineState`, after

`subsystems` dissolves (ruling #4). Core keeps eleven of the twenty fields in
`EngineSubsystemHandles.d.ts`: `inputAggregator`, `scheduler`, `fades`, `assetQueue`,
`clickResolver`, `inputBindings`, `cosmoLabelDirector`, `foregroundLabelDirector`, `clipPlayer`,
`clipPathInspector`, `loadProgress`. The other nine move into a Layer's `Runtime`: `galaxyAtlas`,
`proceduralDisks`, `texturedDisks`, `diskPlannerWalk`, `hiResFamous`, `hiResFamousTexture`,
`biasCorrection` to `galaxyCatalog`; `earthTiles` to `body`; `structureFocus` to `structure` (its
focus output becomes a core seam, §6.1).

`gpu` keeps core handles only (targets, compositor, bloom pyramid, label/marker/selection renderers,
pick program, focus uniform); every catalog, body and volume renderer leaves with its Layer.

**`EngineData` and `EngineAssetSlots` dissolve the same way** (ruled 2026-09-10), per Layer, in the
same per-Layer PR that moves its renderers. A Layer's runtime IS its data store, so the wrapper goes
with the bag: `GalaxyStore` becomes a plain `Map` on the galaxy runtime (§9(d), D6). Both bags empty
completely, so `EngineState` loses the `data` and `assetSlots` fields outright rather than shrinking:

- `EngineData`'s three stores: `galaxies` → `galaxyCatalog`, `structures` → `structure`,
  `bodies` → `body`.
- `EngineAssetSlots`' sixteen fields: `points` / `famousGalaxiesMeta` / `pgcAlias` →
  `galaxyCatalog`; `starCatalogs` / `famousStarsMeta` → `starCatalog`; `structureCatalog` →
  `structure`; `cf4Density` / `mcpm` / `polyphorm2Mrs` / `mcpmWorkbench` / `syntheticVolumes` →
  `volume`; `bodyTextures` / `bodyTextureAtlas` → `body`; `filaments`, `flow`, `constellations` →
  their singletons.

Core keeps the asset queue, the demand loop and `wireSlots`' orchestration; what it loses is the
typed bag that names every family's slot, which is what made "a galaxies-only engine still declares
a `structures` store" true. A slot becomes a field of its Layer's `Runtime`, minted by the same
`create` that allocates the renderer its commit closes over, which is why `assets` is
runtime-bound (§4.2). Cross-family slot readers go through the owning Layer: `slotReady`
on a sibling's slot is not expressible, which is the point.

**Three more fields leave in (d)** (§9(d)): the `requests` Set, with `RequestKey` and `ctx.request`,
because the one demand it carried (`pgcAlias` on palette open) becomes a settings read and the other
(the synthetic fallback) a read of the point slots' states (D6); the `famousGalaxiesMeta` getter,
because the value lives on the galaxy runtime and reaches the shell as a fact (D10); and the whole
public handle bar `destroy` and `debug`, because a Layer publishes facts rather than exposing
operations (D6).

### 4.6 Seam by seam

| Layer field          | Contributes to                                                                                                                  | Checking, before → after                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings`           | the root settings slice                                                                                                         | monolithic type, hand-seeded (`initialState.ts`, one 308-line literal) → derived from the tuple; a missing cluster is a type error at the store seam. **Improved.**                                                                                                          |
| `targets`            | `renderTargetRows()` (`src/services/gpu/renderTargets.ts`)                                                                      | `RenderTargetSpec.id` is `string`, tied to passes only by a runtime test (`tests/services/engine/frame/targetParity.test.ts`) → same rows, assert moved to boot so a workbench composition is covered too. **Improved.**                                                     |
| `assets`             | `ASSET_WIRING` + the slot bag                                                                                                   | flat array keyed by `AssetKey`, installed into `EngineState.assetSlots` → concatenation over present Layers, each row's slot living in its own Layer's `Runtime`. **Preserved; the bag is gone (§4.5).**                                                                     |
| `sources`            | `SOURCE_REGISTRY`                                                                                                               | one 32-row table every engine imports whole → `Object.fromEntries` over present Layers; id-domain unions derive per Layer (§4.7). **Preserved, narrowed.**                                                                                                                   |
| `create` / `destroy` | replaces `GPU_HANDLE_ROWS` + `initGpu` / `destroyGpuHandles`                                                                    | compile-time totality over `GpuHandleKey` → bug class dissolved, teardown guarded by the ledger idiom. **Changed; priced in §4.2.**                                                                                                                                          |
| `passes`             | `FRAME_ORDER` (§5)                                                                                                              | three tables that must agree, silent on the third leg → one list; the roster leg is a boot check, the third leg stops existing. **Improved.**                                                                                                                                |
| `fades`              | `FADE_LAYERS`                                                                                                                   | type-level totality over `VisibilityLayerKey` → totality over the present Layers' declared keys. **Preserved, narrowed.**                                                                                                                                                    |
| `labels`             | `Label2DDirector.registerProducer` (`engine.ts:592-617`, five hand calls)                                                       | none → registration derived from present Layers; also closes the `LAYER_GROUPS.labels` totality gap (§11). **Improved.**                                                                                                                                                     |
| `selection`          | `RESOLVE_PICK` (`src/services/engine/helpers/resolvePickTable.ts:51`), `EXTRACT_ROW`, the `resolveFocusId` / `focusIdOf` tables | four per-type tables that must agree, each `Partial`, so a new source type compiles with no arm and resolves every click to `null`, silently → one row per `SelectionRef` type, owned by the Layer that owns the identity, composed into one resolver (§9(d)). **Improved.** |
| `sagas`              | `rootSaga`'s fork list                                                                                                          | 21 hand forks, 4 single-domain → concatenation. **Preserved.**                                                                                                                                                                                                               |
| `ui`                 | the SettingsPanel section list                                                                                                  | hand rows → `.map()` over present Layers. **Preserved.**                                                                                                                                                                                                                     |

### 4.7 Source rows

Ruled 2026-09-10: **the rows split per Layer, the code enum stays global.** `src/data/source.ts`
keeps the `Source` const as-is (append-only numbering is cross-cutting: the codes are persisted in
the `.bin` format and packed into the pick texture's upper 6 bits, so no Layer may own the
numbering, and it is already the leaf that per-source modules import without cycling). The 32 entry
modules move from `src/data/sources/<id>.ts` into `src/layers/<name>/sources/<id>.ts`, and the Layer
lists them as `sources` pairs keyed by their code.

**Reconstituting the flat registry.** The app composition builds it from the tuple:

```ts
// src/services/engine/layer/composeSources.ts
export function composeSources<L extends readonly Layer<string, unknown, unknown>[]>(
  layers: L,
): ComposedSources<L> {
  return Object.fromEntries(layers.flatMap((l) => l.sources ?? [])) as ComposedSources<L>;
}
```

`Object.fromEntries` widens its key type to `string`, so the assert is unavoidable and the TYPE
comes from the tuple rather than from the call, exactly as §4.3's reducer merge does:

```ts
// src/@types/engine/layer/ComposedSources.d.ts
type SourceRowsOf<L> = L extends {
  sources: infer S extends readonly (readonly [number, unknown])[];
}
  ? S[number]
  : never;
export type ComposedSources<Layers extends readonly Layer<string, unknown, unknown>[]> = {
  readonly [R in SourceRowsOf<Layers[number]> as R[0]]: R[1];
};
```

**Id-domain unions become per-Layer derived types.** `GalaxyCatalogId` reads
`Extract<AnyEntry, { type: 'galaxyCatalog' }>['id']` off the whole registry today; it becomes an
`Extract` over `typeof galaxyCatalogLayer.sources` and lives in
`src/layers/galaxyCatalog/types/GalaxyCatalogId.d.ts`. Same move for the structure, volume and
star-catalog id domains. That is strictly better than today: a settings-item key domain stops
depending on a table containing every other family's rows, and adding a source to one Layer can no
longer widen another Layer's union. Cross-Layer readers of a source entry (the pick decoder, the
InfoCard) take the composed registry, which is core-shaped and code-keyed as it is now.

**One declaration per source** (ruled in (d), §9(d) D11). The entry absorbs what the parallel
`GALAXY_CATALOG_SOURCE_REGISTRY` holds today — short name, category, fetcher kind, load priority —
and the Layer's `assets(runtime)` derives one asset row per entry from it, so demand, request and
priority stop being a second table that agrees by construction. The companion relation becomes one
field on the companion's row, `companionOf: <source>`, from which core derives its demand (the
parent is not idle), its priority (the parent's, plus one) and its request (the parent's, so a
companion rides the same tier drift). That is the content of the two backlog items §11 lists against
this seam, and it is what makes adding a source one edit rather than three.

## 5. Frame order

**ONE hand-authored nested list** (ruled 2026-09-10; ruling #7's "global and hand-authored" and #4's
rejection of toposort both stand). Order and roster are the same artifact: a step names the passes it
draws, in draw order. There is no second table for it to disagree with, so the three-tables-must-agree
problem (review finding 4) is dissolved rather than checked.

```ts
// src/@types/engine/frame/FrameStepSpec.d.ts (each member is its own file; inlined here to read)
export type FrameStepSpec =
  | { readonly kind: 'compute'; readonly name: string }
  | {
      readonly kind: 'capture';
      readonly target: string;
      readonly cosmoPasses: readonly string[];
      readonly near0Passes: readonly string[];
    }
  | {
      readonly kind: 'render';
      readonly target: string;
      readonly slab: number;
      readonly passes: readonly string[];
    }
  | {
      readonly kind: 'foreground';
      readonly target: string;
      readonly near0Passes: readonly string[];
      readonly bodyPasses: readonly string[];
    }
  | { readonly kind: 'lens'; readonly target: string; readonly passes: readonly string[] }
  | { readonly kind: 'composite'; readonly source: string; readonly dest: string }
  | { readonly kind: 'bloom' }
  | { readonly kind: 'tonemap'; readonly source: string; readonly dest: string };

// src/services/engine/frame/frameOrder.ts
export const FRAME_ORDER: readonly FrameStepSpec[] = [
  { kind: 'compute', name: 'flow' },
  { kind: 'compute', name: 'atmosphereSkyView' },
  {
    kind: 'capture',
    target: 'sky-cubemap',
    cosmoPasses: ['point-sprites', 'textured-disks'],
    near0Passes: ['star-catalog', 'star-aggregates'],
  },
  { kind: 'render', target: 'volume', slab: COSMO, passes: ['scalar-volume'] },
  { kind: 'render', target: 'zoa', slab: COSMO, passes: ['zone-of-avoidance'] },
  {
    kind: 'render',
    target: 'hdr',
    slab: COSMO,
    passes: [
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'filaments',
      'flow',
      'volume-upsample',
      'zone-of-avoidance-upsample',
      'horizon-shell',
      'structure-markers',
    ],
  },
  { kind: 'render', target: 'star-aggregates', slab: NEAR0, passes: ['star-aggregates'] },
  { kind: 'render', target: 'mw-aggregate', slab: NEAR0, passes: ['milky-way-aggregate'] },
  {
    kind: 'render',
    target: 'hdr',
    slab: NEAR0,
    passes: [
      'milky-way-upsample',
      'milky-way',
      'star-points',
      'star-catalog',
      'star-upsample',
      'constellations',
    ],
  },
  { kind: 'lens', target: 'hdr', passes: ['sgr-a-star-lensing'] },
  // Shipped as THREE (hdr, NEAR0) lines, not one (§13 A1): the glints sit after
  // the lens and merge back into the roster above when it emits nothing, while
  // the trails must draw AFTER the foreground composite to pass in front of
  // their host body. Same target and slab, so each carries its own `slot`.
  { kind: 'render', target: 'hdr', slab: NEAR0, passes: ['body-glints'], slot: 'POST_LENSING' },
  {
    kind: 'foreground',
    target: 'foreground:0',
    near0Passes: ['star-spheres', 'field-star-sphere'],
    bodyPasses: ['earth', 'cloud-shell', 'planets', 'textured-bodies', 'rings', 'atmosphere-shell'],
  },
  { kind: 'composite', source: 'foreground:0', dest: 'hdr' },
  { kind: 'render', target: 'hdr', slab: NEAR0, passes: ['orbit-trails'], slot: 'POST_FOREGROUND' },
  { kind: 'bloom' },
  { kind: 'tonemap', source: 'hdr', dest: 'swap' },
  {
    kind: 'render',
    target: 'swap',
    slab: COSMO,
    passes: ['selection-ring', 'disk-radius-ring', 'marker-lines', 'labels'],
  },
  {
    kind: 'render',
    target: 'swap',
    slab: NEAR0,
    passes: ['near0-selection-ring', 'foreground-labels', 'clip-path-debug'],
  },
];
```

Those are today's 37 `CONTENT_LAYERS` rows in today's order, `frameProgram`'s step sequence, and the
two opt-in flags on the pass rows, as one artifact. The ordering rationale currently split between
`passes/index.ts`'s 200-line header and `frameProgram.ts`'s (why the Milky Way leads its group, why
`rings` and `atmosphere-shell` trail the foreground group, why the multiplicative dust follows the
cloud's own upsample) moves here beside the list it explains. That prose is the artifact's real
value; none of it is derivable.

**Three step kinds carry runtime expansion,** which is what the `frameProgram(tone, bloomEnabled,
foregroundChain, skyCubemapFacesToCapture, sgrAStarLensingBodySlabs)` parameters do today. They
replace those parameters rather than adding a mechanism beside them:

- `capture` expands to two render steps per requested cube face, COSMO then NEAR0, face-major as
  today (`frameProgram.ts:170-173`). Zero faces requested, no steps: the black-hole lens's
  zero-dispatch guarantee, unchanged. Two rosters because the capture spans both slabs and a step is
  the unit of render-pass encoding.
- `foreground` expands over `foregroundChainOrder`, one depth-clearing step per painter-ordered row.
  Two rosters for the same reason: the chain interleaves the NEAR0 row (the star spheres) with the
  body rows (`frameProgram.ts:240-242`), and which roster a row draws is the distinction the six
  body-drawn foreground rows carry as a `slab: 'body'` field today.
- `lens` expands to one `(hdr, BODY[k])` step per entry in the frame's lensing body-slab list, empty
  outside the fade band (`frameProgram.ts:213-221`).

A fourth kind, `tonemap`, is `composite` carrying the tone curve, split out so the `tone: null`
sentinel on the linear foreground composite disappears.

**The executor** resolves each step's names against the passes the present Layers contributed, drops
names whose Layer is absent, and drops a render step left with nothing to draw. The existing
step-level gates stay exactly where they are: `enabled`, the debug `disabledPasses` membership test,
and the empty-group skip (`executeFrame.ts:270-283`). What leaves is the four-predicate filter those
gates sit inside (the `target`/`skyCapture` branch, the `slab === step.slab || 'body'` widening,
`matchesLensPhase`), replaced by a name lookup. Same for `frameProgram`'s derivation walks
(`timedSlotRowsOf`, `plainLayerGroupKeys`): a step's slot list is its `passes` array.

**Price: one extra `(hdr, NEAR0)` render pass** outside the lensing band, where today's
`lensPhase`-free branch emits a single step for the whole NEAR0 roster and `FRAME_ORDER` always
authors two around the lens. The executor therefore merges consecutive render steps sharing a
`(target, slab)` when every step between them emitted nothing. That is a step-level gate of the same
family as the empty-step drop, and it keeps the prep PR behaviour-neutral rather than paying a pass
boundary on a `rgba16float` target every frame.

**Pick keeps its slab grouping** by deriving it: `pickProgram` groups candidates by `layer.slab`
today (`pickProgram.ts:332-333, 351`), so it takes a `pass name → slab` map built once from
`FRAME_ORDER` (a `foreground` step's `bodyPasses` yielding the `'body'` widening it reads now).
Derived rather than declared, from the list that already decides it.

**The startup check**, run once at boot, throwing with the offending name:

1. every pass a present Layer contributed appears exactly once among `FRAME_ORDER`'s non-capture
   steps, so a Layer that adds a pass and forgets the order line fails loudly instead of never
   drawing, and a name that got listed twice fails too;
2. every name in a `capture` roster also appears in one of those steps (a capture roster is a
   re-draw of passes that also draw for the real view, which is why it is the one place a name
   repeats);
3. every step's `target` names a `RenderTargetSpec.id` in the composition's assembled target rows.

The app composition includes every Layer, so its check also catches a typo aimed at any Layer's
pass. `FRAME_ORDER` names no present Layer owns are simply dropped: that is how omission works, not
an error.

**File by file**, verified against the worktree on 2026-09-10:

| File                                               | Loses                                                                                                                                                                            | Gains                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/@types/engine/frame/ContentLayer.d.ts`        | `target`, `slab`, `skyCapture`, `hdrPostLensing` and their ~45 lines of docblock; `EngineState` in four signatures                                                               | the name `ContentPass.d.ts`; `PassState`; a row that cannot name a target that does not exist                           |
| `src/services/engine/frame/passes/index.ts`        | the whole file: the 37-row array, the 37 imports, the 37 re-exports, and the draw-order header, which moves to `frameOrder.ts`                                                   | nothing; passes live in their Layers                                                                                    |
| `src/services/engine/frame/frameProgram.ts`        | `frameProgram` itself (the five parameters become step kinds), the `(target, slab)` matching in `timedSlotRowsOf` and `plainLayerGroupKeys`, and `matchesLensPhase`'s call sites | slot lists read straight off a step's `passes`; `PASS_GROUP_TITLES` and the grouping walks are untouched                |
| `tests/services/engine/frame/targetParity.test.ts` | both parity cases: leg one has no `target` to check, leg two is the boot check's item 3                                                                                          | subsumed; what stays is the row-id uniqueness assert plus one repo test running the boot check over the app composition |

The third leg the review called genuinely unchecked (a pass whose `(target, slab)` matches no
emitted step draws nothing, silently) needs no check at all afterwards: pass membership IS the step.

## 6. Cross-Layer seams

Five. Two are essential and get a core seam; three are accidental and get un-braided.

### 6.1 Focus uniform: essential, core seam, already half-built

`structureFocusSubsystem` does not write the GPU uniform (the review says it does). It produces a
value (`structureFocusSubsystem.ts:116`), `runFrame.ts:517-519` puts it on `ctx.focus` /
`ctx.focusBlend`, and core writes the buffer once per frame at `renderFrame.ts:90`. Readers:
`galaxyPointSpritesLayer.ts:78`, `proceduralDisksLayer.ts:53` and `:83`, `texturedDisksLayer.ts:61`,
plus `gpuHandleRegistry.ts:493` (the capture that forces `focusUniform` to be destroyed last).

So #7's "bundles read ctx, never write it" already holds and both the buffer and the write are
already core. Missing is a name for the production side: core gains a declared `focus` producer slot
a Layer may fill, `structure` fills it, and `runFrame` stops naming
`state.subsystems.structureFocus`. **Price:** one producer per engine, enforced at composition (two
claimants is a boot error). A composition without `structure` leaves `ctx.focus` at its identity
value, the "nothing focused" state the shader already handles, so omission costs the galaxy passes
nothing. Essential, because "the selection recedes the field around it" is a scene-wide fact, not a
`structure`-to-`galaxyCatalog` dependency.

### 6.2 Sky-cubemap capture roster: essential, core seam, already data

Four passes opt in (`galaxyPointSpritesLayer.ts:34`, `texturedDisksLayer.ts:43`,
`starAggregatesLayer.ts:46`, `starCatalogLayer.ts:948`); one consumes
(`sgrAStarLensingLayer.ts:145-146`, sampled at `shaders/bodies/sgrAStarLensing/fragment.wesl:181`).
The roster is already declarative and already survives omission: no `body` Layer means no capture
steps at all, no `galaxyCatalog` Layer means a roster missing those faces' content, and both are
correct. It becomes the `capture` step's two rosters (§5), so the opt-in flag on four pass rows
turns into four names in one list. **Price:** zero, beyond that move. It is named here because the
coupling lived only in prose: a Layer author reading `skyCapture: true` had no way to learn what
consumed it. In `FRAME_ORDER` the roster sits one docblock away from the step that bakes it.

### 6.3 Milky-Way fade keyed on the star hand-off: accidental, plus a residual

`milkyWayCloudLiveness.ts:39-42` fades the cloud on `SCALE_FADE_BANDS.milkyWayApproachSun` and
`.milkyWayApproachGc` (`scaleFadeBands.ts:65,72`: `fullAt 0.002 / goneAt 0.0002 Mpc` and `0.012 /
0.0006 Mpc`). The distance those bands are meant to track is the Gaia crossfade, `gaia-stars.ts:48`
(`crossfadePc: { inner: 8_000, outer: 25_000 }`), consumed at `starCatalogLayer.ts:424`. Two
defects, only one of them this spec's:

- **Location (this spec's).** `scaleFadeBands.ts` is declared data living in
  `services/engine/presentation/` and importing thresholds from `services/`. It moves to
  `src/data/`, which is backlog item `2026-08-31-scale-fade-bands-to-data.md`, already
  user-ruled a separate PR. After it, `milkyWay` and `starCatalog` share a data table instead
  of a `services/` symbol and neither imports the other.
- **Residual (named, not fixed).** The link between `milkyWayApproachSun` and
  `crossfadePc.inner` is a comment (`scaleFadeBands.ts:60-64`), not an import: 2 kpc and 200 pc
  are hand-tuned literals whose contract with 8 kpc nothing checks. Deriving one from the other
  changes behaviour (the numbers do not currently agree), so it is out of scope for a
  composition refactor and becomes its own backlog item when this ships.

### 6.4 `starCatalogVisible` imported by sibling passes: accidental, un-braid

The siblings import an exported predicate, `starCatalogVisible` (`starCatalogLayer.ts:435`, wired to
its own row at `:950`), not an `.enabled` property as the review says: `starAggregatesLayer.ts:34`
to `:48` and `starAggregateUpsampleLayer.ts:15` to `:22`, with tests asserting reference identity
(`tests/…/starAggregatesLayer.test.ts:108`, `…/starAggregateUpsampleLayer.test.ts:87`).

Inside one Layer it stops being a cross-module import: the three passes become siblings under
`layers/starCatalog/passes/` and the shared gate is one function in `layers/starCatalog/render/`,
where the shared `prepareStarCut` walk already wants to live. That is the layer-imports-layer half
of `2026-08-20-star-catalog-layer-god-layer-split.md`. **Price:** that split, which the item says
needs design, becomes part of the `starCatalog` Layer PR (§10e). The two reference-identity tests go
with it; they pin a coupling the split removes.

### 6.5 `FOREGROUND_MAX_DISTANCE_MPC`: accidental, relocation only

Defined at `foregroundMaxDistance.ts:24`. Nine passes import and gate on it (`earthLayer`,
`planetsLayer`, `texturedBodiesLayer`, `ringsLayer`, `cloudShellLayer`, `starSpheresLayer`,
`starPointsLayer`, `bodyGlintsLayer`, `orbitTrailsLayer`), spanning three Layers; three more cite it
in docblocks to explain why it does not apply (`starCatalogLayer.ts:68`,
`fieldStarSphereLayer.ts:29`, `atmosphereShellLayer.ts:56`); two non-pass consumers read it
(`scaleFadeBands.ts:58`, `atmosphereDrawList.ts:27`).

#16 D6 already ruled the step-level hoist out (10 layers across 3 frame steps; one gate cannot
host three, four would over-gate) and this spec does not reopen it. The gates stay put. The only
change: the constant must not be a `services/engine` symbol imported across Layer boundaries, and it
is one of the four anchor constants §6.3's relocation PR moves to `src/data/`. **Price:** none
beyond that PR.

## 7. Reference engine

`src/compositions/galaxiesOnly.ts` (name provisional), composing core plus the `galaxyCatalog` Layer
and nothing else, with a small entry point under `tools/` so it builds and runs. What it proves, and
the list is short on purpose:

- `startLoop.ts:88-97`'s precondition no longer holds: it has both disk renderers (they are
  galaxy renderers, so `wireSlots.ts:97-101` is satisfied) but no Milky-Way cloud and no
  horizon shell. The cheapest composition that breaks that throw, which is why it is the gate
  rather than the workbench.
- the executor emits a short frame (compute prelude, one `(hdr, COSMO)` step, the composite,
  the tone-map, one `(swap, COSMO)` step) with no empty steps, allocating no `mw-aggregate`,
  `star-aggregates`, `zoa` or `foreground:0` target at all. Two thirds of `FRAME_ORDER`'s names
  belong to absent Layers and drop.
- The root settings type contains `galaxyCatalogs` and no other Layer cluster; a core file
  naming `settings.milkyWay` does not compile, and `npm run build` type-checks a composition
  that omits nine Layers.

- the public handle is `{ destroy, debug }` and nothing else: a composition cannot grow a
  per-Layer operations surface, because a Layer's only channel to a shell is the facts it
  publishes into the store (§9(d), D6). The reference engine has no shell to prove that with,
  which is precisely why the type is what proves it.

**It is a gate, not a product.** No UI beyond a canvas, no visual-quality bar, not deployed, allowed
to look bad. Its job is to fail `tsc` the day someone re-couples core to a Layer; a feature request
against it is the signal that it has stopped being one.

## 8. Scene workbench adoption

`tools/scene-workbench` is 42 TS files, most of them a second engine.

- **Drops:** camera and input (`src/input/createSceneInput.ts`), the frame loop and pass
  ordering, render-target and resource management (`src/render/renderResources.ts`,
  `sceneCameraView.ts`, `writeSceneCamera.ts`), and its store/saga bootstrap, which becomes
  core's `createAppStore` parameterized by the composition.
- **Becomes a Layer (`lidar`):** `render/lidarPointRenderer.ts` and `render/uploadPointCloud.ts`
  as its `Runtime`; `scene/parsePoints.ts` and `scene/acceptLoadedAsset.ts` behind an
  `AssetWiringRow`; `state/registry` and `state/view` as its settings cluster; `ui/LayerList`
  and `ui/DisplayPanel` as its `ui` section. Splats land as a second Layer whose only core edit
  is its `FRAME_ORDER` line.
- **Stays workbench-local:** the scene manifest and group-anchor types, the provenance model,
  `GroupPicker`. Authoring concerns, not rendering ones.

Consumer two, sequenced last (§10g) precisely because it is the one that would otherwise let a tool
dictate core's shape.

## 9. Ground preparation

Three prep PRs, each behaviour-neutral, each its own diff, in order, all landing before any Layer is
formed. Separate-versus-riding is the standing checkpoint ask; proposed here as **separate**,
because (a) and (b) touch files no feature commit should be mixed with.

### (a) `ContentLayer` to `ContentPass`, rename only

**Sites:** `src/@types/engine/frame/ContentLayer.d.ts`; the 37-entry `CONTENT_LAYERS` array and its
37 imports plus 37 re-exports in `src/services/engine/frame/passes/index.ts`; the 37 pass files in
that folder; `frameProgram.ts`, `executeFrame.ts`, `pickProgram.ts`, `gpuHandleRegistry.ts:505`,
`slabs.ts`; the `tests/` mirror. Mechanical: `npm run refactor -- rename` for the type, `npm run
move-files -- --manifest` for the files. Guard is the existing suite plus `npm run typecheck`.

**No contract change rides it.** Both halves of §4.1's contract change (the four deleted fields, the
`PassState` signature) land in (c) instead: they are one contract with `FRAME_ORDER`, they are
not mechanical, and a rename diff touching 80 files must stay reviewable by inspection.

### (b) Boot de-coupling

- `wireSlots.ts:97-101` throws without the disk renderers. The precondition belongs inside the
  `galaxyCatalog` Layer's `create`, where those renderers are allocated by the same expression
  that needs them.
- `wireInput.ts:68-69` returns early when `state.gpu.galaxyPointRenderer` is null, abandoning
  the camera, picking and all input. The worst of the three, because the failure is not an
  error, it is an engine with no input. The guard goes; nothing in that phase reads the
  renderer.
- `startLoop.ts:88-97` throws on four named renderers. The invariant it states ("was GPU init
  actually finished") stays; its subject changes to "every present Layer's `create` returned".
- **The Earth home leaves `wireInput`.** Hard-coded three ways across two blocks: the pose
  recipe at `:150-157` (`DEFAULT_FOV_Y_RAD`, a `Date.now()` sim anchor, `computeInitialCamera`),
  the target at `:242-243` (`EARTH_REF`, dispatched as both select and focus), and the
  `isCinemaMode()` branch at `:242` deciding whether the select half is seeded at all. These
  become `EngineComposition.home = { pose, focus, seedSelection }`; the deep-link deference
  guard at `:235` (`selectHasSelectionIntent`) is genuine mechanism and stays. One landmine
  rides along: the comment at `:206-207` ("`watchFocusTweenSaga` no-ops for follow-driver
  bodies") holds today only because the seeded target happens to be a follow-driver body. A
  configurable home target must express that in the type, not in a comment.

### (c) The contract PR: `defineLayer`, the composed settings root, `FRAME_ORDER`

Two contracts, one PR, because each is the other's premise and both are behaviour-neutral with the
app engine still passing every Layer.

- **Composition.** Introduce §4.2's type and §4.3's derivation, and rebuild the app's settings root
  as a composition over ten Layer fragments, so the shipped bundle is equivalent modulo the settings
  assembly. This proves the type-level derivation before any code moves. `initialState.ts`'s
  308-line literal splits into ten `layers/<name>/settings/seed.ts` files plus a core seed;
  `settingsSlice`'s reducers split the same way.
- **Frame order.** Author `FRAME_ORDER` (§5), rewrite the executor's group selection as a name
  lookup, delete `target` / `slab` / `skyCapture` / `hdrPostLensing` from the pass row, and narrow
  the four method signatures to `PassState`. `CONTENT_LAYERS` survives this PR as the app
  composition's contributed-pass list, one array of objects that no longer states an order.

The frame-order half is the larger review surface and the one to read closely: it is where a
mis-transcribed roster line silently changes what draws. The startup check (§5) plus a paired
`npm run perf` before and after are its guards, the perf run specifically because of the
`(hdr, NEAR0)` step-merge rule.

### Growth versus bolt-on, per touchpoint of the `galaxyCatalog` move

| Touchpoint                                                                    | Verdict                     | Note                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContentPass` rows → `passes(runtime)`                                        | **growth**                  | The row's identity is already data; only the closure binding is new.                                                                                                                                                                              |
| `ASSET_WIRING` rows                                                           | **growth**                  | Concatenation over Layers is the shape `FADE_LAYERS` already has.                                                                                                                                                                                 |
| `FADE_LAYERS` rows                                                            | **growth**                  | #7 already specified `fades?: readonly FadeLayer[]` per bundle.                                                                                                                                                                                   |
| `GPU_HANDLE_ROWS` → `create` / `destroy`                                      | **bolt-on if kept as rows** | Keeping the table and adding an `owner: LayerName` field is the re-added key #12 bans, and would not make the renderers private. The table is replaced, not annotated.                                                                            |
| `settings.galaxyCatalogs` cluster                                             | **growth**                  | Already a self-contained record with its own item map.                                                                                                                                                                                            |
| `GALAXY_CATALOG_SOURCE_REGISTRY` + `GALAXY_CATALOG_SOURCES` + `pointRow(...)` | **bolt-on**                 | Three registrations of one fact (review finding 5). Moving all three into the Layer without collapsing them re-homes the duplication instead of removing it. The collapse is the content of §11's first two backlog items and lands with this PR. |
| Label producers (`engine.ts:592-617`)                                         | **growth**                  | Three of the five calls are galaxy/structure producers; the director stays core.                                                                                                                                                                  |
| `RESOLVE_PICK` rows                                                           | **growth**                  | Concatenation; the encoding stays core.                                                                                                                                                                                                           |
| SettingsPanel section                                                         | **growth**                  | Already one component per cluster.                                                                                                                                                                                                                |

### (d) The `galaxyCatalog` Layer and the galaxies-only reference engine

(d) is not one PR. Its ground pass, run 2026-09-12 to 2026-09-14, ruled fourteen decisions, each
judged against every family rather than against galaxies alone, and they land as four stacked PRs:
one behaviour change, one contract PR over the still-empty tuple, one galaxy-side un-braid, then the
Layer itself. The contribution-level verdicts in the table above stand unchanged; what follows is
the shape those rulings converge on, the joints that do not exist yet, the rulings as rules, and the
prep that builds them.

**Ideal shape.** The contract after (d), sketched as the types a reviewer would read first:

```ts
// src/@types/engine/layer/Layer.d.ts — literal-bearing fields become inferred parameters
export type Layer<
  Name extends string,
  Runtime,
  Settings extends readonly SettingsFragmentLike[] = readonly SettingsFragmentLike[],
  Sources extends readonly (readonly [SourceType, SourceEntry])[] = readonly (readonly [
    SourceType,
    SourceEntry,
  ])[],
  Facts = undefined,
> = {
  readonly name: Name;
  readonly settings?: Settings;
  readonly sources?: Sources;
  /** Initial value, const-inferred; `FactsOf<Layers>` types `state.engine[name]`. */
  readonly facts?: Facts;
  readonly targets?: readonly RenderTargetSpec[];
  readonly sagas?: readonly SagaFactory[];
  readonly ui?: LayerUiSection;
  create(deps: LayerCoreDeps<Facts>): Runtime;
  destroy(runtime: Runtime): void;
  passes(runtime: Runtime): readonly ContentPass[];
  assets?(runtime: Runtime): readonly AssetWiringRow[];
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  labels?(runtime: Runtime): readonly Label2DProducer[];
  selection?(runtime: Runtime): readonly SelectionKindRow[];
  /** Once per frame, after the focus uniform, before any pass; `true` keeps the loop awake. */
  frame?(runtime: Runtime): (ctx: ReadyFrameContext, state: PassState) => boolean;
};
// No `handle` (D6), no `tier` (D3), no `swapFormat` (D9), no separate `liveness` (D2).

// src/@types/engine/layer/LayerCoreDeps.d.ts — creation-time core objects ONLY (D7)
export type LayerCoreDeps<Facts> = {
  readonly ctx: GpuContext;
  readonly fadeBgl: GPUBindGroupLayout;
  readonly sourceBgl: GPUBindGroupLayout;
  readonly focusBgl: GPUBindGroupLayout;
  readonly focusUniform: FocusUniform; // core-owned; Layers destroy before core, so the capture is safe
  readonly fades: FadeRegistry; // fadeTo / opacityOf / targetOf
  readonly store: AppStore;
  readonly requestRender: () => void;
  readonly publish: (patch: Partial<Facts>) => void;
  readonly reportSourceCount: (source: SourceType, count: number) => void;
};

// src/@types/engine/layer/SelectionKindRow.d.ts — one row per SelectionRef type (D5, D6'2)
export type SelectionKindRow<Ref extends SelectionRef = SelectionRef> = {
  readonly type: Ref['type'];
  readonly pickSources: readonly SourceEntry['type'][];
  resolvePick(entry: SourceEntry, pick: PickSample): Ref | null;
  extractRow(ref: Ref, simDays: number): SelectionRow | null;
  readonly focusId?: {
    claims(id: string): boolean; // exact knowledge: a prefix or a set, never a catch-all
    decode(id: string): Ref | null; // a claiming row is authoritative even when this returns null
    encode(ref: Ref): string;
  };
};

// src/state/engine/engineSlice.ts — the one facts mechanism (D6)
factsReported({ layer, patch }); // reducer: Object.assign(state.engine[layer], patch)

// src/@types/engine/EngineHandle.d.ts — what the shell holds
export type EngineHandle = { destroy(): void; readonly debug: EngineDebugHandle };
```

```
src/layers/galaxyCatalog/
  layer.ts      defineLayer({ name: 'galaxyCatalog', settings, sources, facts, ui, sagas,
                  create, destroy, passes, assets, fades, labels, selection, frame })
  sources/      the nine entry modules, each carrying shortName, category, fetcher kind,
                load priority and (famousGalaxiesMeta) `companionOf`
  settings/     galaxyCatalogs, plus the `bias` and `thumbnails` clusters out of core
  facts.ts      { provenanceCounts, famousMeta: [], aliasIndex: [], structureMemberCount: null }
  render/       the seven renderers from services/gpu/renderers/galaxyCatalog/ + devTools/diskRadiusRing
  subsystems/   galaxyAtlas, proceduralDisks, texturedDisks, diskPlannerWalk, hiResFamous,
                hiResFamousTexture, biasCorrection (whole, with src/services/biasCorrection/)
  load/         slot wiring, synthetic fallback, dissolveCatalogBuffer, pgcAlias + famousMeta slots
  passes/       point-sprites, procedural-disks, textured-disks, disk-radius-ring
  present/      produceFamousGalaxyLabels, extractGalaxyRow, the selection + focusId rows
  types/        GalaxyCatalogId, GalaxyCatalogRuntime
  ui/           GalaxiesSection(+Container), GalaxyProvenanceSection(+Container)
```

```ts
// src/compositions/app.ts — the first non-empty tuple
export const APP_COMPOSITION = { layers: [galaxyCatalogLayer] as const, home: EARTH_HOME };
// src/compositions/galaxiesOnly.ts — the reference engine (§7), plus a tools/ entry point
export const GALAXIES_COMPOSITION = {
  layers: [galaxyCatalogLayer] as const,
  home: { pose: COSMO_HOME_POSE, focus: null, seedSelection: false },
};
```

The move empties core of the family: five `GPU_HANDLE_ROWS` rows and four `EngineGpuHandles` fields,
seven `EngineSubsystemHandles` fields, `EngineData.galaxies`, three `EngineAssetSlots` fields, four
`FADE_LAYERS` rows, four `CONTENT_PASSES` entries, eleven `ASSET_WIRING` rows, the `famousLabels`
registration, the `SettingsPanel` child, one `rootSaga` fork, `initGpu.ts:90`'s `attachRenderer`,
`wireSlots.ts:107-109,124-129`, and `engine.ts:526-545`'s hand-ordered destroy block.

**Greenfield cross-check.** A blind derivation from the requirements alone, written without sight of
the shipped contract, agreed on everything structural: a Layer is plain data plus one `create`, not a
class or a self-installing plugin; static contributions stay data and runtime-bound ones close over
the runtime; settings clusters are `initialState` + reducers rather than built slices; source rows
live with the Layer while the append-only code allocator stays core; `CoreDeps` is the Layer's whole
window onto core; sagas and the settings section are concatenation and a component reference. Two
divergences mattered. It keys `passes`, `fades` and `pick` as records over each Layer's declared
unions, for totality in both directions, where this spec keeps arrays plus boot checks (§5) — (d)
adopts the record idea only where it is free, in D5's rows, which are data the core composes and
whose per-type-ness is the row's own `type` field. And it gives a Layer no public handle at all: its
only outputs are its declared contributions. D6 ruled the same way, against the sketch (d) started
from, which still carried a `handle?(runtime)` hook.

**Missing joints, growth versus bolt-on.** One row per ruling area, with the blocker as it stands at
`8d806f556`:

| Joint                             | Blocker today                                                                                                                                | Verdict | The joint the ruling creates                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Settings keys through the Layer   | `Layer.d.ts:25` erases them; `appSettingsFragments.ts:21-35` is a hand tuple                                                                 | bolt-on | `Settings` as a const type parameter; the app tuple derives (D1)                      |
| Source codes through the Layer    | three registrations of one source: `data/sources.ts`, `galaxyCatalogSourceRegistry.ts:35`, `assetWiring.ts:222-229`                          | bolt-on | one entry module per source; `composeSources(layers)` (D11)                           |
| The companion relation            | authored three times: `galaxyCatalogSourceRegistry.ts:46`, `assetWiring.ts:249`, `:250`                                                      | bolt-on | `companionOf` on the row; demand, priority and request all derive (D11)               |
| Tier transition                   | `makeRunTierTransition.ts` walks the galaxy registry; `rebuildHiResFamousForTier.ts:88-134`; `staleTierEvict` gated on body keys             | bolt-on | tier as an input to `reevaluateDemand`'s request-drift edge (D3)                      |
| Settings-driven subsystem effects | `ReconcileEffects.ts:39` names `bakeBias`; `makeReconcileEffects.ts:26`; `watchBiasBakeSaga`                                                 | bolt-on | last-applied compare inside the Layer's `frame` hook (D4)                             |
| Fade syncing                      | `visibilityActionRow.ts:44,135` restate every fade row's write side                                                                          | bolt-on | one generic `syncFades()` + an idempotence guard on `applyIntent` (D4)                |
| Per-frame prelude                 | `runFrame.ts:211-235`; `ReadyFrameContext.galaxyPointRenderer`/`.texturedDisks` (`:136,:153`)                                                | bolt-on | `frame?(runtime)`, called for every present Layer in tuple order (D2)                 |
| Liveness and readiness            | `shouldKeepTicking.ts:42`; `engineReady.ts:122-138`'s three galaxy conjuncts                                                                 | bolt-on | the same hook's return value; `isEngineReady` narrows to core (D2, D8)                |
| Selection rows                    | `resolvePickTable.ts` and `extractSelectionRow.ts` are two per-type tables; `ResolveDeps` carries galaxy fields                              | bolt-on | one `SelectionKindRow` per ref type, composed into one resolver (D5)                  |
| Durable focus ids                 | `resolveFocusId.ts:91-165`'s ordered claim table, whose famous arm is the greedy catch-all                                                   | bolt-on | `focusId: { claims, decode, encode }`, claims disjoint by construction (D6'2)         |
| Shell reads of engine data        | `engine.ts:487-503,577-582`'s sub-handles; `useAliasIndex.ts`, `useStructureMemberCount.ts:51`, `useStructureIndex.ts:45`                    | bolt-on | `facts` + `publish`; the shell reads only the store (D6)                              |
| `LayerCoreDeps` gaps              | `galaxyPickRenderer` needs `focusUniform` (`gpuHandleRegistry.ts:502-513`); commits need the fade registry                                   | growth  | four fields added, nothing per-frame (D7)                                             |
| Bootstrap phase for Layers        | `bootstrap.ts:105-110` has no phase where a runtime could be built; `biasCorrection` is eager at `engine.ts:255`                             | growth  | `createLayers` between `initGpu` and `wireSlots`; destroy in reverse tuple order (D8) |
| Swap-format rebuild               | `gpuHandleRegistry.ts:162-166`'s `rebuildOnSwapFormat` flag drives a core walk over `diskRadiusRing`                                         | growth  | the renderer tracks its own format at draw; no hook (D9)                              |
| The pick-camera uniform           | `structureMarkerRenderer.ts:69,359` and `milkyWayPickRenderer.ts:48,161-168` import the galaxy layout; `pickUniformBytesOf` is galaxy-shaped | bolt-on | an 80-byte core camera prefix, shared like the BGLs; the rest is private (D12)        |
| Famous meta's dual home           | `engine.ts:158-160`'s getter, `PassState`, `ResolveDeps`, and a redux copy, all of one slot's value                                          | bolt-on | the value lives on the runtime; the shell copy is a fact (D10)                        |
| SettingsPanel placement           | `SettingsPanel.tsx:78-86` is eight hand-written children                                                                                     | growth  | composed `ui` sections in tuple order, core sections pinned last (D13)                |

**Rulings.** Each states a rule for every Layer, not for galaxies.

1. **D1 — settings and sources become inferred type parameters.** `Settings` and `Sources` join
   `Name`, `Runtime` and `Facts` on the `Layer` type and are inferred as const tuples, so
   `SettingsOf<Layers>` and `ComposedSources<Layers>` derive from the composition and an app tuple reads
   `[...UNFORMED, ...fromLayers]` — one authority instead of two. The `bias` and `thumbnails`
   clusters leave `CoreSettingsState` with the Layer that reads them. Fade keys, pass names and
   target ids stay runtime-bound and boot-checked (§5); their type-level totality is a later ask.
   Closes §13 A8.

2. **D2 — one `frame` hook, whose return value is liveness.** Core calls every present Layer's
   `frame` once per frame, in tuple order, after the focus uniform is written and before any pass
   draws, and ORs the returned boolean into `keepTicking`. One hook replaces both the per-family
   blocks in `runFrame` and the hand-written terms in `shouldKeepTicking`, which is why there is no
   separate `liveness` hook and no `frame` method on `ContentPass`.

3. **D3 — no `tier` hook: tier is an input to the demand loop.** Every asset row gains a generic
   request-drift edge: a NON-IDLE slot — loading, committing, ready or error — whose last request
   differs from `row.req(tier)` reloads in place, and never releases, because a fetch still in
   flight when the tier flips must be superseded rather than allowed to finish at the old tier. That generalises `staleTierEvict` (`reevaluateDemand.ts:97,182`),
   which does exactly this today but only for body-texture keys. A slot keeps serving its last
   committed value across the reload — `loading` and `committing` carry the previous value, so
   `current()` and `slotReady` stay non-null — and `release()` narrows to distance eviction. The
   galaxy row's `req` yields the resolved tier target, which folds `willSourceReload` into the row;
   companions ride their parent's request; the hi-res famous texture becomes a slot row whose
   fetcher allocates and whose commit binds. Deletes `makeRunTierTransition`,
   `rebuildHiResFamousForTier`, `willSourceReload`, `loadCompanionAssets` and the
   `runTierTransition` saga-context entry. Every family then replaces in place on the next frame,
   one way, and a tier swap stops being a bespoke transition.

4. **D4 — no effects seam; settings-driven work reconciles in `frame`.** A Layer compares
   last-applied against current settings inside its own `frame` hook: bias baking calls
   `setBiasMode`, flow reseeding calls `setFlow`. `watchBiasBakeSaga`, `watchFlowReseedSaga` and
   `ReconcileEffects.bakeBias` / `.reseedFlow` go with their `makeReconcileEffects` lines. Fade
   syncing generalises the same way: any settings-route write calls `fx.syncFades()` over all rows
   and `applyIntent` skips when `fades.targetOf(handle)` already equals the target, so `FadeLayer`
   rows carry nothing about actions and `FADE_ROW` plus `VISIBILITY_ACTION_ROW`'s writes half
   (`visibilityActionRow.ts:44,135`) go. `VISIBILITY_ACTION_ROW`'s `actions` half — tour toggling by
   key, read by `applySceneEffect`, `computeSceneEntering`, `scopedVisibilityActions`,
   `splitVisibilityArgs` and `LabelHome` — is Layer knowledge that stays until tour meets Layers.

5. **D5 — one `SelectionKindRow` per `SelectionRef` type.** `selection?(runtime)` returns rows of
   `{ type, pickSources, resolvePick, extractRow, focusId }`, replacing the unconsumed
   `PickResolverRow`. Core composes the present rows into ONE resolver placed in the saga context,
   which replaces `RESOLVE_PICK`, `EXTRACT_ROW` and the galaxy arms of `resolveFocusId` and
   `focusIdOf`; `ResolveDeps` loses its galaxy fields in (d) and dies in (e). `DETAIL_CARD` stays in
   `components/` — the shell may import Layers. An import-boundary ratchet test rides this ruling:
   nothing under `src/services/engine/**` or `src/state/**` may import `src/layers/**`, because the
   reference engine's `tsc` gate cannot catch a galaxy arm left in core when galaxy is present in
   both compositions. The one exempt edge is `settingsSlice.ts:16-31`'s import of the settings
   fragments, which becomes the composed-tuple import once D1 lands.

6. **D6 — no Layer handles; one facts mechanism.** `EngineHandle` is `{ destroy, debug }` and the
   shell reads only the store. A Layer declares `facts` as a plain initial value and publishes
   patches through `deps.publish`; core's `factsReported({ layer, patch })` action merges them under
   `state.engine[layer]`, typed by `FactsOf<Layers>`. One action, one reducer, no query rows and no
   query saga — those were weighed and rejected as more mechanism than the reads justify. Core facts
   stay in the engine slice: `status`, `loadProgress`, `scale`, `hdrCapable`, and `sourceCounts`
   keyed by the composed source union, written through `deps.reportSourceCount` by both the galaxy
   and star commits, because three sagas already `take` that one action as the generic
   catalog-landed pulse. Galaxy facts in (d) are `provenanceCounts`, `famousMeta`, `aliasIndex`
   (built where `pgcAlias` commits, so `buildAliasIndex` moves into the Layer and PGC is stored as a
   number for the serializable check) and `structureMemberCount` (a frame reconcile keyed on the
   selected structure, the catalogs version and the visible mask). The deletions: the `sources`,
   `selection`, `camera` and `volumes` sub-handles and their types, `useAliasIndex`,
   `useStructureMemberCount`, `useStructureIndex`, the `engineHandleRef` in those containers, and
   the `requests` Set with `RequestKey` and `ctx.request` — `pgcAlias` demands on `ui.paletteOpen`
   and the synthetic fallback on the point slots' states instead. `EngineData` dissolves with them:
   a Layer's runtime IS its data store, so the `GalaxyStore` wrapper becomes a plain `Map` on the
   runtime, while `structures` and `bodies` stay in the bag until their own Layers.

7. **D6'1 — readiness is not a row member.** Star focus ids resolve like galaxy ids: the star row's
   `focusId.decode` returns null until the star bin has committed, so every deferral lives at the
   ref stage in `resolveFocusRefDeferring`. That deletes the `resolveDeps().stars.current() === null`
   probe at `watchFocusTweenSaga.ts:89-93` and the star-specific select-now-tween-later path, and it
   repairs the latent `clipFociReady` / `resolveClipFoci` mismatch, where a star id passes the gate
   and then throws in the resolver. The behaviour change — a star deep link selects when the bin
   lands, as a galaxy deep link already does — lands in (e) with the star Layer; (d) only writes the
   contract so the star row needs nothing extra.

8. **D6'2 — claim, then decode; no catch-all.** Every `focusId` row claims by exact knowledge: a
   prefix (`pgc-`, `sdss-`, `pos@`, `star-`, the structure categories) or membership of a set (the
   static body ids, the Milky Way's single id, the loaded famous meta). Claims are disjoint by
   construction, so composition order plays no part, and a claiming row stays authoritative even
   when its `decode` returns null — today's semantics, which "first non-null wins" would have lost.
   A famous id claims only once the meta has loaded, so an unloaded id defers rather than falling
   through. Bodies lose the `body-` prefix and claim bare ids (`earth`, `sirius`) with no alias for
   old links, since no authored tour or clip uses one; the famous-meta commit asserts that no famous
   id collides with the static body set. The prefix drop rides the body Layer in (f).

9. **D6'3 — a pick source is decoded by the Layer that owns the object's identity,** not by the one
   that draws it, and a row returns only its own ref type. The body row therefore lists `famousStar`
   in its `pickSources` and resolves it by static-table lookup to a body ref, while the star row
   lists only `gaiaStars`. This lands in (e)/(f); in (d) all nine galaxy sources belong to the galaxy
   row and nothing is split.

10. **D6'4 — the structure search list becomes a fact in (d).** `wireStructureProjection` publishes
    the ~370-entry list at each group set or clear, the palette selects it, and `useStructureIndex`
    dies with the `sources` sub-handle rather than degrading silently when the handle vanishes. It is
    a core-slice fact until the structure Layer exists, which moves it to structure facts in (e). No
    sub-handle survives (d) except `debug`.

11. **D6'5 — `assetSlots` moves under `debug`,** which is where its only reader (the dev panel)
    already lives. `EngineHandle.debug` carries `timingService`, `frameStats`, `passOverrides`,
    `assetPriorities`, `cameraDebug`, `earthTiles` and `assetSlots`.

12. **D7 — `LayerCoreDeps` carries creation-time core objects only.** Per-frame values — settings,
    tier, selection, clip-player opacity, the label renderer, the camera — arrive through the frame
    context that passes and producers already receive, never through `deps`. It gains `focusUniform`
    (the destroy-order landmine dissolves because Layers are destroyed before core, D8), `fades`
    (the registry: `fadeTo`, `opacityOf`, and D4's `targetOf`), `publish` and `reportSourceCount`.
    It does not gain `cb` (the store is already there) or `request` (dead with D6). `renderTargets`
    and `fontAtlases` join when the Layers that need them do.

13. **D8 — a `createLayers` bootstrap phase.** It sits between `initGpu` and `wireSlots`: core
    objects exist, and nothing that needs a runtime has run. Each Layer's `create(deps)` builds
    everything it owns in one place and the runtime is stored by name. That kills
    `galaxyPickRenderer`'s `constructPhase: 'wireInput'` flag, the conditional
    `wireImpostorSubsystems` call and the eager `biasCorrection` construction. Destroy runs Layers
    in reverse tuple order and then core, so the hand-ordered destroy comments go with the ordering
    they explain. `isEngineReady` narrows to booted plus render targets plus compositor;
    `ReadyFrameContext` loses `galaxyPointRenderer` and `texturedDisks`, since a pass reaches its
    runtime through its closure.

14. **D9 — no `swapFormat` hook.** A Layer renderer that draws to the canvas owns its own format
    tracking: it reads `ctx.format` at draw, keys its pipeline by format, and rebuilds lazily on the
    first draw after a change. In (d) that is only `diskRadiusRing`, the dev overlay. Core's seven
    `rebuildOnSwapFormat` rows keep today's walk; adopting the same idiom there — and deleting the
    flag, `buildSwapRenderers` and the walk in `applySwapFormat` — is adjacent, not (d)'s.

15. **D10 — famous-galaxy meta lives on the galaxy runtime,** set at slot commit, read there by all
    six engine-side readers; the commit also publishes it as the `famousMeta` fact (initial `[]`,
    fail-soft `[]` on error, the reducer storing a copy because immer freezes store state). That
    deletes `EngineState.famousGalaxiesMeta`, `PassState.famousGalaxiesMeta`,
    `ResolveDeps.famousGalaxiesMeta`, `engineFamousGalaxiesMetaReported` and
    `engine.meta.famousGalaxies`, closing the galaxy half of the 2026-07-30 meta-getters item; the
    star twin follows in (e). #522 kept the redux copy because the shell had no other channel, and
    D6 is that channel.

16. **D11 — one declaration per source.** The nine entry modules move to
    `src/layers/galaxyCatalog/sources/` and become the Layer's `sources` tuple, absorbing the
    category, load priority and fetcher kind that `GALAXY_CATALOG_SOURCE_REGISTRY` holds today; that
    registry goes, `SOURCE_REGISTRY` becomes unformed entries plus `composeSources(layers)`, and
    `GalaxyCatalogId` derives from the tuple. `assets(runtime)` derives one asset row per entry —
    demand from the settings toggle, request from the entry's tier target, priority from the entry.
    The companion relation becomes one field, `companionOf`, on the companion's asset row, from
    which core derives its demand (parent not idle), its priority (parent + 1) and its request (the
    parent's, so it rides D3's drift edge). Consumes backlog items B and C whole and the galaxy half
    of A.

17. **D12 — the less code Layers share, the better.** There is no shared pick image and no new core
    packer. Only an 80-byte core camera prefix is shared, as the bind-group layouts already are:
    structure ring picking reads it directly and its buffer shrinks from 192 bytes to 80; Milky Way
    picking gets its own struct of that prefix plus `camPosWorld`, `pxPerRad` from the view the pass
    already has, and a minimum pick size from a data constant instead of the galaxy size slider it
    accidentally tracks today. The galaxy 192-byte image and `pickUniformBytesOf` move into the
    Layer and become private.

18. **D13 — composition order is an authored UX order.** `SettingsPanel` renders the composed
    Layers' `ui` sections in tuple order and then core's own sections (labels and guides, Display ›
    Earth) pinned last. In (d) only Galaxies moves, so the visual order is unchanged. A later
    settings-panel redesign may override this.

19. **D14 — four stacked PRs,** squash-merged in order; see **PR packaging** below.

The `biasCorrection` subsystem and `src/services/biasCorrection/` are absorbed whole by the galaxy
Layer — created in `create` (D8), reconciled in `frame` (D4), settings cluster carried by the Layer
(D1) — and the `EngineSubsystemHandles` field goes. No reader outside the family exists.

**Prep list.**

**P1 — contract types (D1).** Adds the `Settings`, `Sources` and `Facts` type parameters, `const`
parameters on `defineLayer`, and the `SettingsOf` / `ComposedSources` / `FactsOf` derivations;
`APP_SETTINGS_FRAGMENTS` becomes `[...UNFORMED, ...settingsOf(layers)]` with the tuple still empty.
Deletes nothing yet: the parallel authority collapses when the first Layer lands. No test dies; the
fragment-uniqueness and seeded-keys tests stay and now cover a derived tuple. Behaviour-neutral,
`tsc`-proven. Consumes backlog D.

**P2 — the demand loop (D3).** Adds the request-drift edge to `reevaluateDemand`, the
serve-last-value-through-reload behaviour to the slot state machine, and a slot row for the hi-res
famous texture. Deletes `makeRunTierTransition`, `rebuildHiResFamousForTier`, `willSourceReload`,
`loadCompanionAssets`, the `runTierTransition` saga-context entry and `staleTierEvict`'s
body-texture gate. The `makeRunTierTransition` tests die with their subject; `demandTable.test.ts`'s
boot set and `buildSlotsFromRegistry.test.ts` stay and gain the drift edge. **Not
behaviour-neutral** — this is the sequence's only behaviour change, and it gets its own visual and
paired `npm run perf` check.

**P3 — effects into `frame`, fades generic (D4).** Adds the last-applied compare for bias baking and
flow reseeding, `targetOf` on the fade registry, the `applyIntent` idempotence guard, and one
generic `syncFades()` over all rows. Deletes in PR-B: `watchFlowReseedSaga` with
`ReconcileEffects.reseedFlow` and its `makeReconcileEffects` line, flow not being a Layer in (d), so
its reseed compare lives in core's frame step until the flow Layer takes it; and `FADE_ROW` with
`VISIBILITY_ACTION_ROW`'s writes half, whose replacement — the generic `syncFades()` — is core.
Deletes in PR-D: `watchBiasBakeSaga` and `ReconcileEffects.bakeBias`, whose replacement is the galaxy
Layer's `frame`. Each saga's tests die with it; `fadeLayers.test.ts`'s per-layer seed pins stay.
Behaviour-neutral: the reconcile moves from a store subscription to the frame that follows it, which
is the frame the change would have drawn in either way.

**P4 — selection and focus-id composition (D5, D6'1, D6'2, D6'3).** Adds `SelectionKindRow`,
`selection?(runtime)`, the composed resolver in the saga context, claim-then-decode composition over
`focusId` rows, and the import-boundary ratchet test with its one exemption. Deletes
`PickResolverRow`, `RESOLVE_PICK`, `EXTRACT_ROW` and `resolveFocusId.ts`'s ordered claim table.
`resolvePickTable.test.ts`'s per-arm identity tests die with the table; `resolveFocusId.test.ts`
re-points at the composed resolver, and the fragile order coupling it self-flags at `:244`
dissolves, because claims are disjoint. Behaviour-neutral: the star deferral change (D6'1) and the
`body-` prefix drop (D6'2) belong to the Layers that own those rows.

**P5 — facts, and the handle deleted (D6, D6'4, D6'5).** Adds `facts?` on `Layer`, the
`factsReported` action and its reducer, `FactsOf<Layers>`, `publish` and `reportSourceCount` on the
deps, and the structure search list as a core fact published by `wireStructureProjection`. Deletes in
PR-B: the `camera` sub-handle, dead with `logState`; the `volumes` sub-handle, on its own PR already
in flight; `sources.getStructures` with `useStructureIndex`, replaced by the structure fact this PR
publishes from core; and `assetSlots` moves under `debug`. Deletes in PR-D, each waiting for the
galaxy publisher that replaces it: `sources.getCloud` / `.getCloudObjIds` with
`useStructureMemberCount` and `useAliasIndex`, `selection.loadAliases`, the `engineHandleRef`
threading in those containers, and the `requests` Set with `RequestKey` and `ctx.request` — the
`pgcAlias` demand flips to `ui.paletteOpen` in the same PR as the hook that raises the key.
Behaviour-neutral, `pgcAlias` included: same trigger, one fetch.

**P6 — `createLayers`, destroy order, deps, panel (D7, D8, D13).** Adds the `createLayers` phase
between `initGpu` and `wireSlots`, destroy in reverse tuple order before core, the four new
`LayerCoreDeps` fields, and `SettingsPanel`'s composed-then-core rendering. Deletes
`ReadyFrameContext.galaxyPointRenderer` / `.texturedDisks` and narrows `isEngineReady` to booted
plus render targets plus compositor. `gpuHandleRegistry.test.ts`'s totality and
`initGpu.hdrCapabilityWiring.test.ts`'s phase-split totality stay, shrinking only when rows leave
with the Layer. Behaviour-neutral, `tsc`-proven over the empty tuple.

**P7 — the galaxy-side un-braids (D11, D12, D10).** Adds the nine source entry modules under the
Layer with `companionOf` on the famous-meta row, `composeSources`, derived asset rows, the core
80-byte pick-camera prefix with the Milky Way and structure pick paths reading it, and famous meta
on the galaxy store at commit. Deletes `GALAXY_CATALOG_SOURCE_REGISTRY`, the duplicate `ASSET_WIRING`
point rows, the `companions` array, the sibling imports of the galaxy vertex layout
(`structureMarkerRenderer.ts:69`, `milkyWayPickRenderer.ts:48`), `EngineState.famousGalaxiesMeta`,
`PassState.famousGalaxiesMeta`, `ResolveDeps.famousGalaxiesMeta`,
`engineFamousGalaxiesMetaReported` and `engine.meta.famousGalaxies`.
`galaxyCatalogSourceRegistry.test.ts`'s nine-in-enum-order test dies with the registry;
`demandTable.test.ts`'s boot set stays and now pins derived rows, as does `catalogStore.test.ts`'s
iteration-order pin. Behaviour-neutral but for one deliberate change: the Milky Way's minimum pick
size stops tracking the galaxy size slider.

**PR packaging.** Four PRs, stacked, squash-merged in order.

| PR   | Carries                                                                                                         | Character                                                      | Gate                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PR-A | P2                                                                                                              | the one behaviour change, alone                                | suite, visual pass on a tier swap per family, paired `npm run perf`                 |
| PR-B | P1, P3, P4, P5, P6, over the empty tuple: the mechanisms, plus the deletions a core-side replacement makes dead | contract, `tsc`-proven neutral                                 | suite, `npm run typecheck`, the new import-boundary ratchet                         |
| PR-C | P7                                                                                                              | galaxy-side un-braids, neutral but for the Milky Way pick size | suite, a pick spot-check on structures and the Milky Way                            |
| PR-D | the Layer, `EngineData` dissolved, `galaxiesOnly`, and every deletion whose replacement is Layer code           | the feature                                                    | `npm run build` on both compositions, visual pass on the app, paired `npm run perf` |

A deletion rides the PR that lands its replacement. PR-B adds mechanisms over the empty tuple and
deletes only what a core-side replacement makes dead; anything replaced by galaxy Layer code (a
galaxy fact publisher, the bias reconcile in the Layer's `frame`) is deleted in PR-D with that code.

**Open at plan time.** None of these is a decision; each is a check the plan must schedule.

- Every commit path overwrites in place (the body atlas and the star upload are the ones to
  verify), and every `slotReady` consumer tolerates a ready slot that is reloading. P2 depends on
  both.
- `biasCorrection` has no pre-GPU reader once its saga is gone, so it can move to `create`.
- The WESL struct sizes on the structure and Milky Way pick paths match the 80-byte prefix.
- D4's rule covers settings-driven work; a stateless event (a future reseed die) was to go through
  a Layer's public handle, and D6 then removed handles, so that case has no ruled mechanism. Nothing
  needs it today — `ParamSlider.onReseed` has no consumer — and it is open.
- Whether (d) is one plan with four PR gates or four plans.

**Adjacent findings.** Recorded here, not carried: each becomes a `docs/backlog/` detail file when
this plan ships, unless promoted into a PR.

- `utils/network/fetchGalaxyBitmap.ts` imports `GALAXY_ATLAS_SLOT_SIDE` from a subsystem, a
  `utils` → `services` inversion; the constant belongs in `src/data/`.
- Core's seven `rebuildOnSwapFormat` rows could adopt D9's own-your-format idiom, deleting the flag,
  `buildSwapRenderers` and the walk in `applySwapFormat`.
- `VISIBILITY_ACTION_ROW`'s `actions` half is Layer knowledge held in core; it belongs to
  tour-meets-Layers.
- `VisibilityLayerKey` stays a hand-written core union of fade keys; type-level fade totality per
  Layer is the later ask D1 defers.
- `watchTierSaga` reaches into two families: `captureGalaxyFocusIds` re-anchoring (galaxy) and
  `setMilkyWayTuning`'s per-tier star count (milkyWay).
- `src/utils/galaxy/` is a landmine, not a family folder: about 28 of its ~30 files belong to the
  Milky Way ISM generator, and only `galaxySbAmp.ts` and `galaxyMedianAbsMag.ts` are the catalog's.
  Do not move the folder.
- `tools/filaments/buildFilaments.ts` and `tools/mcpm-workbench` read `src/data/galaxyCatalog/*` and
  `services/engine/bake/computeAngularWeights.ts`. The wire format stays in `src/data/` as a shared
  contract; `computeAngularWeights` is pure math and belongs in `src/utils/`.
- `BodyStore`'s setters are called only at seed time, so it is static data wearing a store's shape.
- `resolvePos` (`resolveFocusId.ts:260-299`) is a global argmin across every loaded galaxy source.
  Under D6'2's disjoint claims it stays correct; it would degrade silently if a second Layer ever
  claimed `pos@`.
- `GalaxyRow` is not a complete projection of what anyone asks about a galaxy: the famous
  `calibration` field lives only on the meta, which `diskRadiusRingPass` re-indexes. Harmless inside
  the Layer.

**Backlog consumption.** `2026-08-20-point-source-double-registration.md` (B) and
`2026-07-24-companion-asset-relation-three-homes.md` (C) are deleted with PR-C, index line and
detail file; `2026-09-11-layer-settings-tuple-seam.md` (D) with PR-B; the galaxy half of
`2026-07-30-meta-getters-belong-on-the-data-stores.md` with PR-C, the item surviving for its star
twin. `2026-06-29-source-registry-factory.md` (A) is half-consumed: PR-C closes it for the galaxy
family, and its detail file is rewritten down to the star and volume remainder rather than deleted.

## 10. Migration sequence

Each item is one PR unless stated. (a)-(c) are §9's prep.

- **(d) `galaxyCatalog` Layer formed and moved; the reference engine compiles.** The largest PR
  of the sequence and the only one that both forms a Layer and proves the composition. Consumes
  three backlog items (§11). Gate: `npm run build` on both compositions plus a visual pass on
  the main app.

  **Scope,** widened by the 2026-09-10 rulings and worth stating because it decides the PR's
  size: seven subsystem handles and every galaxy renderer (§4.5); four passes; the settings
  cluster; three label producers; the selection rows; `watchBiasBakeSaga`; the SettingsPanel
  section; **plus** `EngineData.galaxies`, the `points` / `famousGalaxiesMeta` / `pgcAlias`
  slots, and the nine `galaxyCatalog` source rows with `GalaxyCatalogId` re-derived off them
  (§4.7). The data store and the slots are the reason `assets` is runtime-bound, so they cannot
  be deferred to a later PR without the Layer contract meaning something different for one
  family.

  **Four stacked PRs,** ruled by the 2026-09-14 ground pass and specified in §9(d): PR-A the
  demand-loop change alone, PR-B the contract over the still-empty tuple, PR-C the galaxy-side
  un-braids, PR-D the Layer and the reference engine. The prep list P1-P7 and each PR's gate are
  there; what stays here is the ordering constraint, that only PR-A changes behaviour and only
  PR-D forms a Layer.

- **(e) One Layer per PR**, in this order and for these reasons: `starCatalog` (carries the
  god-layer split, §6.4), then `milkyWay` (depends on §6.3's band having moved), then
  `structure` (mints the focus producer seam, §6.1), then `volume` (the family with no
  family-level asset row, review finding 6, so its move collapses the four literal blocks at
  `assetWiring.ts:248-289` into rows), then `body` (the largest `Runtime`: fourteen renderers
  plus `earthTiles`), then the five singletons, which may share one PR.
- **(f) Edenhofer dust as the greenfield proof.** A new `src/layers/edenhoferDust/` built
  entirely from the Layer contract whose only edit outside its own directory is one
  `FRAME_ORDER` line. If that claim fails, the contract is wrong, and this is where we find out,
  before the workbench depends on it. The data is baked and deployed already (review finding 10).
- **(g) Scene workbench re-based on core** (§8). Splats follow as a second Layer.

**Dependency notes.** (c) blocks everything: no Layer can be formed before the settings derivation
exists. (b) blocks the reference engine but not (d)'s move. §6.3's band PR blocks (e)'s `milkyWay`.
Nothing blocks (f) except (a)-(d). (g) blocks nothing and is the last thing allowed to change core's
shape.

## 11. Backlog items this spec consumes

Each is deleted, index line **and** detail file where one exists, in the PR that starts it, per the
backlog-hygiene convention. All seven verified present on 2026-09-09; the two `BACKLOG.md` rows are
index-only, with no detail file to delete. Two items are consumed in part, and a part-consumed
item is rewritten down to its remainder rather than deleted.

| Item, title as written                                                                                                                                | Consumed by                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `2026-06-29-source-registry-factory.md` "Source-registry factory"                                                                                     | (d) PR-C, galaxy half only: the detail file is rewritten to the star and volume remainder |
| `2026-08-20-point-source-double-registration.md` "De-duplicate point-source registration between `GALAXY_CATALOG_SOURCE_REGISTRY` and `ASSET_WIRING`" | (d) PR-C                                                                                  |
| `2026-07-24-companion-asset-relation-three-homes.md` "The companion-asset relation has three homes"                                                   | (d) PR-C, as `companionOf` on the companion's row (§4.7)                                  |
| `2026-09-11-layer-settings-tuple-seam.md` "`Layer.settings` erases the keys the composed settings type needs"                                         | (d) PR-B, by the const `Settings` type parameter (§13 A8)                                 |
| `2026-07-30-meta-getters-belong-on-the-data-stores.md` "Sidecar-meta getters sit on `EngineState`, not on the data stores"                            | (d) PR-C, galaxy half; the item survives for its star twin, (e)                           |
| `2026-08-20-star-catalog-layer-god-layer-split.md` "`starCatalogLayer` god-layer split (three owned concerns, layer-imports-layer)"                   | (e), `starCatalog`                                                                        |
| `BACKLOG.md:48` "Derive `BULK_CATALOG_CATEGORIES` from a registry flag"                                                                               | (e), `structure`                                                                          |
| `BACKLOG.md:54` "`LAYER_GROUPS.labels` totality is unchecked"                                                                                         | (c); label-group membership derives from present Layers' `labels()`                       |
| `2026-08-31-scale-fade-bands-to-data.md` "Move `scaleFadeBands` + its four anchor constants to `src/data`"                                            | §6.3's prep PR, already user-ruled separate                                               |

## 12. Non-goals

Not changed by this spec; a PR that changes them has drifted.

- **Shaders stay put.** One WESL package root at `src/services/gpu/shaders/<layer>/`,
  `package::` import literals, external consumers pinning paths; a Layer's `render/` imports
  them `?static`. Moving them under `src/layers/` breaks the linker's single package root, and
  the symlink-at-leaf landmine makes this non-negotiable.
- **`Source` code numbering** stays append-only; the enum stays outside every Layer, in
  `src/data/source.ts`. Only the entry rows travel (§4.7).
- **Pick and selection encoding** (6+26 bits, WESL parity) stay in core.
- **No toposort**, no derived frame order (#4, ADR 0011).
- **No schema-generated settings UI** (#4). A Layer's `ui` is a hand-written component.
- **The store stays fade-free**, and **`src/data/` never imports `services/`** (§6.3's move
  exists to keep it that way).

## 13. Decision log

The spec's four open questions, ruled 2026-09-10. Transcript:
[grill session Q11-Q14](../../grill-sessions/layer-composition-2026-09-09.md).

| #   | Question                                     | Ruling                                                                                                                                                               | Folded into        |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Q11 | A Layer's access to its own settings cluster | One widening accessor per Layer in its `settings/` folder: ten known casts, each under test. No generic `EngineState`, no `interface` merging, convention unamended. | §4.3               |
| Q12 | `EngineData` and `EngineAssetSlots`          | They dissolve like the subsystems bag, per Layer, in the same per-Layer PR. Both bags empty; `EngineState` loses both fields.                                        | §4.5, §4.2, §10(d) |
| Q13 | `SOURCE_REGISTRY`                            | Rows split into each Layer's `sources/`; the append-only `Source` code enum stays global. The flat registry is reconstituted from the Layer tuple.                   | §4.7               |
| Q14 | Frame order                                  | ONE hand-authored nested list. `ContentPass` loses `target`, `slab`, `skyCapture`, `hdrPostLensing`; the capture roster and the lens split become steps.             | §5, §4.1, §9(c)    |

Plan-time amendments, ruled during (c)'s execution, 2026-09-11:

| #   | Question                                       | Ruling                                                                                                                                                                                                                                                                                                                                    | Folded into       |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| A1  | Orbit trails' place in `FRAME_ORDER`           | A post-composite `(hdr, NEAR0)` render line, not an `HdrPhase` value (#682).                                                                                                                                                                                                                                                              | §5                |
| A2  | Settings-fragment granularity                  | A Layer owns a LIST of settings fragments, one per CLUSTER, not one fragment per Layer.                                                                                                                                                                                                                                                   | §4.2, §4.3        |
| A3  | Fragment action-type namespacing               | Action types stay flat and byte-identical; cross-fragment key collisions are guarded by `assertUniqueFragmentReducerKeys`.                                                                                                                                                                                                                | §4.3              |
| A4  | The frame-visible `EngineState` cut            | `PassState` lands in this PR; `CoreFrameState` is minted in (d), once `gpu` leaves the pass contract.                                                                                                                                                                                                                                     | §4.1, §5          |
| A5  | `tier` on `EngineComposition`                  | Not a field: `tier` stays store state, written only through `requestTier` → `watchTierSaga` → `setTier`.                                                                                                                                                                                                                                  | §4.4              |
| A6  | `dataUrl` on `EngineComposition`               | Not a field: deferred to the PR with a reader, (g) at the earliest.                                                                                                                                                                                                                                                                       | §4.4              |
| A7  | `LayerCoreDeps`' field list, left open by §4.2 | Pinned: `GpuHandleConstructDeps` minus `fontAtlases`, plus `store` and `requestRender`. (d) extends it by `focusUniform`, the `fades` registry, `publish` and `reportSourceCount`, and by nothing per-frame.                                                                                                                              | §4.2, §9(d)       |
| A8  | `Layer.settings` vs the fragment tuple         | `Layer.settings` is typed `readonly SettingsFragmentLike[]`, which erases the literal cluster keys `ComposedClusters` needs, so in (c) `APP_SETTINGS_FRAGMENTS` stays a parallel authority with no check tying it to `composition.layers`; (d) closes it with the const `Settings` type parameter on `Layer`, ruled over the boot assert. | §4.2, §4.3, §9(d) |
| A9  | `ContentPass.blend`                            | Deleted from the pass row: the executor never read it (it reads `CompositeStep.blend`); the §4.1 argument for keeping it described a field with no consumer.                                                                                                                                                                              | §4.1              |
| A10 | `ContentPass.pickTarget` (arrived with #678)   | STAYS on the pass row: it is a pick-side property the pick program folds ahead of every slab, not a frame-sequencing fact, so `FRAME_ORDER` — which states only what draws, where and in what order — is the wrong home for it.                                                                                                           | §4.1, §5          |

Ground-pass rulings for (d), taken one per turn between 2026-09-12 and 2026-09-14 and each judged
against every family. All are premises of §9(d), which carries the rule and its deletions in full.

| #    | Question                             | Ruling                                                                                                                                                                           | Folded into |
| ---- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D1   | Literal-bearing `Layer` fields       | Pinned: `Settings` and `Sources` become inferred const type parameters; app tuples read `[...UNFORMED, ...fromLayers]`; fade keys, pass names and target ids stay runtime-bound. | §9(d)       |
| D2   | Per-frame Layer work                 | Pinned: one `frame?(runtime)` hook, called in tuple order after the focus uniform; its boolean IS liveness. No separate hook, none on `ContentPass`.                             | §9(d)       |
| D3   | Tier transitions                     | Pinned: no `tier` hook. Tier is an input to the demand loop's request-drift edge, and a slot serves its last value through the reload.                                           | §9(d)       |
| D4   | Settings-driven subsystem effects    | Pinned: no effects seam. Reconcile in the Layer's `frame` by last-applied compare; fade syncing becomes one generic `syncFades()`.                                               | §9(d)       |
| D5   | Pick, row extraction, focus ids      | Pinned: one `SelectionKindRow` per `SelectionRef` type via `selection?(runtime)`, composed by core into one resolver. Rides an import-boundary ratchet test.                     | §9(d)       |
| D6   | A Layer's channel to the shell       | Pinned: no Layer handles. `EngineHandle = { destroy, debug }`; a Layer declares `facts` and publishes patches through one core action.                                           | §9(d)       |
| D6'1 | Source readiness on a row            | Pinned: no readiness member. A row's `focusId.decode` returns null until its source has committed, so all deferral lives at the ref stage.                                       | §9(d)       |
| D6'2 | Composing durable focus ids          | Pinned: claim, then decode; claims are exact and disjoint, so tuple order is irrelevant and there is no catch-all row.                                                           | §9(d)       |
| D6'3 | A pick source shared by two families | Pinned: decoded by the Layer that owns the object's identity, not the one that draws it; a row returns only its own ref type.                                                    | §9(d)       |
| D6'4 | The structure search list            | Pinned: a fact from (d), published at each group change; `useStructureIndex` and the `sources` sub-handle die together.                                                          | §9(d)       |
| D6'5 | `handle.assetSlots`                  | Pinned: moves under `debug`, its only reader being the dev panel.                                                                                                                | §9(d)       |
| D7   | What `LayerCoreDeps` may carry       | Pinned: creation-time core objects only; per-frame values arrive through the frame context. Field list in A7.                                                                    | §9(d)       |
| D8   | Where a Layer is built               | Pinned: a `createLayers` phase between `initGpu` and `wireSlots`; destroy runs Layers in reverse tuple order, then core.                                                         | §9(d)       |
| D9   | Swap-format rebuilds                 | Pinned: no `swapFormat` hook. A Layer renderer drawing to the canvas tracks its own format at draw.                                                                              | §9(d)       |
| D10  | Famous-galaxy meta's home            | Pinned: the galaxy runtime, set at slot commit, published as a fact; the four core copies and the redux action go.                                                               | §9(d)       |
| D11  | Source declarations                  | Pinned: one per source. Entries absorb the parallel registry's fields, asset rows derive, and companions become `companionOf`.                                                   | §9(d)       |
| D12  | The pick-camera uniform              | Pinned: only an 80-byte core camera prefix is shared; each family's pick struct is its own. No shared pick image, no new core packer.                                            | §9(d)       |
| D13  | SettingsPanel placement              | Pinned: composed `ui` sections in tuple order, core sections last, so composition order is an authored UX order.                                                                 | §9(d)       |
| D14  | (d)'s packaging                      | Pinned: four stacked PRs — the demand loop alone, the contract over the empty tuple, the galaxy-side un-braids, then the Layer.                                                  | §9(d)       |

## 14. Corrections to the review

| Review says                                                    | The files say                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTENT_LAYERS` is a "32-row array" (§3b item 7)              | **37 rows** (`passes/index.ts:272-427`). The prose header numbers 1-32 because three Milky-Way rows, `zoneOfAvoidance` and two star-aggregate rows sit under merged numbers.                                                                                                                                              |
| the three-table mismatch is silent (finding 4)                 | `tests/services/engine/frame/targetParity.test.ts` already asserts every `CONTENT_LAYERS` target and every `frameProgram` step names a declared `renderTargetRows` id, plus id uniqueness. Genuinely unchecked is only the third leg: a pass whose `(target, slab)` pair no emitted step matches draws nothing, silently. |
| `captureSettings.ts:39-63`                                     | the file is `src/state/tour/captureSettings.ts`, not under `src/data/animation/`. The ten cluster names are spelled twice (destructure, re-assemble) with no compile-time link. 10 of 22 clusters captured, 11 omitted, `orientation` captured separately by `captureScene`.                                              |
| settings `items` seeding is "registry-derived, no edit needed" | true per row, false per cluster: `initialState.ts` is 308 lines, one literal, one delegated helper (`seedVolumeFields()`), and a new family still hand-edits it.                                                                                                                                                          |
| `focusUniform` is "written by `structureFocusSubsystem`"       | it produces a value; core writes the buffer at `renderFrame.ts:90` from `ctx.focus`, so #7's read-ctx-never-write rule already holds (§6.1).                                                                                                                                                                              |
| "two star sibling layers import `starCatalogLayer.enabled`"    | they import the exported predicate `starCatalogVisible` and assign it as their own `enabled`, so the properties are reference-identical and tests pin that (§6.4).                                                                                                                                                        |

## 15. Docs to update when this ships

- `.claude/skills/add-data-source/SKILL.md`: the whole edit-surface map is superseded by "add
  a source row inside the Layer" versus "add a Layer". Also fixes the stale sites review §8
  lists: the click-handler `||` chain, the 11 marker-renderer sites, `structurePoiStyles.ts`,
  `STRUCTURE_CATEGORY_META` (never existed).
- `docs/RENDERER.md`: the renderer map gains the Layer/core split and the boot check;
  `ContentLayer` becomes `ContentPass` throughout.
- `CLAUDE.md`: the "Where to look" tree gains `src/layers/` and `src/compositions/`; the
  one-type-per-file convention gains the amendment that a Layer's `types/` folder is that
  convention's home inside a Layer, not a second `@types/`.
- `docs/DATA.md`: the Edenhofer claim ("no `allowDataFile` entry") is already false
  (`/^edenhofer-dust-.../` exists) and becomes wrong twice over once (f) lands.
