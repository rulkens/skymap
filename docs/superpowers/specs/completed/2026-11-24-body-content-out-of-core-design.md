# Body content out of core: design spec

> **Status.** Shipped 2026-11-24 in PRs #1155, #1157, #1162, #1164 and the PR that files this spec.
> Owner: Alexander Rulkens. Decision recorded in ADR 0016 (`docs/adrs/0016-body-content-rides-layer-rows.md`).
> **Written against** main at b22840624.
> **Inputs.** The galaxies-only spike of 2026-11-23/24 (uncommitted, worktree
> `galaxies-only-reference-engine`; its tools are copied into this worktree's
> `tools/reference-engine/`, uncommitted), the layer composition spec
> ([`2026-09-09-layer-composition-design.md`](2026-09-09-layer-composition-design.md) §7, §12),
> ADR 0011, ADR 0013, and leftovers J1 and J3 in
> [`docs/backlog/2026-10-29-layer-migration-leftovers.md`](../../backlog/2026-10-29-layer-migration-leftovers.md).

## 1. Why

A galaxies-only composition is meant to be embedded in other pages, so its bundle matters. Measured
on this worktree with `tools/reference-engine/vite.payoff.config.ts` (gzip, JS + CSS):

| Build                                                   | gzip   |
| ------------------------------------------------------- | ------ |
| Same-shape baseline (`PAYOFF_OFF=1`)                    | 315 kB |
| Static registries swapped for galaxies-only stand-ins   | 279 kB |

In the 279 kB build, body content that core imports directly, with no registry involved, is
(minified, per source, from `attribute.mts`):

| Source                                              | min     | Reaches core through                                  |
| --------------------------------------------------- | ------- | ----------------------------------------------------- |
| `layers/body/bodies/ephemerisCorrections.generated.ts` | 94.0 kB | `deriveBodyStates → orbitRowPlacement`                |
| `meshoptimizer` (+ `meshFetcher`, `meshBinaryFormat`) | 25.6 kB | `createLayers → meshAssetRows → meshFetcher`          |
| `layers/starCatalog/bodies/famousStars.generated.ts` | 24.5 kB | `deriveBodyStates → sceneAnchors`, `sceneStars`       |
| `layers/starCatalog/bodies/sStarElements.ts`     | 7.7 kB  | `orbitalElements → sStarOrbitalElements`              |
| `data/bodies/meshAssets.generated.ts`               | 6.5 kB  | `meshAssetRows`, `meshPresentations`                  |

This list is a snapshot from before PR B; the paths show where those files live now.

About 160 kB minified. Core also *assumes* bodies: five tables throw at import with no Earth, Moon
or Sun row, and `deriveBodyStates` solves every frame whatever is composed.

The spike's landmine is explained: stubbing the famous stars empties the `solar-neighbourhood`
region, `FOREGROUND_MAX_DISTANCE_MPC` (`src/data/rendering/foregroundMaxDistance.ts:28`) drops to
about 1e-5 Mpc, and `SURVEY_DEEP_ZOOM`'s `in: [0.002, FOREGROUND_MAX_DISTANCE_MPC]` inverts, so
every survey galaxy fades to 0. The ephemeris stub was harmless.

## 2. Rulings (owner, 2026-11-24)

1. **Mechanisms stay in core, content leaves.** The Kepler solver, the body-state map, the camera
   arms, the mesh, orbit-trail and body-pick renderers, the time clock and occluders stay. They run
   on an empty body list. Moving the mechanisms needs a ruling on Layers reading Layers, which
   ADR 0013 left open; it is not this work.
2. **Galaxies-only home is a fixed wide view**: `home: { focus: null, seedSelection: false }`, which
   `homePose` already frames (`src/services/engine/camera/framing/homePose.ts:27`).
3. **Each Layer's body rows carry the ephemeris data and the star anchors.**
4. **The body row contract grows** (explicit yes, twice): an `anchor` position kind; `correction`
   and `pair` on orbit positions; a mesh field on the row (asked as `mesh`, narrowed to
   `shapeModel` in §4.2 so a mesh body does not state its mesh twice).
5. **All four camera arms stay in core**, reading composed rows rather than body tables that throw.
6. **Layers declare their mesh asset rows; core hands them the renderer.** `LayerCoreDeps` gains
   one member (explicit yes).
7. **Survey fade edge falls back to a fixed 0.23 Mpc** when no row gives an extent.
8. **Packaging: three prep PRs, then a small feature PR** (§6).

`ReconcileEffects` and `SagaContext` do not change.

## 3. The principle

A module leaves the galaxies-only bundle when nothing reachable from core's entry imports it by
value. Folder location does not decide it. So:

- **Content is a value on a Layer's row.** The Layer imports its generated file and attaches the
  data to its own rows; core reads rows through `APP_BODY_REGISTRY` and never keys a table by body
  id.
- **A shared helper only Layers import is not core weight.** `meshFetcher` can stay under
  `src/services/loading/`; it leaves the bundle once core stops importing it.
- **A singular lookup becomes a list, a required field, or the composition's home.** Empty is then
  a valid value and no reader handles `undefined`.

Shaders do not move (composition spec §12).

## 4. Contracts

### 4.1 `BodyPosition` (`src/@types/engine/layer/BodyPosition.d.ts`)

```ts
export type BodyPosition =
  | { readonly kind: 'site'; readonly site: SurfaceFixedSite }
  | {
      readonly kind: 'orbit';
      readonly elements: OrbitalElements;
      /** The row's fitted Horizons correction; absent = pure Kepler. */
      readonly correction?: EphemerisCorrection;
      /** Set when `elements` describe a pair barycentre; the body sits the other way from `secondaryId`. */
      readonly pair?: BarycentricPair;
    }
  | { readonly kind: 'anchor'; readonly positionMpc: Vec3 }
  | { readonly kind: 'sampled'; readonly sampled: SampledBody };
```

- `BarycentricPair` loses `primaryId` (the row is the primary):
  `{ secondaryId: SceneBodyId; secondaryMassFraction: number }`.
- `PositionDriver`'s orbit arm carries `correction` and `pair` whole, as it carries `elements`.
- `orbitRowPlacement` takes the orbit driver instead of bare elements, and a lookup of the
  secondary's elements that the fold resolves once (as `BARYCENTRIC_REFLEX_BY_PRIMARY` did in the
  since-deleted `src/data/bodies/barycentricPairs.ts`). Its two callers are `deriveBodyStates` and
  `bodyPositionMpcAt`.
- `OrbitalElements` is untouched: satellites, asteroids and trails read it and none has a
  correction.

### 4.2 `LayerBody` (`src/@types/engine/layer/LayerBody.d.ts`)

```ts
export type LayerBody = {
  readonly body: SceneBody;
  readonly position: BodyPosition;
  readonly rotation?: RotationElements;
  /** Set when a celestial body is drawn from a mission shape model instead of a sphere. */
  readonly shapeModel?: ShapeModel;
};

/** `src/@types/scene/ShapeModel.d.ts` */
export type ShapeModel = {
  readonly meshKey: string;
  readonly boundingRadiusM: number;
  readonly tierCeiling?: Tier;
};
```

`MESH_PRESENTATIONS` keeps its two sources (`src/data/bodies/meshPresentations.ts:22-30`), both now
registry folds: the mesh-body rows, projected as today, and the rows with a `shapeModel`. The body
Layer's five shape models (Phobos, Deimos, Vesta, Ceres, Bennu) get it joined onto their rows by the body Layer from its own id list, replacing
core's `SHAPE_MODEL_BODY_IDS` (`meshPresentations.ts:14`). A `MeshBody` row never sets it: its body
record already carries `meshKey`, and a second copy on the row would be the same fact twice.
`MeshBody` and `MeshPresentation` gain `tierCeiling?: Tier`, joined from `MESH_ASSETS` by the
maker like `boundingRadiusM`, so core never reads the facts table.

### 4.3 `LayerCoreDeps` (`src/@types/engine/layer/LayerCoreDeps.d.ts`)

```ts
/** Core's one mesh renderer, as the two calls an asset slot makes. Safe before the renderer exists. */
readonly meshBodies: {
  readonly setMesh: (id: SceneBodyId, asset: MeshAsset) => void;
  readonly clearMesh: (id: SceneBodyId) => void;
};
```

A shared helper `meshAssetRow(meshBodies, presentation)` (today's `meshBodyRow`,
`src/services/engine/wiring/meshAssetRows.ts:25`) builds one row; a presentation carries `resolvePx`. Each of the four mesh Layers
(body, missions, earthScenes, probeSpheres) keeps `deps.meshBodies` on its Runtime and returns its
own mesh rows from `assets`. Core's `meshAssetRows` and its line in `createLayers.ts:170` are
deleted.

Asset order: the queue breaks equal ranks by array order (`createLayers.ts:163-166`). Mesh rows
take rank 11, one below body textures, because the missions Layer is composed before the body
Layer; a test pins body textures ahead of craft meshes.

### 4.4 `flyToLonLat` payload (`src/state/camera/flyToLonLatActions.ts:14`)

`body?: string` becomes `body: string`. Four call sites pass it; the saga's
`?? SCENE_EARTH.id` (`watchFlyToLonLatSaga.ts:39`) goes.

### 4.5 Home readers (no type change)

`watchGoHomeSaga` (`:48-53`) and `hashParamSources` (`:159`) name `EARTH_REF`. Both read the
composition's home instead. The saga reads `SagaContext.home`, which exists; a `null` focus clears
the selection and tweens to `homePose`. `HASH_PARAM_SOURCES` is a static table with five importers
and no saga context, so it reads a new static registry file, `src/compositions/appHome.ts`
(`APP_HOME`, which `app.ts` also uses for `composition.home`). That is ADR 0013's static
mechanism: one more `app*.ts` file for the later injection work to carry, and wrong for a second
composition in the same bundle in the same way the other static registries are.

## 5. Ground preparation

Sketched as the ideal diff, cross-checked by an agent given only the requirements. It agreed on
§4.1 and chose §4.3 over a core-minted alternative. Verdict per touchpoint:

| Touchpoint                                   | Today                                             | Verdict  | Prep |
| -------------------------------------------- | ------------------------------------------------- | -------- | ---- |
| Go-home, URL home                            | name `EARTH_REF`                                  | bolt-on  | 1    |
| Fly-to default body                          | `?? SCENE_EARTH.id`                               | bolt-on  | 2    |
| `SCENE_EARTH` in always-loaded core          | constant that throws with no Earth row            | bolt-on  | 3    |
| Ephemeris corrections                        | core table keyed by body id                       | bolt-on  | 4    |
| Barycentric pair                             | one-row core table naming Earth and Moon          | bolt-on  | 4    |
| Sun, famous stars, S-stars                   | core tables built from generated star data        | bolt-on  | 5    |
| Shape-model list                             | core hand list of five body-Layer ids             | bolt-on  | 6    |
| Mesh asset rows                              | core mints them beside every Layer's `assets`     | bolt-on  | 6    |
| Survey fade edge fallback                    | —                                                 | growth   | —    |
| Galaxies-only home                           | `focus: null` already framed                      | growth   | —    |
| Empty-registry import test                   | —                                                 | growth   | —    |

Prep commits, in order, each its own commit:

1. **Go-home and the URL read the composition's home.**
2. **Fly-to-lon-lat names its body.**
3. **Core's always-loaded tables read Earth as a list of rows.** `sceneBodies.ts:17`,
   `bodyPickRows.ts:17`, `meshBodySlabHostId.ts:16` and `sceneOccluderBodies.ts:40` fold the
   registry's `EarthBody` rows (zero or one). `sampledCraftPositionMpc.ts:54` reads
   `EARTH_DATUM_RADIUS_M`. `SCENE_EARTH` stays for its 13 Layer readers, which only load when a
   Layer that needs Earth is composed. `EARTH_REF` is then reached only from the app composition
   and Layers. `EARTH_HOME` was folded into `APP_HOME` in PR D (owner, 2026-11-24).
4. **Orbit rows carry their correction and pair** (§4.1). `ephemerisCorrections.generated.ts` moves
   into the body Layer; `tools/bodies/buildEphemerisCorrections.ts` writes there. All 29 corrected
   ids are body-Layer rows. `barycentricPairs.ts` is deleted. This is leftovers J3.
5. **Sun, famous stars and S-stars become star-Layer rows** (§4.1 `anchor`). `appBodies.ts` gains
   the star Layer's rows; `SCENE_ANCHORS`, `SCENE_STARS`, `SCENE_SUN`, `SCENE_S_STARS` and the
   S-star part of `ORBITAL_ELEMENTS` become registry folds. `SCENE_ANCHORS` keeps
   `GALACTIC_CENTRE_ANCHOR`, a core place. The J1 file list moves into the Layer with
   `npm run move-files`. The `SCENE_ANCHORS` row in `src/compositions/README.md` flips to DONE.
6. **Mesh rows are declared by the Layers that draw them** (§4.2, §4.3).

Left alone, on purpose: `trajectoryRegistry` as a hidden solver input (own backlog item); an
occluder registry; places as registry rows.

## 6. Packaging

| PR | Holds                    | Independently valuable because                         |
| -- | ------------------------ | ------------------------------------------------------ |
| A  | prep 1–3                 | core stops naming Earth                                |
| B  | prep 4–5                 | closes leftovers J1 and J3                             |
| C  | prep 6                   | one asset path instead of two                          |
| D  | the feature (§7)         | the galaxies-only numbers                              |

One worktree per PR. B and C both edit the body Layer's row files (corrections in B, shape models
in C), so they run one after the other unless the owner rules otherwise; D waits on all three.

## 7. The feature (PR D)

- **Fade edge fallback.** `foregroundMaxDistance.ts` uses a named 0.23 Mpc constant when no region
  has an extent. `BODY_REGIONS` always has its three rows, so with no bodies the maximum extent is
  0, not `-Infinity`, and the fallback triggers on a zero maximum. The full app's value is
  unchanged; a test pins both.
- **Empty-registry import test.** A Vitest file mocks `compositions/appBodies` to no rows (and gives
  the other registries that state body content a no-content stand-in), imports
  core's entry modules (`services/engine`, `store/rootSaga`, `store/rootReducer`) and asserts
  nothing throws and `deriveBodyStates` returns only core places. It fails the day someone
  re-couples always-loaded core to a body row.
- **The sky capture needs no change.** Core's `CORE_CUBEMAP_CAPTURES.solarSystem` band is a fixed
  500/1000 au (`SCALE_FADE_BANDS.solarSystemSky`), not built from an extent. With no Sun state its
  anchor distance is infinite, so it never bakes and never allocates. The band that does read a
  zero extent is `bodyGlintBackdrop`, which draws nothing without bodies.
- **Measuring kit.** The payoff stand-in `appBodies` returns no rows and the spike composition's
  home becomes `{ focus: null, seedSelection: false }`. Both stay uncommitted, like the rest of
  `tools/reference-engine/` and the two frame-order patches. Committing `galaxiesOnly.ts` is the
  reference-engine work of composition spec §7, not this.
- **Docs.** `docs/RENDERER.md`'s "bodies stay core" bullet, the Layers README status lines about
  "core's mesh slots", the compositions README ledger, and an ADR for §3's principle and the two
  contract growths.

## 8. Not in scope

- Registry injection (`compositions/app*.ts` passed in from the composition).
- An arm registry; moving the mesh, orbit-trail or body-pick renderers; any shader move.
- Clips leaving core (leftovers J4). Overtaken: on the owner's ruling the clip table moved to the
  composition first, as #1164 (`src/compositions/appClips.ts`, `ClipId` derived), so the
  empty-registry test covers `rootSaga`.
- The per-frame cost of the arms and the solver on an empty list beyond "no regression".

## 9. Risks

- **Row order is pick order.** `SCENE_PLANETS` decodes picks by array position
  (`src/data/bodies/scenePlanets.ts:2`). Adding star rows to the registry must not reorder planets;
  each fold filters by kind, and prep 5 has a test for the unchanged order.
- **The solve is per frame.** `deriveBodyStates` gains no per-instant lookup: correction and pair
  resolve at fold time.
- **Generated-file moves.** Three tools write into `src/data/bodies/`; each move repaths its tool
  and regenerates to a zero diff.
- **`move-files` does not rewrite non-import path strings** (the generated headers, docs). Grep the
  old paths after each move.

## 10. Done when

Outcomes measured 2026-11-24 on PR D.

- **Met.** The payoff build with an empty body registry no longer contains the five sources of §1
  (`ephemerisCorrections.generated.ts`, `meshoptimizer`, `famousStars.generated.ts`,
  `sStarElements.ts`, `meshAssets.generated.ts`), and its gzip size is reported against 279 kB:
  **211 kB**, with every `compositions/app*.ts` swapped for a no-content stand-in and no stubs of
  core modules. The same build shape with the app's registries is 305 kB. The spike's 279 kB
  (against 315 kB then) needed stubs and did not draw the survey at 300 Mpc.
- **Met.** Its `#pose=a,0,0,0,0.5,0.3,300,0` shot matches the `PAYOFF_OFF=1` baseline: 804,476
  galaxies loaded in both, the two shots visually identical. Before the fade-edge fallback the
  survey faded out everywhere at that pose.
- **Met.** With no Sun state the `solarSystem` sky capture never bakes: its anchor distance is
  infinite, so it is skipped and never allocated.
- **Met (owner's check, 2026-11-24).** The full app is unchanged in before/after shots of a planet, the
  Earth home and a mission focus, per prep PR.
- **Met.** `npm run perf`, merged ms before → after PR D: earth-surface 14.8 → 14.3, full-survey
  17.9 → 17.8. Solar-system read 10.4 → 13.2, but every pass scaled by the same factor, including
  bloom and the final blit, which this diff cannot touch, and the "after" median equals the
  "before" p90: a machine clock state seen on earlier PRs too, not a code effect. No per-frame code
  changed. `npm run perf:cpu` rows unchanged within noise.
- **Met.** The suite is green.
