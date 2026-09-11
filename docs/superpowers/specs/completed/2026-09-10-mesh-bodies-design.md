# Mesh bodies: whale and petunias in Earth orbit (design)

Two rigid, lit triangle-mesh bodies in a 400 km circular geocentric orbit: a
sperm whale and a bowl of petunias, tumbling, forty metres apart, drawn with
metal/rough PBR and a normal map. The Hitchhiker's Guide easter egg. Later
bodies on this same presentation arm (Voyager on a heliocentric hyperbola, a
person fixed to Earth's rotating surface) are out of scope; the shape here
must not block them. Every decision below is settled. This spec fills in the
file/type contracts and the draw-order placement against the current,
already-shipped body-slab architecture (`docs/superpowers/specs/completed/2026-08-25-body-render-slabs.md`).

## Goal

A `MeshBody` scene body renders as a real triangle mesh, lit by the Sun with
analytic Earth umbra/penumbra darkening and an Earthshine fill term, attached
to Earth's own body-slab row rather than owning one. It is searchable,
pickable, fly-to-able, and its InfoCard carries a static description. Below
3 px apparent diameter it is a tinted glint, exactly like a planet.

## Non-goals

- No shadow map of any kind. Every existing body-lighting effect in this
  codebase (ring shadows, the atmosphere terminator, Earth's day/night split)
  is analytic, and the umbra/penumbra term here follows that convention.
- No new `SceneBody` motion or orientation mechanism: position rides
  `ORBITAL_ELEMENTS`, orientation rides `ROTATION_ELEMENTS`, exactly like a
  moon.
- No Voyager, no surface-fixed person, no second orientation kind (look-at,
  surface-locked). Backlogged (see "Adjacent findings" below) so a future
  agent doesn't have to rediscover why the current shape stops short.

## Data

### `MeshBody`: the fifth `SceneBody` union arm

`src/@types/scene/SceneBody.d.ts` currently unions `EarthBody | StarBody |
PlanetBody | AnchorPointBody` (4 arms, no position field on any of them;
position is always resolved by `deriveBodyStates`). `MeshBody` becomes the
fifth:

```ts
// src/@types/scene/MeshBody.d.ts
export type MeshBody = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number; // bounding-sphere radius, metres
  readonly albedo: Vec3; // mean linear-RGB albedo, measured by the bake tool
  readonly meshKey: string; // key into meshAssets.generated.ts / MESH_SOURCES
  readonly description: string;
};
```

No motion or orientation field, no host field, matching every other arm. The
host for slab attachment is derived at read time from
`elementsById(id).focusId`, never stored a second time. `SCENE_RINGS`' rows
do carry an explicit `bodyId` back to their host (`RingSpec.d.ts`), which is
fine for a ring that can never orbit anything else, but a `MeshBody`'s host
already lives on its own `ORBITAL_ELEMENTS` row, so a second copy here could
only drift from it.

### `meshAssets.generated.ts`: the bake tool's output table

Follows the generated-file header convention exactly (`bodyAtlas.generated.ts:1-4`,
`bodyFacts.generated.ts:1-4`):

```ts
// src/data/bodies/meshAssets.generated.ts
// !!! GENERATED FILE, DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-meshes
// Source of truth:  data/raw/meshes/**
export type MeshAssetRow = {
  readonly key: string;
  readonly path: string;
  readonly boundingRadiusM: number;
  readonly meanAlbedo: Vec3;
  readonly triangleCount: number;
  readonly normalMapSubstituted: boolean;
  readonly source: string;
  readonly licence: string;
  readonly attribution: string; // author + URL; empty string for CC0
};
export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>>;
```

Single source of truth for every geometry-derived number, the same role
`bodyAtlas.generated.ts` plays for atlas layout and `bodyFacts.generated.ts`
for fact-sheet prose. `attribution` exists so the runtime can show credit for
a CC BY 4.0 asset without a second lookup: the two mesh model authors are
credited the same way Solar System Scope's texture credit already is, in the
Splash footer's credits paragraph (`src/components/Splash/Splash.tsx:195-231`).

### Seed table and maker

`src/data/bodies/sceneMeshBodies.ts` exports `SCENE_MESH_BODIES`, built by
`src/data/bodies/makers/meshBody.ts` joining a seed `{ id, label, meshKey,
description }` with `MESH_ASSETS[meshKey]` for `radiusM`/`albedo`. This is
the same join shape `satelliteBody`/`heliocentricPlanet`
(`makers/satelliteBody.ts`) use to join authored identity against derived
numbers, and it lives beside them for the same reason: authoring policy,
single consumer, maker and table change together.

`SCENE_MESH_BODIES` splices into two existing flat registries, both simple
appends:

- `SCENE_BODIES` (`src/data/bodies/sceneBodies.ts:22-28`): the search/focus/
  selection registry every body-aware consumer already iterates.
- `BodyStore` (`src/@types/engine/data/BodyStore.d.ts`): gains a fourth slot,
  `meshBodies: readonly MeshBody[]` plus `setMeshBodies`, populated at boot
  beside `setPlanets`. The store's own docblock already anticipates this
  shape ("one slot per arm, growth").

### Orbit and rotation

Two new `ORBITAL_ELEMENTS` rows (`src/data/bodies/orbitalElements.ts`),
`focusId: 'earth'`, circular (`eccentricity: 0`), `semiMajorMpc` = `(SCENE_EARTH.radiusM

- 400_000) \* SCALE_UNITS.M_TO_MPC`. Mean motion comes from the orbital period
at that radius (Kepler's third law against Earth's GM) fed through the same
`satellite` maker (`makers/satellite.ts`) every moon's row goes through. That
maker takes `periodDays`directly (it does not compute a period from`semiMajorKm`itself; JPL already publishes the moons' periods), so the whale
and petunia rows are the first callers to derive`periodDays` themselves
  before handing it in. A mean-anomaly offset between the two rows places the
  pot roughly 40 m behind the whale along the orbit.

Two new `ROTATION_ELEMENTS` rows (`src/data/bodies/rotationElements.ts`):
tumble poles, `spinRateDegPerDay` for roughly one turn per 3 minutes (whale)
and faster (pot). No new `RotationElements` field; the type already carries
exactly pole, prime-meridian and spin rate.

### Pick

`Source` enum's next free code is 32 (`McpmWorkbench: 31` is the last row in
`src/data/source.ts`); `Source.MeshBody = 32`. A new
`src/data/sources/mesh-body.ts` exports `MESH_BODY_ENTRY` (`type: 'body'`,
`code: Source.MeshBody`, `id: 'mesh-body'`), mirroring `sources/planet.ts`
and `sources/sgr-a-star.ts` exactly. `BodyId`
(`src/@types/data/body/BodyId.d.ts`) is derived from `type: 'body'` registry
rows, so this one entry widens it automatically, with no second place that
needs to learn the new id.

`PICK_SEEDS_BY_BODY_ID` (`src/services/engine/helpers/resolvePickTable.ts:36-49`)
gains `'mesh-body': SCENE_MESH_BODIES`. Pick draw reuses
`bodyPickRenderer.drawSphere` (`src/services/gpu/renderers/bodies/bodyPickRenderer.ts:384`)
against the bounding sphere, composed via `bodySlabFlooredPick`
(`src/services/engine/helpers/bodySlabFlooredPick.ts`) with the value the
"Model matrix" section below defines, since the pick proxy sphere sits at
the mesh body's own position while riding the host's slab row.

### Selection and the InfoCard

`BodyInfo` (`src/@types/engine/BodyInfo.d.ts:24-31`) and the body arm of
`SelectionRow` (`src/@types/engine/SelectionRow.d.ts:28-41`) both gain
`description?: string`, threaded through:

- `extractSelectionRow.ts`'s `body` arm (`src/services/engine/helpers/extractSelectionRow.ts:51-67`)
  reads `body.description` off the static `SCENE_BODIES` record, the same
  way it already reads `standoffRadii`/`focusDistanceRadii`.
- `buildFocusable.ts`'s `body` arm (`src/services/engine/helpers/buildFocusable.ts:39-49`)
  carries `description: row.description` into the `BodyInfo`.
- `BodyDetailCard.tsx` renders it in a new block beside the existing `orbit`
  block (`src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx:201-217`),
  using the already-imported `DescriptionBlock` component
  (`BodyDetailCard.tsx:58`), the same component the compiled-in `BODY_FACTS`
  description (`BodyDetailCard.tsx:223-227`) and the async famous-star-meta
  description (`BodyDetailCard.tsx:305-307`) each use. `target.description`
  is a **third**, independent field: it must not route through either of
  those two existing paths. `BODY_FACTS[id]` stays keyed to Earth/planets/
  moons only (no mesh-body row is ever added there), and
  `famous_stars_meta.json` stays keyed to famous stars only. A mesh body's
  description is synchronous, compiled-in `SceneBody` data, exactly like
  `orbit` is for an S-star.

### Search

Automatic via `SCENE_BODIES` membership. `bodySearchNames.ts`'s `AUTHORED`
array (`src/data/bodies/bodySearchNames.ts:20-25`) gains two entries: the
whale id with `['whale']` and the petunia id with `['petunias', 'bowl of
petunias', 'oh no not again']`.

### Settings and the URL: what a `type: 'body'` entry gets automatically

Registering `MESH_BODY_ENTRY` seeds one row, `settings.bodies.items['mesh-body']`
(`{ enabled: MESH_BODY_ENTRY.visible, labelEnabled: true }`), the same
derivation every `type: 'body'` registry row gets
(`src/state/settings/initialState.ts:239-246`). Two consequences follow, and
they are not symmetric:

- **`.enabled` gets no UI.** `setBodyLabelEnabled` is the only writer
  `settingsSlice.ts` defines for the `bodies` cluster; its own comment
  (`settingsSlice.ts:307-313`) states plainly that `.enabled` is seeded from
  the registry row and read only by `visibleStars` (the Sun's dot) and
  `foregroundLabelsLayer` (the Sun's caption), and that "no product decision
  has been made to expose a 'hide this body' control, so no setter exists to
  turn it into a knob nothing turns." Earth, the planets and Sgr A\* all carry
  this same inert field today (nothing reads `.enabled` for them at all). A
  mesh body's `.enabled` would be exactly as inert, with no code change
  needed to keep it that way.
- **`.labelEnabled` gets a real, new checkbox, if `bearsLabel: true`.**
  `LABEL_CATEGORIES` (`src/data/structure/labelCategories.ts`) is every
  `SOURCE_ENTRIES` row with `bearsLabel: true`, and the Labels & Guides
  settings panel renders one row per category automatically
  (`LabelsAndGuidesSectionContainer.tsx`). Because `PICK_SEEDS_BY_BODY_ID`
  and every other body precedent (`PLANET_ENTRY`, `SGR_A_STAR_ENTRY`) sets
  `bearsLabel: true` so the body captions itself on approach, mirroring that
  for `MESH_BODY_ENTRY` adds one new checkbox to that panel. The row is
  per-CODE, not per-scene-body: it mutes the whale's and the petunias'
  captions TOGETHER, the same way today's single "Planet" row mutes every
  planet's caption together, because both mesh bodies share the one
  `Source.MeshBody` registry entry. **This needs a ruling**: a shared
  whale+petunias caption toggle is presumably wanted (matching every other
  body's presentation), but it is a real, user-visible new UI row, and a
  split (one toggle per body rather than per source code) would need a
  second registry entry, not a flag on this one.

Deep-linking is automatic too, at no extra cost: focusing/selecting a mesh
body encodes `#focus=body-<id>` the same way every other body does
(`src/state/url/hashParamSources.ts`), since that path dispatches on
`SelectionRef.type === 'body'`, not on source code.

## Assets and the binary format

### Raw sources

`data/raw/meshes/<key>/` holds the source GLB, a `LICENSE` file, and a
README row recording licence, URL, author, fetch date, checksum: the same
provenance shape every other `tools/utils/io/rawDataRegistry.ts` entry
carries (`RawDataEntry.upstream`/`readme`, see e.g. the `textures.*` block,
`rawDataRegistry.ts:535-546`). `RAW_DATA` gains `meshes.dir` (`kind:
'directory'`) plus one entry per mesh source file.

`tools/utils/io/meshSources.ts` mirrors `textureSources.ts`
(`tools/utils/io/textureSources.ts:20-25`): one row per mesh key naming its
raw `RawDataKey`, so the fetch step and the build step can't drift onto
different filenames:

```ts
// tools/utils/io/meshSources.ts
export type MeshSourceEntry = { readonly native: RawDataKey };
export const MESH_SOURCES: Readonly<Record<string, MeshSourceEntry>>;
```

**Pre-bake.** A source carrying more than one material is flattened to one by a
committed, hand-run headless Blender script (`tools/meshes/prebake/`) that
strips edge/line geometry, joins the meshes, and bakes every material's base
colour into a single albedo atlas on a fresh UV set; `MESH_SOURCES` then names
that pre-baked GLB rather than the download. The tool's one-material refusal
therefore stands unchanged: multi-material input is an authoring problem,
solved upstream, so nothing in the `.mesh` format, the renderer or the shaders
learns about material stacks.

### Baked outputs

`public/data/meshes/<key>.mesh` plus `<key>_albedo.png` (sRGB), `<key>_mr.png`
(linear) and `<key>_normal.png` (linear; LANDMINE: normal maps decode
linear, never sRGB, the same rule `isLinearTextureKind` already encodes for
the planet-texture pipeline). Served via `dataUrl()`
(`src/services/loading/fetchWithProgress.ts:29`) and the data manifest like
every other public asset; R2 sync of `public/data/meshes/` is a deploy step
(docs/DEPLOY.md).

### `.mesh` binary format

Little-endian. Header:

| field           | type | bytes |
| --------------- | ---- | ----- |
| magic `'SKMH'`  | u8×4 | 4     |
| version         | u16  | 2     |
| vertexCount     | u32  | 4     |
| indexCount      | u32  | 4     |
| boundingRadiusM | f32  | 4     |

Then `vertexCount` interleaved vertices, stride 48 bytes: position (f32×3),
normal (f32×3), tangent (f32×4, `w` = handedness), uv (f32×2). Then
`indexCount` u32 indices. Geometry is authored in metres and passes through at
native scale: both chosen sources turned out to be modelled at real-world size
(the whale's bbox spans 12.9 m), so the tool has no `--length-m` knob to
rescale them with.

### Tool

`tools/meshes/buildMeshes.ts` (npm script `build-meshes`, chained into
`npm run build-data-manifest` like every other `public/data`-writing script),
plus one-symbol helpers `writeMeshBinary.ts`, `generateTangents.ts` (uv-
gradient accumulation, handedness in `w`), `meanAlbedo.ts`. Uses
`@gltf-transform/core` (plus functions) as a devDependency for reading,
decimating, and resizing; the runtime never parses glTF, only the `.mesh`
format above.

Constraints: one material. The tool refuses multi-material input rather than
silently picking one; several primitives sharing that one material are merged,
not refused (the whale ships as three). A source with no normal map gets a 1×1
flat normal, a printed warning naming the asset, and
`normalMapSubstituted: true` on its generated row; one with no
metallicRoughness map likewise gets a 1×1 constant from the material's scalar
factors. An authored `TANGENT` is used as-is and only generated when absent.
Skinning and animation are dropped at convert time, baking the rest pose. Triangle-budget (decimate) and texture-size-budget
(resize) are tool constants. Provenance is reported to the user before any
asset is committed.

## Ground preparation

Five prep refactors, each its own commit. Packaging: prep 1+2 ship as one
small PR (both are independently legible, self-contained no-op refactors with
no feature-code consumer yet); prep 3, 4 and 5 ride the feature PR, since
none has a consumer without `MeshBody` in the picture. P1 to P4 are growth on
the existing architecture, not bolt-ons: the joints already exist, they just
assume today's closed set of two callers (planets, or planets plus anchors).
P5 is a plain extraction with a new second caller waiting for it.

### P1: `orientationForBody` gates on the wrong membership test

`src/data/bodies/orientationForBody.ts:33` gates rotation on
`bodyTextureSpec(id)` (texture-registry membership) rather than on whether a
`ROTATION_ELEMENTS` row exists for the id. That's a proxy that happens to
hold today (every textured body has a rotation row, and vice versa), but a
mesh body needs a real tumble rotation while carrying no texture-registry
entry at all. `deriveBodyStates.ts:106` calls `orientationForBody(el.id,
simDays)` for every `ORBITAL_ELEMENTS` row unconditionally, so under the
current gate a mesh body would silently get `IDENTITY_MAT3` forever.

Growth: gate on rotation-row presence instead, finding the row with an
`IDENTITY_MAT3` fallback when absent. Behavioural no-op for every existing
body (the two memberships still coincide for planets/moons/Earth). Unit
test: the three existing textured/untextured/anchor cases plus a fixture id
with a rotation row but no texture entry.

### P2: pick pack and unpack read two different tables

`sceneBodyPickId.ts:20-26` (the pick-pack side, caption pick identity) is a
hand-written if-chain (`earth` to `sgr-a-star` to planet index to star
fallback); `resolvePickTable.ts`'s `PICK_SEEDS_BY_BODY_ID`
(`resolvePickTable.ts:36-49`, the unpack side) is already a registry keyed on
`BodyId`. Adding `mesh-body` to the unpack registry without touching the
pack side leaves a body whose caption pick can never resolve; the two sides
can silently disagree about which ids exist.

Growth: pack and unpack both read the one registry (`PICK_SEEDS_BY_BODY_ID`
or a shared table it's promoted to). `sceneBodyPickId` becomes a lookup plus
`seedIndexOfBody` against the matching row instead of a growing if-chain.
Unit test: the three existing cases (earth, sgr-a-star, planet) plus the
star fallback, unchanged.

### P3: `bodySlabRow`'s near plane only knows about its own body

`bodySlabRow` (`src/services/engine/frame/slabs.ts:234`, the `near`
computation at `:284`) takes one body and clamps the near plane against that
body's own drawn radius. A mesh body attached to Earth's row can sit closer
to the camera than Earth's own near-plane margin computes for (the whale in
front of the globe, close-up), and nothing today lowers the host row's near
plane to protect it.

Growth: `bodySlabRow` accepts the attached bodies (via `meshBodiesAttachedTo`,
defined below) and, for each, computes its near face as `|posM −
hostPose.eyeRelBodyM| − radiusM` (`posM` from `bodyStateInHostFrame`, the
same value the draw path uses; see "Model matrix" under "Rendering"),
lowering `near` to the nearest such face when it is closer than the host's
own. Tests: camera at 800 km altitude with an attached body 50 m ahead, near
< 50 m; an attached body behind the host, near unchanged.

### P4: `partitionBodiesByPresentation` is typed to `PlanetBody` alone

`partitionBodiesByPresentation` (`src/services/engine/frame/partitionBodiesByPresentation.ts:72-114`)
takes `bodies: readonly PlanetBody[]` and returns `{ glints, flat, textured
}`; its one caller, the adapter `sceneBodyPartition`
(`src/services/engine/frame/sceneBodyPartition.ts:44`), feeds it
`state.data.bodies.planets` only. `BODY_GLINT_MAX_PX = 3`
(`partitionBodiesByPresentation.ts:48`) is already the exact threshold the
brief's glint handoff wants.

Growth: widen `bodies` to `readonly (PlanetBody | MeshBody)[]`, add a fourth
`meshes` branch, and route on type before the existing texture-residency
check. A `MeshBody` at or above the pixel floor always lands in `meshes` (it
carries no `bodyTextureSpec` entry, so it would otherwise fall into `flat`).
`sceneBodyPartition` widens its input to `[...state.data.bodies.planets,
...state.data.bodies.meshBodies]`. Tests: a mesh body below the pixel floor
lands in `glints`; at or above it, `meshes`; the four branches disjoint and
covering over a fixture mixing both body kinds.

### P5: `rotateByTranspose` is private to `bodyRelativePose`

`bodyRelativePose.ts:21-27`'s `rotateByTranspose` (rotate a vector by a
`Mat3`'s transpose) is the exact operation `bodyStateInHostFrame` (see
"Model matrix" under "Rendering", below) also needs, to place a mesh body
inside its host's slab. Today it's a private, unexported helper with one
caller.

Growth: extract to `src/utils/math/rotateByTranspose.ts` (one symbol per
file, per convention); `bodyRelativePose` imports it instead of declaring it
locally. Behavioural no-op. Rides the feature PR: it has no second caller
until `bodyStateInHostFrame` exists.

## Loading path

`src/@types/loading/MeshReq.d.ts` names the request (`meshKey: string`);
`src/@types/data/mesh/MeshAsset.d.ts` names the fetcher's resolved payload
(the typed-array views into the decoded `.mesh` buffer plus the three
decoded `ImageBitmap`s), mirroring `FilamentCloud`'s role for the filament
fetcher.

`src/services/loading/fetchers/meshFetcher.ts`, a
`Fetcher<MeshAsset, MeshReq>`, fetches the `.mesh` file via `dataUrl()` (the
`filamentFetcher.ts` pattern: `dataUrl` plus `fetchWithProgress`, then a
`decodeMesh` step validating magic and version against the header table
above and returning the typed-array views), then fetches and decodes the
three PNGs (`colorSpaceConversion: 'none'` for `_mr`/`_normal`, matching
`bodyTextureFetcher.ts:54-56`'s `isLinearTextureKind` treatment; default
managed decode for `_albedo`).

`src/services/engine/wiring/meshSlotRegistry.ts` mirrors
`bodyTextureSlotRegistry.ts`: commit routes the decoded `MeshAsset` to
`state.gpu.meshBodyRenderer?.setMesh(id, asset)`, release calls
`meshBodyRenderer?.clearMesh(id)`. A demand row per mesh body in
`assetWiring.ts` mirrors `bodyTextureRow` (`assetWiring.ts:144-162`): demand
inside a load radius derived from the body's `radiusM`, release past twice
that radius, the same hysteresis band `bodyTextureRow` uses to stop a
camera dithering at the boundary from thrashing the load/free cycle.
Residency predicate: `meshBodyRenderer.hasMesh(id)`. Until resident the body
draws nothing resolved, no placeholder mesh, so a body inside the glint
partition boundary but not yet loaded is simply invisible rather than a
wrong shape.

## Rendering

### Renderer and shaders

`src/services/gpu/renderers/bodies/meshBodyRenderer.ts`: one pipeline; a
vertex + index buffer and three textures per mesh key; a uniform buffer per
body (mvp as f32 narrowed from an f64 compose, model rotation, `sunDirLocal`,
`sunVisibleFraction`, Earthshine colour/strength, `camPosLocal` for the view
vector). Depth write on, reversed-Z, reading `SLAB_REVERSED_Z`
(`src/services/engine/frame/slabs.ts:175`) rather than hard-coding the
reversed branch, the same discipline `bodySlabRow` itself follows
(`slabs.ts:289-297`) so the two can never disagree if the constant ever
flips. Draws into the foreground target of the host row.

Shaders `src/services/gpu/shaders/bodies/meshBody/{vertex,fragment}.wesl`:
vertex transforms position/normal/tangent by the model matrix; fragment
builds the TBN frame, samples albedo/mr/normal, calls the shared `pbrDirect`
(`src/services/gpu/shaders/lib/pbr.wesl`) with `sunDirLocal`, multiplies the
result by `sunVisibleFraction`, and adds an Earthshine fill term (host
albedo times strength times the fraction of the body's hemisphere facing
the host, `dot(n, dirToHost)` clamped to `[0, 1]`). Follow the
`wesl-shaders` skill's conventions.

### Model matrix: attaching to the host's slab, not owning one

A mesh body never gets its own body-slab row: `frameContext.ts`'s
`slabBodyCandidates` (`frameContext.ts:204-210`) and `BODY_SLAB_CAPACITY`
(`frameProgram.ts:89`, `1 + SCENE_PLANETS.length +
SCENE_ANCHOR_POINT_BODIES.length`) stay exactly as they are, the rings-layer
pattern (a ring rides its host's row too) applies unchanged. A free-flying
mesh body (Voyager) would need to join `slabBodyCandidates` instead; that is
future work, named in "Adjacent findings" only to record that this is the
seam it would grow through.

Instead, `src/utils/scene/meshBodiesAttachedTo.ts` maps a host body id to the
mesh bodies whose `elementsById(id).focusId` equals it:

```ts
// src/utils/scene/meshBodiesAttachedTo.ts
export function meshBodiesAttachedTo(hostId: string): readonly MeshBody[];
```

A new `src/services/engine/frame/passes/meshBodiesLayer.ts` (`slab: 'body'`,
`target: 'foreground:0'`) is registered after `texturedBodiesLayer` and
before `atmosphereShellLayer` (`src/services/engine/frame/passes/index.ts:398-426`,
composited under the atmosphere shell). Its `enabled`/`draw` read
`view.slab.frame.bodyId`, call `meshBodiesAttachedTo(bodyId)`, intersect with
the `meshes` branch of `sceneBodyPartition`'s output, and skip entirely when
empty, the standard `'body'`-layer gate every other body layer already
follows.

Placing a mesh vertex inside the host's row needs one new util,
`src/utils/scene/bodyStateInHostFrame.ts`:

```ts
// src/utils/scene/bodyStateInHostFrame.ts
export function bodyStateInHostFrame(
  body: BodyState,
  host: BodyState,
): { readonly posM: Vec3; readonly rotM: Mat3 };
```

It subtracts the two heliocentric positions in Mpc first, then scales the
(now-small) remainder to metres, the same order `bodyRelativePose` already
uses and for the same reason: f64 cancels the shared heliocentric magnitude
before the scale, rather than after. `rotateByTranspose` (P5) then expresses
both the translation and `body`'s own orientation in `host`'s fixed axes.
`posM` is the mesh body's position and `rotM` its rotation (its tumble),
both in the host's fixed axes, in metres.

Each frame, `meshBodiesLayer.draw` reads `hostPose = ctx.bodyPose(hostId)`
(the same pose-provider closure that built `view.slab.vp` itself, read the
same way `planetsLayer.ts:103` reads it rather than re-deriving it) and
`{ posM, rotM } = bodyStateInHostFrame(meshState, hostState)`. The model
matrix is `translate(posM − hostPose.eyeRelBodyM) · rotate(rotM)`, scale 1
(the mesh is already in metres, unlike `composeBodySlabMvp`'s unit-sphere
`scale(radiusM)`); `mvp = view.slab.vp · model`, composed in f64 and
narrowed only at the staging-buffer write, mirroring `composeBodySlabMvp`'s
own narrow-at-write discipline (`planetsLayer.ts:110-117`). LANDMINE: never
build this in f32, and never from the heliocentric Mpc position directly.

Pick reuses the same host-attachment shape: `bodyPickRenderer.drawSphere`
against the bounding sphere, composed via `bodySlabFlooredPick`, whose
`eyeRelBodyM` argument takes `hostPose.eyeRelBodyM − posM`.

### Umbra and Earthshine

`src/utils/scene/sunVisibleFraction.ts`: CPU-side, per frame per mesh body,
the fraction of the Sun's disc not occluded by the host sphere as seen from
the body, from the two angular radii and the angular separation between Sun
and host as seen from the body (ramping through the penumbra; 1 on the day
side, 0 deep in umbra). No existing angular-overlap or eclipse-fraction
helper exists in `src/utils/` to build on; this is a new, self-contained
computation.

### Glint

The `< 3 px` branch of P4's widened partition routes a mesh body to
`glints`; `bodyGlintsLayer` tints it from the body's `albedo` field exactly
as it does for a planet, no change to that layer needed.

## Testing

Only tests that can fail on a real bug (per `docs/superpowers/conventions/testing.md`):

- The ground-preparation tests above (P1 to P4; P5 is a pure extraction, so
  `bodyRelativePose`'s existing tests staying green is its test).
- `sunVisibleFraction`: 1 on the day side; 0 deep in umbra; strictly inside
  `(0, 1)` at a penumbra-edge point computed from the two angular radii.
- Mesh loader: rejects wrong magic, rejects wrong version; typed-array view
  lengths match the header's `vertexCount`/`indexCount` on a fixture produced
  by the tool's own writer (writer and reader pinned together, the same
  posture `decodeFilaments`/`filamentFetcher` share).
- Tool: a two-material GLB is refused; a GLB with no normal map produces the
  flat 1×1 texture, the warning, and `normalMapSubstituted: true`.
- Orbit rows: the pot trails the whale by the authored mean-anomaly offset at
  epoch, through the real `deriveBodyStates`.
- Every `SCENE_BODIES` id resolves a `BodyState`, guarding
  `extractSelectionRow`'s non-null assertion at
  `src/services/engine/helpers/extractSelectionRow.ts:56`.
- No renderer or shader unit tests. Visual pass: fly-to from search, orbital
  sunrise across the whale, glint-to-mesh handoff on approach, the pot
  visible beside the whale.

## Perf

Two draws of a few thousand triangles, plus one near-plane change touching
every Earth frame. Run `npm run perf` before and after, per the `perf` skill.
In a worktree, pass `--url` for this worktree's own dev-server port. A
neutral-or-negative measurement halts the landing pipeline; land or park is
the user's ruling, not process momentum.

## Definition of done

- Tests green, `npm run typecheck` green.
- Visual pass attested by the user (see "Testing" above for the checklist).
- Provenance for both mesh assets recorded before commit.
- The whale and petunia model authors are credited (CC0 or CC BY 4.0 with
  attribution) in the Splash footer's credits paragraph
  (`src/components/Splash/Splash.tsx:195-231`), the same surface that
  already credits Solar System Scope for the planet/moon/ring textures.
- R2 sync of `public/data/meshes/` noted as a deploy step (docs/DEPLOY.md).
- Backlog detail files for the three adjacent findings exist (written
  alongside this spec) and ride the feature PR.
- Memory updated.

## Adjacent findings

Not this feature. Each gets its own backlog detail file rather than being
folded in here, per the backlog-hygiene convention:

- **Rotation table, tagged union.** `RotationElements`
  (`src/@types/scene/RotationElements.d.ts`) has one shape: an IAU pole plus a
  spinning prime meridian. The day this needs a second orientation kind
  (look-at, or a surface-locked frame), the flat shape stops being able to
  express it.
- **Hyperbolic branch in the Kepler solver.** `eccentricAnomalyFromMean`
  (`src/utils/orbit/eccentricAnomalyFromMean.ts:26`) documents `eccentricity`
  as `[0, 1)`, bound orbits only. Voyager's heliocentric trajectory is
  hyperbolic (`e > 1`), which needs the hyperbolic form of Kepler's equation,
  not this solver.
- **Surface-fixed position driver.** Every `SceneBody`'s position today comes
  from an orbit (`ORBITAL_ELEMENTS`) or a fixed heliocentric anchor
  (`SCENE_ANCHORS`). A person standing on Earth's surface needs a third kind:
  fixed at a latitude/longitude, rotating with the host body's own spin
  rather than orbiting it.
