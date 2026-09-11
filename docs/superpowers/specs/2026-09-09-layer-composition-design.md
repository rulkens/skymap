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
| **ContentPass** | Today's `ContentLayer`, renamed and narrowed: a name and a gated draw. WHERE it draws is `FRAME_ORDER`'s business (§5), not the row's. A Layer owns several; `galaxyCatalog` owns five.                                                                                                                            |
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
export type Layer<Name extends string, Runtime> = {
  readonly name: Name;

  /** This Layer's settings clusters. Absent = no knobs (§4.3). */
  readonly settings?: readonly SettingsFragmentLike[];

  // Static contributions: plain data, readable without booting anything.
  readonly targets?: readonly RenderTargetSpec[];
  readonly sagas?: readonly SagaFactory[];
  /** This Layer's `SOURCE_REGISTRY` rows, keyed by their global `Source` code (§4.7). */
  readonly sources?: readonly (readonly [SourceType, SourceEntry])[];
  /** The SettingsPanel section: a hand-written component, never generated. */
  readonly ui?: LayerUiSection;

  // Lifecycle: this Layer's private renderers, subsystems, data store and asset slots.
  create(deps: LayerCoreDeps): Runtime;
  destroy(runtime: Runtime): void;

  // Runtime-bound contributions: closures over the Layer's own state.
  passes(runtime: Runtime): readonly ContentPass[];
  assets?(runtime: Runtime): readonly AssetWiringRow[];
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  labels?(runtime: Runtime): readonly Label2DProducer[];
  pick?(runtime: Runtime): readonly PickResolverRow[];
};

// src/services/engine/layer/defineLayer.ts
export function defineLayer<const Name extends string, Runtime>(
  layer: Layer<Name, Runtime>,
): Layer<Name, Runtime>;
```

`defineLayer` is an identity function whose only job is inference: `const Name` pins the name as a
literal (const type parameters, TS 5.0+; the repo is on 6.0.3) and `Runtime` is inferred from
`create`'s return type. A Layer may own several clusters, so `settings` is a LIST bounded by
`SettingsFragmentLike` rather than one `Cluster` type parameter — which means the field erases the
literal keys `ComposedClusters` needs, and `APP_SETTINGS_FRAGMENTS` stays the settings authority
until (d) closes that (§13 A8).

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
same per-Layer PR that moves its renderers. Both bags empty completely, so `EngineState` loses the
`data` and `assetSlots` fields outright rather than shrinking:

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

### 4.6 Seam by seam

| Layer field          | Contributes to                                                            | Checking, before → after                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings`           | the root settings slice                                                   | monolithic type, hand-seeded (`initialState.ts`, one 308-line literal) → derived from the tuple; a missing cluster is a type error at the store seam. **Improved.**                                                                       |
| `targets`            | `renderTargetRows()` (`src/services/gpu/renderTargets.ts`)                | `RenderTargetSpec.id` is `string`, tied to passes only by a runtime test (`tests/services/engine/frame/targetParity.test.ts`) → same rows, assert moved to boot so a workbench composition is covered too. **Improved.**                  |
| `assets`             | `ASSET_WIRING` + the slot bag                                             | flat array keyed by `AssetKey`, installed into `EngineState.assetSlots` → concatenation over present Layers, each row's slot living in its own Layer's `Runtime`. **Preserved; the bag is gone (§4.5).**                                  |
| `sources`            | `SOURCE_REGISTRY`                                                         | one 32-row table every engine imports whole → `Object.fromEntries` over present Layers; id-domain unions derive per Layer (§4.7). **Preserved, narrowed.**                                                                                |
| `create` / `destroy` | replaces `GPU_HANDLE_ROWS` + `initGpu` / `destroyGpuHandles`              | compile-time totality over `GpuHandleKey` → bug class dissolved, teardown guarded by the ledger idiom. **Changed; priced in §4.2.**                                                                                                       |
| `passes`             | `FRAME_ORDER` (§5)                                                        | three tables that must agree, silent on the third leg → one list; the roster leg is a boot check, the third leg stops existing. **Improved.**                                                                                             |
| `fades`              | `FADE_LAYERS`                                                             | type-level totality over `VisibilityLayerKey` → totality over the present Layers' declared keys. **Preserved, narrowed.**                                                                                                                 |
| `labels`             | `Label2DDirector.registerProducer` (`engine.ts:592-617`, five hand calls) | none → registration derived from present Layers; also closes the `LAYER_GROUPS.labels` totality gap (§11). **Improved.**                                                                                                                  |
| `pick`               | `RESOLVE_PICK` (`src/services/engine/helpers/resolvePickTable.ts:51`)     | `Partial<Record<SourceEntry['type'], …>>`: a new source type compiles with no arm and resolves every click to `null`, silently → the Layer owning the source type owns its resolver, so the missing arm is not expressible. **Improved.** |
| `sagas`              | `rootSaga`'s fork list                                                    | 21 hand forks, 4 single-domain → concatenation. **Preserved.**                                                                                                                                                                            |
| `ui`                 | the SettingsPanel section list                                            | hand rows → `.map()` over present Layers. **Preserved.**                                                                                                                                                                                  |

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

## 10. Migration sequence

Each item is one PR unless stated. (a)-(c) are §9's prep.

- **(d) `galaxyCatalog` Layer formed and moved; the reference engine compiles.** The largest PR
  of the sequence and the only one that both forms a Layer and proves the composition. Consumes
  three backlog items (§11). Gate: `npm run build` on both compositions plus a visual pass on
  the main app.

  **Scope,** widened by the 2026-09-10 rulings and worth stating because it decides the PR's
  size: seven subsystem handles and every galaxy renderer (§4.5); five passes; the settings
  cluster; three label producers; the pick resolver; `watchBiasBakeSaga`; the SettingsPanel
  section; **plus** `EngineData.galaxies`, the `points` / `famousGalaxiesMeta` / `pgcAlias`
  slots, and the nine `galaxyCatalog` source rows with `GalaxyCatalogId` re-derived off them
  (§4.7). The data store and the slots are the reason `assets` is runtime-bound, so they cannot
  be deferred to a later PR without the Layer contract meaning something different for one
  family. If the diff proves unreviewable, the split to reach for is the source rows first, as
  their own behaviour-neutral prep, not the slots.

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
index-only, with no detail file to delete.

| Item, title as written                                                                                                                                | Consumed by                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `2026-06-29-source-registry-factory.md` "Source-registry factory"                                                                                     | (d)                                                                 |
| `2026-08-20-point-source-double-registration.md` "De-duplicate point-source registration between `GALAXY_CATALOG_SOURCE_REGISTRY` and `ASSET_WIRING`" | (d)                                                                 |
| `2026-07-24-companion-asset-relation-three-homes.md` "The companion-asset relation has three homes"                                                   | (d); `famousGalaxiesMeta` is a `galaxyCatalog` asset row            |
| `2026-08-20-star-catalog-layer-god-layer-split.md` "`starCatalogLayer` god-layer split (three owned concerns, layer-imports-layer)"                   | (e), `starCatalog`                                                  |
| `BACKLOG.md:48` "Derive `BULK_CATALOG_CATEGORIES` from a registry flag"                                                                               | (e), `structure`                                                    |
| `BACKLOG.md:54` "`LAYER_GROUPS.labels` totality is unchecked"                                                                                         | (c); label-group membership derives from present Layers' `labels()` |
| `2026-08-31-scale-fade-bands-to-data.md` "Move `scaleFadeBands` + its four anchor constants to `src/data`"                                            | §6.3's prep PR, already user-ruled separate                         |

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

| #   | Question                                       | Ruling                                                                                                                                                                                                                                                                                                                                                                                                   | Folded into |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A1  | Orbit trails' place in `FRAME_ORDER`           | A post-composite `(hdr, NEAR0)` render line, not an `HdrPhase` value (#682).                                                                                                                                                                                                                                                                                                                             | §5          |
| A2  | Settings-fragment granularity                  | A Layer owns a LIST of settings fragments, one per CLUSTER, not one fragment per Layer.                                                                                                                                                                                                                                                                                                                  | §4.2, §4.3  |
| A3  | Fragment action-type namespacing               | Action types stay flat and byte-identical; cross-fragment key collisions are guarded by `assertUniqueFragmentReducerKeys`.                                                                                                                                                                                                                                                                               | §4.3        |
| A4  | The frame-visible `EngineState` cut            | `PassState` lands in this PR; `CoreFrameState` is minted in (d), once `gpu` leaves the pass contract.                                                                                                                                                                                                                                                                                                    | §4.1, §5    |
| A5  | `tier` on `EngineComposition`                  | Not a field: `tier` stays store state, written only through `requestTier` → `watchTierSaga` → `setTier`.                                                                                                                                                                                                                                                                                                 | §4.4        |
| A6  | `dataUrl` on `EngineComposition`               | Not a field: deferred to the PR with a reader, (g) at the earliest.                                                                                                                                                                                                                                                                                                                                      | §4.4        |
| A7  | `LayerCoreDeps`' field list, left open by §4.2 | Pinned: `GpuHandleConstructDeps` minus `fontAtlases`, plus `store` and `requestRender`.                                                                                                                                                                                                                                                                                                                  | §4.2        |
| A8  | `Layer.settings` vs the fragment tuple         | `Layer.settings` is typed `readonly SettingsFragmentLike[]`, which erases the literal cluster keys `ComposedClusters` needs, so in (c) `APP_SETTINGS_FRAGMENTS` stays a parallel authority with no check tying it to `composition.layers`; (d) must close it (const `Settings` type parameter on `Layer`, or a boot assert that every Layer's fragments ⊆ the tuple) before the first Layer value lands. | §4.2, §4.3  |
| A9  | `ContentPass.blend`                            | Deleted from the pass row: the executor never read it (it reads `CompositeStep.blend`); the §4.1 argument for keeping it described a field with no consumer.                                                                                                                                                                                                                                             | §4.1        |

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
