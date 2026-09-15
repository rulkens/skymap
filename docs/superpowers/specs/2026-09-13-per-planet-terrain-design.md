# Per-planet 3D terrain — Earth and Mars — design

**Status:** F1 in execution (plan `2026-09-15-terrain-f1-height-products.md`). Written
against `main` at `be13f9dc7`; amended 2026-09-15 from the F1 plan's rulings R1, R3,
R11, R12 and the data rulings in §4.2 — each amendment is marked in place.

**As built:** [`specs/completed/2026-07-28-earth-surface-virtual-texture.md`](completed/2026-07-28-earth-surface-virtual-texture.md)
— the quadtree, the atlas, the band manifest and the residency walk this spec
extends. That spec's §§ "Q1 normal map" and "non-goals" explicitly deferred
elevation displacement as "the named possible escalation, later, if the flat-limb
silhouette becomes the thing that breaks the illusion." This is that escalation.
Also [`specs/completed/2026-08-20-earth-rtc-surface-camera-design.md`](completed/2026-08-20-earth-rtc-surface-camera-design.md)
and [`specs/completed/2026-09-01-camera-pivot.md`](completed/2026-09-01-camera-pivot.md)
(§ "Terrain-height collision … nothing is built") for the camera lane this spec
gives real ground to.

**Ground preparation:** produced by `refactor-ground` at a 2026-09-13 checkpoint —
six prep refactors, ten joint verdicts and six priced shape decisions, recorded in
§3. Signed off by the user, with the geometry mechanism and PR packaging chosen at
the checkpoint (§3.4, §3.6).

**Consumes these backlog items** (deleted in the same commit as this spec, per the
backlog-hygiene convention): `2026-07-30-earth-tile-kind-singularity.md`,
`2026-09-12-rover-terrain-region.md`, `2026-09-12-body-bounds-vs-surface.md`.
`2026-09-12-rover-surface-camera-regime.md` stays — only its "floor at the terrain"
bullet is consumed, and its orbit-regime content is independent.

---

## 1. Purpose

Earth and Mars are analytic spheres wearing photographs. From orbit that reads;
standing on the ground it does not. At 10 m altitude a Mars rover sits on a flat
plane of single-colour blur, and Earth's deepest imagery — 0.149 m/texel over
Søndermarken — lies on a surface with no shape at all. Relief is faked once, by a
whole-globe 4096 px tangent-space normal map Sobel-baked from an 8-bit GEBCO
shaded-relief PNG (`tools/textures/bakeNormalMap.ts`): it shades, it never
occludes, it never moves a silhouette, and it is 60–250× coarser than the imagery
over it.

This spec makes the streamed surface **displaced geometry** on both bodies, and
makes that displacement the **ground truth** the rest of the engine reads: the
camera's collision floor, the scale bar's eye-to-ground range, the quadtree's
horizon cull, lat/lon picking, the atmosphere's ground radius, the orbit-trail
occluder spheres, and the cloud deck's clearance. Today all seven read one scalar
mean radius per body, and they round in opposite directions.

**Earth terrain works to the deepest tile level (z19), with real data there.** Height
bands equal albedo bands, level for level (§4.1): 2,446 m posts globally from ETOPO
30″, and **0.597 m posts over Søndermarken from DHM/Terræn's 0.4 m LiDAR**, under the
0.149 m GeoDanmark ortho. Displacement is continuous and crack-free at every level by
construction (§6, §7).

## 2. Scope

**In scope.** A second streamed tiled product (height) for any body; displaced
patch geometry with height-derived normals; the height field as the engine's
ground truth; Earth to z19; Mars globally plus the four rover landing sites.

**Out of scope.** Terrain self-shadowing and cast shadows (own backlog item,
`2026-09-12-mesh-body-shadows.md`). Vertical exaggeration as a setting — relief is
1× everywhere, no knob. Oblate terrain: the datum stays a sphere per body; WGS84
flattening is a separate, larger change. The Moon, which has a LOLA source
(`textures.moonElevation`) and joins later as registry rows and a bake, no new code.

**External dependency.** Terrain inside an atmosphere needs the inside path to have
scene depth. Today `atmosphereShellPass` draws full-screen with
`depthCompare: 'always'` and terminates its ray on the analytic ground sphere, so
anything opaque silhouetted against sky gets camera-to-space in-scatter painted
over it — the rover bug stopgapped in #698 by moving `mesh-bodies` after
`atmosphere-shell` in `FRAME_ORDER`. That work is in flight separately. Two
couplings: terrain needs the same scene depth, and `innerBoundRadiusM` (§8) is only
the correct atmosphere ground radius **once** the composite is depth-aware — until
then it over-hazes everything. When it lands, the `mesh-bodies` ordering stopgap
can move back.

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// src/@types/scene/BodySurface.d.ts                                       NEW
export type BodySurface = {
  readonly datumRadiusM: number; // the sphere tiles and heights are defined against
  readonly reliefM: readonly [number, number]; // [min, max] vs datum; the compiled grid's extremes (§3.4e)
};
// CelestialBody: `radiusM` → `surface: BodySurface`.  MeshBody untouched.
// Derived, never stored:  outerBoundRadiusM = datum + reliefM[1]   // over-estimate is safe
//                         innerBoundRadiusM = datum + reliefM[0]   // under-estimate is safe
// The InfoCard prints the datum (mean radius); `radiusM` ceases to exist as a name.

// src/@types/data/SurfaceTileProduct.d.ts        NEW, replaces EarthTileKind
export type SurfaceTileProduct = 'albedo' | 'height';
// src/@types/data/SurfaceTileId.d.ts             { product, z, x, y }  (was EarthTileId)

// src/data/bodies/surfaceTileRegistry.ts                                  NEW
export const SURFACE_TILE_REGISTRY = {
  earth: { manifestKey: 'earth-tiles', circumferenceM: 40075016.686 },
  mars: { manifestKey: 'mars-tiles', circumferenceM: 21300737 }, // 2π × the scene's 3390 km datum
} as const satisfies Partial<Record<BodyId, SurfaceTileSpec>>; // membership IS the predicate

// SurfaceTileManifest (was EarthTileManifest)
//   levels: Partial<Record<EarthTileKind, Band[]>>
//   → bands: Band[]                             // ONE list, both products (§4.1, §5.2)

// src/@types/scene/SurfaceHeightField.d.ts                                NEW
export type SurfaceHeightField = {
  ceilingHeightM(dirBodyFixed: Vec3): number; // conservative UPPER bound, monotone NON-INCREASING
  bestHeightM(dirBodyFixed: Vec3): number; // estimate: scale bar, readouts
  boundsM(box: LonLatBounds): readonly [number, number]; // horizon cap, patch bounds
  raycast(originBodyFixed: Vec3, dir: Vec3): Vec3 | null; // pick; null ⇒ miss, caller uses the datum
};
// A NULL IMPLEMENTATION for every body without tiles — never a nullable field, or
// 215 call sites grow `?? radiusM` and the scalar is back wearing a new costume.

// SurfaceCutTile:  resident: {…}  →  albedo: ResolvedTileResidency;
//                                    heightSlot: AtlasSlot;   // the leaf's OWN (z,x,y), never inherited
//                                  + heightBoundsM; + edgeCoarser: [0|1, 0|1, 0|1, 0|1]

// deleted (P6, #705): bakeSurfaceTileMesh.ts · surfaceTileMeshCache.ts ·
//          SurfaceTileMesh.d.ts and both their tests ·
//          EARTH_SURFACE_TILE_MESH_CACHE_CAPACITY ·
//          the TileVertex storage buffer and its per-frame writeBuffer.
//          EARTH_SURFACE_TILE_MESH_RESOLUTION survives: it is the template's n (F2 raises it to 64).
// added:   heightTileFormat.ts · decodeHeightTile.ts · surfaceHeightField.ts ·
//          tools/textures/buildSurfaceTiles.ts · tools/fetch/fetchHeightSources.ts
```

### 3.2 Greenfield cross-check

A fresh derivation from the requirements alone agreed with the sketch on the tile
identity, the per-body registry, f32 payload, nested pyramid, procedural
vertex-shader geometry and the bounds/field split. It diverged on one thing.

**The monotone direction of the collision floor.** The greenfield derivation made the
floor a _lower_ bound on terrain height (per-cell subtree **min**), monotone
non-decreasing as data refines, and proved monotonicity from "min over a subset is
non-decreasing." The proof is right and the direction is wrong: a floor that rises
under the camera shoves it upward, which is the jolt the requirement exists to forbid;
a floor that relaxes downward is harmless. Same subset argument, other extreme.
`ceilingHeightM` reads per-cell **max**, monotone **non-increasing**, so the camera is
never pushed — only ever permitted lower as finer data lands.

### 3.3 Joint verdicts

| #   | Joint the feature needs                                                         | Verdict         | Current blocker                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Streaming parameterized on payload — height is f32 texels, not an `ImageBitmap` | bolt-on         | `earthTileSubsystem.ts:50` `ATLAS_FORMAT = 'rgba8unorm-srgb'`; `fetchEarthTileBitmap.ts:24-43`; `TextureAtlas.uploadBitmap`                                                                                                                                                                                                                                                                                                                                |
| 2   | A tiled-product axis of its own                                                 | bolt-on         | `EarthTileKind.d.ts:12` `Extract<TextureKind, 'surface' \| 'normal'>` — `height` is not a whole-globe texture _role_, and the reserved `'normal'` member was never reached. Second-special-case trigger                                                                                                                                                                                                                                                    |
| 3   | Per-body tile subsystem, registry-driven                                        | bolt-on         | `EngineSubsystemHandles.d.ts:79` `earthTiles`; `earthTileSubsystem.ts:48` `TILED_KIND` module constant; `runFrame.ts:251` `bodyId === 'earth'`                                                                                                                                                                                                                                                                                                             |
| 4   | A bake that merges products                                                     | bolt-on         | `buildEarthTiles.ts:445,450` overwrite `index.txt` / `manifest.json` outright                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | Per-product downsample strategy                                                 | bolt-on         | `buildEarthTiles.ts:211-276` gamma-space 2×2 average — right for imagery, destroys cross-level height identity                                                                                                                                                                                                                                                                                                                                             |
| 6   | Height residency gating refinement, not selecting a level                       | bolt-on         | `cutSurfaceTiles.ts:290-335` `resolveCutResidency` climbs until resident: residency must gate refinement for height, not select the sampled level; the climb is albedo-only                                                                                                                                                                                                                                                                                |
| 7   | 2:1-balanced refine, so `edgeCoarser` is one bit per edge                       | growth          | `cutSurfaceTiles.ts:212-231` has no balance constraint                                                                                                                                                                                                                                                                                                                                                                                                     |
| 8   | Surface as bounds + field, not one scalar                                       | bolt-on         | 215 read sites through ~10 hubs: `bodyFootprintRadiusM.ts:13`, `bodyDrawRadiusM.ts:18`, `hOverR.ts:20`, `pivotRadiusMpc.ts:24`, `surfaceFloorM.ts:7`, `sceneOccluderBodies.ts:41`, `cutSurfaceTiles.ts:95`, `pickOnBody.ts:10`, `atmosphereParams.ts:28`, `cloudShellParams.radiusRatio`. Bounds half landed by P1 (#704): `BodySurface { datumRadiusM, reliefM }`, `outerBoundRadiusM` / `innerBoundRadiusM`; the field half (`SurfaceHeightField`) is F3 |
| 9   | A ground-height query                                                           | absent entirely | `surfaceFloorM.ts:7` is `bodyRadiusM * SURFACE_STANDOFF_RADII`. P1 rebuilt this exact joint as `surfaceFloorM(datumRadiusM, standoffRadii)` but added no height query — still absent entirely                                                                                                                                                                                                                                                              |
| 10  | Depth-aware inside-atmosphere                                                   | external        | §2                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### 3.4 Priced shape decisions

|     | Decision                                                                                                                          | Price paid                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a   | **Delete the name `radiusM`.** Every one of the 215 sites fails to compile and picks one of five currencies, legibly, in the diff | one mechanical PR over ~10 hubs. The alternative — keeping `radiusM` as the datum with bounds beside it — leaves R1/R4/R5 silently holding the wrong currency and removes the compiler from the loop, which is the entire value                                                                                                                                                            |
| b   | **Break the manifest shape** (`levels` → `bands`)                                                                                 | `fetchEarthTileManifest`'s guard rejects unknown shapes, so tiles are OFF in production between merge and R2 sync (`docs/DEPLOY.md:47`). Accepted: the bake must re-run for height anyway, and `prefix` versioning already isolates the CDN. Compat — both keys read forever — was rejected                                                                                                |
| c   | **Nested point decimation** for the height pyramid, not filtering                                                                 | coarse levels are point-sampled, so a peak can survive into a level where its neighbours averaged away. Bought: level _L_ is a bit-identical subset of _L+1_, making cross-level cracks structurally zero instead of skirt-hidden. **Amended (R1):** strict decimation — the coarse post _is_ the coincident fine post, no candidate choice, so §5.4.3's identity holds by construction    |
| d   | **Procedural vertex-shader geometry** (user's choice at the checkpoint)                                                           | replaces exact f64 CPU-baked positions with f32 small-angle trig on the _existing_ Earth path. Bought: deletes three modules and the per-frame vertex upload, and makes real instancing possible for the first time — one draw call, ≤ 80 B per patch. Requires a numeric test against f64 ground truth and its own perf measurement (P6)                                                  |
| e   | **A compiled coarse min/max height grid** (64×32 int16 pairs, 8 KB/body) in the bundle                                            | 8 KB of bundle per body. Bought: `ceilingHeightM` has a bound at boot with zero network, so the floor never steps _up_ when the first tiles land — which happens on close approach, exactly when the camera is near the ground. It is the z6 layer of the bound the tile headers carry, and it is the one compiled home for relief: `reliefM` is its extremes, not a second compiled tuple |
| f   | **One shared atlas, at most one engaged body**                                                                                    | a hypothetical pose close to two planets at once gets tiles on neither. Bought: 268 MB instead of 536 MB. Tiles engage only on close approach, and no pose is close to two planets                                                                                                                                                                                                         |

### 3.5 Prep refactors

Each is its own diff, sequenced before the feature commits. None changes the picture
except P1's floor, which starts honouring `standoffRadii` on bodies that override it.

|        | Prep                                                                                                                                                                             | Note                                                                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | `BodySurface`: `CelestialBody.radiusM` → `surface { datumRadiusM, reliefM }`; each hub returns the bound its purpose needs; `surfaceFloorM` starts honouring `standoffRadii`     | **Landed, PR #704.** `reliefM` is `[0, 0]` for every body at first, so all three radii collapse onto the datum and the picture is identical                                                                                                             |
| **P2** | De-Earth the tile stack: registry-driven, per-body instance, one engaged; `runFrame`'s `bodyId === 'earth'` goes                                                                 |                                                                                                                                                                                                                                                         |
| **P3** | Retire the `Extract<TextureKind>` weld → `SurfaceTileProduct`; drop the unreached `'normal'` member                                                                              | the whole-globe `normal` texture kind is untouched                                                                                                                                                                                                      |
| **P4** | Generify stream + atlas on payload: `uploadTexels` beside `uploadBitmap`, `createStreamSubsystem<T>`                                                                             |                                                                                                                                                                                                                                                         |
| **P5** | Bake merges rather than overwrites; downsample strategy becomes per-product                                                                                                      |                                                                                                                                                                                                                                                         |
| **P6** | Procedural vertex-shader patch geometry + one instanced draw, replacing the CPU mesh bake, its cache and the per-frame upload — landed at mesh resolution 8, **no displacement** | **Landed, PR #705.** The only prep that touches working rendering. Paired A-B-A-B at 90 frames: earth-surface 21.28 → 20.78 ms, solar-system 20.73 → 20.47 ms — NEUTRAL, inside the box's noise; the four-pose eye-check passed and the user ruled land |

### 3.6 Packaging

P1 and P6 each get their own PR. P2–P5 ride the first feature PR as separate
commits. Prep, adjacent cleanup and feature are three different diffs whatever PR
they ride.

The `eox-2025` sequencing conflict is resolved: it landed as `v7` (#662). F1 bumps
`TILE_PREFIX` to `earth-tiles/v8` with a per-product segment (`albedo/`, `height/`);
the albedo relayout is a byte-identical copy of `v7/surface`, never a re-encode.

### 3.7 Adjacent findings

Promoted into P1, because P1 rebuilds that exact joint: `surfaceFloorM.ts:7`
ignores the `standoffRadii` overrides that `pivotRadiusMpc.ts:46` honours — the R1
and R3 floors already disagree, and `surfaceFloorM` always uses the Earth-tuned
global.

Left in the backlog, none required by the ideal diff: `bodyDrawRadiusM.ts:28`
hardcodes `body.id === 'earth'` for the cloud shell with no registry row; the
atmosphere rows carry a documented 68 km bias for Venus. Four existing items sit in
code this feature modifies and are **not** consumed — the uv-conversion dead home
(`BACKLOG.md:106`), `tilePx`'s single value (`:111`), polar refinement
over-selection (`:105`), and the descent "island in stars" bug (`:109`).

## 4. Data

### 4.1 Resolution ladder

The tile pyramid is equirectangular plate carrée: level `z` is `512 << z` texels
wide and half that tall, `2^z` columns × `2^(z-1)` rows of 512 px albedo tiles
(`EarthTileId.d.ts`). A source's matching level is where its native ground sample
distance equals one texel.

| source                           | native GSD     | matching albedo level | matching height level |
| -------------------------------- | -------------- | --------------------- | --------------------- |
| NASA BMNG (Earth, in use)        | 611 m at z7    | z7 (baked ceiling)    | —                     |
| EOX S2 cloudless (Earth, in use) | 9.6 m at z13   | z13 (baked ceiling)   | —                     |
| GeoDanmark ortho (Earth, in use) | 0.149 m at z19 | z19 (baked ceiling)   | —                     |
| ETOPO 2022 30″                   | 926 m          | z6.4                  | z8.4                  |
| GEBCO 2024 15″                   | 463 m          | z7.4                  | z9.4                  |
| SRTM / Copernicus GLO-30 1″      | 30 m           | z11.3                 | **z13.3**             |
| DHM/Terræn (Denmark)             | 0.4 m          | z17.6                 | **z19.6**             |
| MOLA–HRSC blend (Mars)           | 200 m          | z7.7                  | z9.7                  |
| Viking MDIM21 (Mars)             | 232 m          | z7.5                  | —                     |
| HiRISE DTM (Mars sites)          | 1 m            | z15.3                 | z17.3                 |
| HiRISE ortho (Mars sites)        | 0.25 m         | z17.3                 | —                     |

**Every height band is baked to the level of the albedo band over it, and every height
source supports that level natively.** A height tile carries 129 posts where an albedo
tile carries 512 texels (§5.1), so a post spans four texels and a height source reaches
**two levels deeper** than an albedo source of the same GSD. That headroom is what
makes the rule hold wherever it is used: skadi 1″ supports z13.3 against the EOX boxes'
z13, DHM supports z19.6 against GeoDanmark's z19, HiRISE DTM supports z17.3 against the
HiRISE ortho's z17, and MOLA supports z9.7 against Viking's z7. The two products
therefore have identical band boxes at identical levels, on every body.

### 4.2 Acquisition

Heights are only needed where bands exist, which makes acquisition modest.

- **Earth global:** ETOPO 2022 30″ surface GeoTIFF (1,585,813,987 B, one download,
  geographic grid, includes bathymetry) from
  `ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/30s/30s_surface_elev_gtif/` — the
  thredds path first quoted here 404s. Water is flattened at bake time per §4.4 (R3),
  not clamped.
- **Earth deep bands:** the `skadi` product in `s3://elevation-tiles-prod`, which
  is SRTM-format 1°×1° 3601² int16 **in geographic coordinates** — no reprojection,
  unlike the terrarium PNGs in the same bucket, which are WebMercator. Verified
  live: `skadi/N55/N55E012.hgt.gz` → 200, 2.1 MB, 3601², min −60 / max 129. The 19
  EOX boxes need ~30 cells.
- **Søndermarken (z14–19 albedo):** DHM/Terræn 0.4 m as 1 km GeoTIFF tiles
  (`DTM_1km_<N>_<E>.tif`, EPSG:25832) from the Datafordeler `GetRasterFile`
  endpoint with the keychain key `skymap-datafordeler-apikey`, read in-process and
  never logged (`npm run fetch-height -- --dhm-terraen`). Note the repo's existing
  `npm run fetch-dhm` pulls DHM _point clouds_ for the scene-workbench LiDAR bake —
  a different endpoint and a different product.
- **Mars global:** **amended (user ruling 2026-09-15):** MOLA 463 m DEM
  (`Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`, 2.1 GB) replaces the 200 m MOLA–HRSC
  blend — z7 is the only global level wanted, and 463 m posts already sit inside
  z7's 1,300 m. Reference sphere 3,396,190 m, so the §4.3 rebase still applies.
  Imagery: Viking MDIM21 232 m (12.7 GB).
- **Mars rover sites:** Gale and Jezero have USGS HiRISE DTM mosaics at ~1 m with
  25 cm orthoimages (the 2024 MSR TRN release is a 5.5 GB zip). Gusev and Meridiani
  have no mosaic: they use controlled HiRISE stereo-pair DTM + ortho COGs from the
  public `astrogeo-ard` bucket, whose orthos are single-band RED — colour for those
  two sites comes from tinting with the global base (F4).

All fetchers register in `tools/utils/io/rawDataRegistry.ts` with provenance
READMEs, per `docs/DATA.md:214-222`.

### 4.3 The datum question

`SCENE_PLANETS` gives Mars `radiusM: 3390000`; the MOLA–HRSC product is referenced
to a 3,396,190 m sphere, and Mars elevations are conventionally areoid-relative.
`SURFACE_FIXED_SITES`'s header already records that the rover sites are placed off
the mean 3390 km sphere with the areoid gap unmodelled.

Decision: **the datum is the scene's own `datumRadiusM`, and the bake rebases the
source onto it.** Heights on the wire are metres above `datumRadiusM`, always. The
bake asserts the rebased range falls inside the compiled `reliefM`. This keeps one
number in the runtime and confines the geodesy to the tool, where the source's
reference sphere and any areoid correction are named in the provenance README.

### 4.4 Water

Copernicus and SRTM are hydro-flattened (water at ~0), so no extra work there.
ETOPO carries real bathymetry, which would make every ocean a 4 km pit. **Amended
(R3):** the bake flattens water by connected component over the whole level grid
(NASA water mask, 4-connected, longitude-wrapped): the largest component — the world
ocean — goes to 0, every other component to the lowest post on its own shore. Land
below sea level is not water and keeps its value: the Dead Sea at −430 m is terrain,
which is why Earth's `reliefM[0]` is ≈ −430 m and not 0. Coastal cliffs are not
introduced: the flattening matches what the hydro-flattened deep sources already do,
so the two agree at band boundaries.

_Open after the first real bake (2026-09-15):_ where the mask says land but ETOPO
30″ puts the post under deep water — atolls, the Antarctic coast, the Caspian and
Black Sea shores — those posts escape flattening (single-post needles to −4.9 km at
z7) and donate their depth as a basin's "lowest shore" (Caspian −131 m instead of
≈ −28, Black Sea −541 instead of 0). Candidate rule for the user: a land post below a
threshold that touches water adopts the water level and is ignored as a shore.

## 5. The tiled products

### 5.1 Identity and density

A tile is `(product, z, x, y)`, scoped to a body — the body owns its own manifest,
cache and lifetime, so it owns its own key space. A height tile at `(z, x, y)`
covers exactly the same lon/lat box as the albedo tile at `(z, x, y)` but carries
**129 posts** per edge instead of 512 texels: quarter linear density, expressed as one
compiled constant `HEIGHT_POSTS_PER_TILE` rather than as a `−2` at every call site.
The walk therefore asks one coordinate question, not two.

### 5.2 Manifest

```ts
export type SurfaceTileManifest = {
  readonly prefix: string; // 'earth-tiles/v7' — versioned, immutable bodies
  readonly tilePx: number; // albedo texels per edge; 512
  readonly bands: readonly SurfaceTileBand[]; // priority order; first match wins
};
```

One band list serves both products, because §4.1 makes the two pyramids identical box
for box and level for level. The bake asserts that both sources cover each band's box
at its level, so a band a DEM cannot fill is a bake failure rather than a phantom
entry the runtime has to skip.

Height posts per tile (129) and the `shgt1` encoding are compiled constants, not
manifest fields; the product's place in a tile URL is a naming convention inside
`resolveUrl`. Derived once at load, never stored twice:

```ts
export type CoverageIndex = {
  resolveUrl(tile: SurfaceTileId): string | null; // null ⇒ not covered at this level
  maxLevel: number;
};
```

**The invariant that makes crack-freedom hold:** a leaf's height tile is its own
`(z, x, y)` tile, always — never an ancestor's. The walk emits a leaf only when that
height tile is resident; otherwise the parent stays the leaf. Albedo may still inherit
an ancestor's texels, as it does today: it is only a texture. So residency gates
_refinement_, and the sampled height level is a function of the cut alone — which is
what keeps neighbours on nested lattices at every moment of streaming. Reusing the
incumbent `resolveCutResidency` climb for height is the tempting mistake (joint 6):
it makes neighbouring patches sample different height levels as tiles arrive, and
the cracks flicker.

### 5.3 Height tile format — `shgt1`

```
off  size        field
  0     4  u32   magic 'SHGT' (LE 0x54474853)
  4     2  u16   version = 1
  6     2  u16   postsX = 129
  8     2  u16   postsY = 129
 10     2  u16   reserved = 0
 12     4  f32   subtreeMinM   min over this tile's entire descendant subtree, finest data
 16     4  f32   subtreeMaxM   max over the same
 20     4  f32   geometricResidualM   max |this level's bilinear − finest| inside this tile
 24  4·129·129   f32 heightM[]  row-major, north row first, metres above datum
```

24 B of header plus `129² × 4 = 66,564` B of payload = **66,588 B**. The 24-byte
header keeps the array 4-aligned for a zero-copy
`new Float32Array(buf, 24, 16641)` — only if the fetch hands back a 4-aligned
offset, so the loader slices on 4 or copies. `.bin`-family extensions are gzipped
on the wire (`tools/deploy/r2/shouldGzipOnWire.ts`), and smooth f32 terrain
compresses well.

**Raw f32 metres above datum. No integer encoding, no per-tile affine.** f32's ulp
at Earth's 8,849 m is 0.98 mm and at Mars's 21,229 m is 2.0 mm — four orders below
anything visible in a fragment-computed normal at the finest post spacing we bake.
A per-tile scale/offset would halve the wire size and destroy §5.4's bit-identical
shared edges, which is the property the whole crack argument rests on. A globally
fixed integer scale cannot span ±21 km and sub-decimetre in 16 bits.

Heights are **never** stored, uploaded or computed as a radius. `R + h` in f32
quantizes to 0.5 m at Earth's radius — visible terracing, invisible in review.

### 5.4 Exact edge agreement

Three structural properties, none a convention:

1. **One global lattice per level.** Post `i` of tile `x` at level `z` sits at
   `lon = −180 + (x·128 + i)·360/(2^z·128)`, `i ∈ [0,128]`, and analogously in
   latitude. Tiles `x` and `x+1` therefore _name the same lattice point_. Lattice
   values are dyadic multiples of 360°, exactly representable in f32 through z21.
2. **One resample, then cut.** The builder resamples the source into the global
   level grid once, then slices tiles out of it. The shared post is literally the
   same computed float written twice. Resampling each tile independently differs in
   the last bits and produces hairline cracks that get misdiagnosed as z-fighting.
3. **Point decimation, not averaging.** Level `L`'s lattice is exactly every other
   point of level `L+1`'s, so `h_L(p) ≡ h_{L+1}(p)` bit-identically at shared
   points. This is what makes a coarse patch's mesh a linear interpolant of a
   _subset_ of the fine patch's posts, and therefore what makes §7's edge collapse
   produce exactly zero crack even where a z patch meets a z+1 patch sampling a
   different height level.

4. **Sibling-closed tile sets** (amended, R11). A band bakes tile `(L, x, y)` iff
   its _parent's_ box overlaps the band bounds and `min ≤ L ≤ max`, so every baked
   tile's three siblings exist; the halo tiles outside the bounds come from the
   band's underfill. This is what makes §6's refine rule — all four children
   resident, or none — satisfiable at a band edge, and it applies to both products
   through one shared existence helper that the bake and the walk both call.

**Voids** are filled from the coarser level at bake time, and the bake asserts every
post is finite. The loader rejects a payload carrying a non-finite value — one check,
no flag. A NaN reaching the runtime propagates into vertex positions; a `−9999`
sentinel reaches the GPU as a 10 km pit. The runtime sees neither.

### 5.5 The height atlas

A second atlas instance, `r32float`, slot stride **129**: a row is 516 B, already
4-aligned, and no WebGPU constraint asks for more. 16×16 = 256 slots in a 2064²
texture, 17.0 MB — the same slot count as the albedo atlas, because the cut is 1:1.

Sampled with `textureLoad` and **manual bilinear**, clamped to the slot rect. Three
independent reasons, any one sufficient: `textureSample` is illegal in the vertex
stage; core WebGPU does not guarantee `r32float` is filterable (`float32-filterable`
is optional and `device.ts` does not request it — `sgrAStarLensingRenderer.ts:101`
already records this trap); and hardware bilinear in a slot atlas bleeds the neighbouring
slot in as a one-texel ridge along every patch edge regardless of format.

## 6. The walk

`cutSurfaceTiles` keeps its shape — one pure per-frame quadtree walk resolving both
`requests` and `cut` — and gains three things.

1. **Two products resolved per leaf.** `SurfaceCutTile` carries an `albedo`
   `ResolvedTileResidency` (the inline shape today, extracted to its own type) and a
   `heightSlot` — a plain slot reference, not a resolved residency, because a leaf's
   height tile is its own `(z, x, y)` and never an ancestor's (§5.2). Requests
   therefore run one level ahead of the cut: where screen error wants a deeper leaf,
   the walk requests the children's height tiles and emits the parent until they land.
2. **A 2:1 balance constraint**, so a leaf never neighbours a leaf more than one
   level away. This is what bounds `edgeCoarser` to one bit per edge and lets §7's
   stitching be a vertex-shader decision needing no neighbour data beyond four bits.
   **Amended (R12):** the balance holds _within a band's reach_ only — it never
   coarsens a leaf against a neighbour that cannot refine (no tile exists under it
   at the next level), or a deep band ringed by band-capped coarse leaves would
   collapse to the coarse level. A band boundary therefore keeps a multi-level step
   with that edge's bit at 0; §7.3 says how F2 hides it.
3. **A terrain-aware horizon cap.** Today `capAngle = acos(radiusM / camLen)` with
   a hard `camLen > radiusM` early-return of an empty cut. Both are mean-sphere
   facts and both are wrong with terrain: on Mars a 9 km peak is geometrically visible
   from 247 km where the mean horizon for a camera at 990 m altitude is 82 km (the
   same peak on Earth: 339 km), so patches containing it are culled and never
   fetched — a peak that pops in as you approach. The cap uses `datumRadiusM` plus the
   patch's occludee bound — the `subtreeMaxM` of its nearest resident ancestor, or the
   compiled grid before any tile lands, carried down by the walk — against
   `innerBoundRadiusM` for the occluder. The early-return goes: a camera below the
   datum is legal (Hellas, an ocean trench) and must still get a cut.

Refinement stays driven by albedo texel error. Because height bands equal albedo bands
(§4.1), a geometric-error term off the header's `geometricResidualM` could only _add_
refinement — mountains pulled in earlier from orbit — so it is deferred to a follow-up
after the eye-check. The field stays in the header, so adding the term is a walk
change and not a re-bake.

**Drawability.** A leaf's own height tile is resident because the walk refines a node
only once every visible child's own height tile is; a node that is never refined
into is emitted on its own residency check, so a leaf is never drawn on an ancestor's
heights. Albedo then resolves to some resident ancestor, and
that inheritance covers the streaming case — a deeper tile in flight — plus the
base-level boundary. A patch with no albedo ancestor stays dropped from the cut; the
base globe covers it, exactly as today.

## 7. Displaced geometry

**One shared template mesh, positions in the vertex shader, normals in the fragment
shader, nothing per-patch uploaded but an 80-byte instance record.** This replaces
`bakeSurfaceTileMesh`, `surfaceTileMeshCache` and the `TileVertex` storage buffer
that is rewritten in full every frame.

- **Vertex data: none.** A `(n+1)×(n+1)` template is addressed off
  `@builtin(vertex_index)`: `i = vid % (n+1)`, `j = vid / (n+1)`. One shared index
  buffer for every patch, level and body. **P6 lands it at `n = 8`** — today's
  `EARTH_SURFACE_TILE_MESH_RESOLUTION` — so the picture is comparable like-for-like
  while the numerics are proven; **F2 raises it to `n = 64`**, which is 1.19 m
  geometric post spacing at z19.

  Geometry is deliberately half the height data's density: 64 cells per patch
  against 128 cells per height tile. The remaining detail is not lost — it reaches
  the picture through the fragment-stage normal (§7.2), which samples the height
  texture at full resolution. Geometry LOD and shading LOD are separate budgets.

- **Per-patch data: a storage-buffer record** indexed by `@builtin(instance_index)`,
  so the whole cut is **one `drawIndexed(indexCount, patchCount)`** — real
  instancing, impossible today precisely because every tile's baked mesh is
  geometrically distinct.

```wgsl
struct PatchInstance {
  originRelEyeM    : vec3f, // f64-differenced on the CPU: f64(origin) − f64(eye)
  fadeWeight       : f32,   // the existing crossfade; fills the vec3's alignment pad
  lon0Rad          : f32,   // fround'd — the CPU derived originRelEyeM from THIS value
  lat0Rad          : f32,   // fround'd
  dLonRad          : f32,
  dLatRad          : f32,
  albedoRect       : vec4f, // at offset 32: every vec4 must precede the vec2u or
  fallbackRect     : vec4f, // WGSL alignment pads the record past 80 B
  heightSlotOrigin : vec2u, // F2
  edgeCoarser      : u32,   // F2: 4 × 1 bit
}                           // 80 B; P6 lands the first 64 B
```

`fallbackRect` is the crossfade's ancestor rect the shipped fragment already samples
(`fragment.wesl:102-106`). `datumRadiusM` is not in the record: it is the per-draw
uniform `radiusM` — one engaged body per draw (§3.4f) — and the CPU `fround`s it
before deriving `originRelEyeM`, so the uniform carries the identical f32 word.

### 7.1 Position derivation

With `s, t ∈ [0,1]` the template parameters, `dlon = s·dLonRad`,
`dlat = t·dLatRad`, `lat = lat0Rad + dlat`, `R = datumRadiusM`, `h` the sampled
height:

```
hav_lon = 2·sin²(dlon/2)          // NEVER (1 − cos dlon)
hav_lat = 2·sin²(dlat/2)
cE = cos(lat)·sin(dlon)
cN = sin(dlat) + cos(lat)·sin(lat0)·hav_lon
cU = −hav_lat − cos(lat)·cos(lat0)·hav_lon
xE = R·cE + h·cE
xN = R·cN + h·cN
xU = R·cU + h·cU + h
p  = originRelEyeM + xE·Ê + xN·N̂ + xU·Û
```

Every term is a large factor times a small-angle factor, so `p` is patch-local — a
z19 patch is 76 m on a side (108 m corner to corner) and a z7 patch 313 km — and the
f32 error is ≈ 6e-8 of the patch extent: ~5 µm at z19 against a 0.149 m texel, ~2 cm
at z7 against a 611 m texel. At `s = t = 0` the result is exactly
`originRelEyeM`, so patch corners land on the f64 origin exactly. `R` and `h` are
distributed rather than summed, so the f32 sum `R + h` — which quantizes to 0.5 m at
Earth's radius — never exists. The forbidden form is `R + h` as a radius multiplying a
unit vector built from absolute lon/lat: that is 0.5 m of per-vertex noise, and it is
the naive shape.

**The CPU/GPU contract.** If the CPU derives the f64 patch origin from `lat0` while
the shader derives its frame from `f32(lat0)`, the patch shifts coherently by
~0.13 m — differently per patch, so: cracks. `Math.fround` the anchor triple
`(datumRadiusM, lon0Rad, lat0Rad)` **first**, then derive the f64 origin from the
rounded values. The f32 triple is the contract; f64 is downstream of it, never
parallel to it.

### 7.2 Normals

In the fragment shader, the normal is the gradient of the bilinear cell the fragment
lies in, from that cell's own four posts, in the local `(Ê, N̂, Û)` frame at the
**source level's** post spacing. With `(u, v)` the fragment's position inside cell
`(i, j)`:

```
dhdE = ((h(i+1,j) − h(i,j))·(1−v) + (h(i+1,j+1) − h(i,j+1))·v) / postSpacingE_M
dhdN = ((h(i,j+1) − h(i,j))·(1−u) + (h(i+1,j+1) − h(i+1,j))·u) / postSpacingN_M
n    = normalize(Û − dhdE·Ê − dhdN·N̂)
```

This is exact for the surface actually being drawn, it reads no post outside the tile,
and across a tile edge both sides read the same bit-identical shared column (§5.4.1),
so neither can disagree with the other. A central difference would go one-sided at the
129th post and draw a seam along every tile edge. Shading resolution decouples from
tessellation, and a coarse patch and a fine patch sampling the same height level
produce **identical** normals — no shading seam at an LOD boundary even though the
geometry densities differ. If the eye-check shows cell quilting at coarse levels, the
escalation is a one-post apron in the tile, not a clamp.

Patches take their normal from the height field alone. The whole-globe tangent-space
normal map that the tile shader samples today (`fragment.wesl:109-110`) stays on the
base globe only — compositing both would shade the same relief twice.

### 7.3 Crack accounting

| mismatch                                         | resolved by                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| different vertex counts along a shared edge      | **edge collapse**: where `edgeCoarser` is set, odd template indices snap to the adjacent even index in the parametric domain, so the fine polyline becomes exactly the coarse one. Costs 32 degenerate triangles per collapsed edge. Requires §6's 2:1 balance |
| different height _tiles_ across a tile boundary  | the duplicated 129th post, bit-identical by §5.4.2                                                                                                                                                                                                             |
| different height _levels_ across an LOD boundary | bit-identical at shared lattice points by §5.4.3                                                                                                                                                                                                               |
| f32 arithmetic from two different patch origins  | ~µm residue, five orders below a 0.149 m texel. Acceptable _only because_ the data and the topology are exact; it cannot be relied on to hide either                                                                                                           |

No skirts inside a band: a skirt is what you build when the heights disagree, and
within one source pyramid they do not. **Amended (R12):** a _band boundary_ is a
source seam (skadi beside ETOPO, DHM beside skadi) with a multi-level step the
balance leaves alone, so F2 draws a skirt on exactly those edges — the ones whose
neighbour is coarser by more than one level — and nowhere else.

### 7.4 The base globe

The tile pipeline's `depthCompare: 'nearer-or-equal'` exists because it shares the
base globe's nominal radius (`earthSurfaceTileRenderer.ts:30-33`). Displace the
tiles and that tie assumption breaks: wherever terrain drops below the datum the
un-displaced globe occludes the patches, until `baseGlobeFadeAlpha` removes it over
the 300→150 km band.

Fix: draw the base globe at `datumRadiusM + reliefM[0]` — shrunk by maximum
depression, 430 m on Earth, 0.007 % (§4.4) — so resident patches always cover it.
Where no patch is resident the globe reads 430 m small, sub-pixel at any range the
base globe is visible at. The fade band and the
`'nearer-or-equal'` compare both stay as they are.

## 8. Terrain as ground truth

### 8.1 The height field

```ts
export type SurfaceHeightField = {
  ceilingHeightM(dirBodyFixed: Vec3): number;
  bestHeightM(dirBodyFixed: Vec3): number;
  boundsM(box: LonLatBounds): readonly [number, number];
  raycast(originBodyFixed: Vec3, dir: Vec3): Vec3 | null;
};
```

Two queries, deliberately different, because "the height" wants two incompatible
properties — safe-for-collision and best-estimate — and one name guarantees the
wrong one gets used for the floor.

`boundsM` and `ceilingHeightM`'s conservative branch are backed by the `subtreeMaxM`
in the headers of the resident ancestors, plus the compiled grid (§3.4e) before any
tile lands; `bestHeightM`, `ceilingHeightM`'s exact branch and `raycast` by the CPU
tile cache — the same `Float32Array`s that were uploaded to the atlas. One decode, two
consumers.

`raycast` intersects the outer-bound sphere first, then marches the ray against
`bestHeightM` and bisects the first crossing to convergence. A miss returns `null` and
the caller falls back to the datum sphere.

### 8.2 Why the floor never rises

```
ceilingHeightM(dir):
  T = deepest RESIDENT tile containing dir
  if T is at the leaf level the cut wants for dir:  return bilinear(T, dir)
  if T exists:                                      return T.subtreeMaxM
  otherwise:                                        return the compiled grid's cell max
```

Monotone non-increasing from two facts, no ratchet and no convention:

1. `subtreeMaxM` is a max over a **subset** as you descend, so it is non-increasing
   along the resident ancestor chain.
2. A tile's bilinear interpolation is ≤ that tile's own max ≤ its `subtreeMaxM` ≤
   every ancestor's `subtreeMaxM`.

So every answer over time forms a non-increasing sequence terminating at the best
the data supports: the camera is never pushed up, only ever permitted lower. The one
price: while a chain is still streaming the bound comes off an ancestor, so it lags
residency by a level — looser than it could be, never wrong.

**Eviction cannot break it**, and nothing has to be pinned for that. The walk's
request set always includes the ancestor chain under the eye direction, whatever the
frustum holds, and the atlas never evicts a slot touched in the current frame
(`textureAtlas.ts:212-254` evicts the oldest `lastSeenFrame` only) — so the chain the
floor reads cannot be reclaimed. A pure function of the camera, with no pin state to
leak. The tempting alternative, remembering the lowest value ever returned, never
releases: fly from the Dead Sea to Everest and the floor stays in the valley.

Before any tile is resident, the compiled 64×32 int16 grid (§3.4e) supplies the bound,
so the conservative phase is immediate rather than network-bound and there is no
upward step at first load.

### 8.3 Per-purpose routing

`radiusM` ceases to exist. The 215 sites, through ~10 hubs, become:

| purpose                                                      | sites | reads                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| render footprint, near plane, LOD gates, framing, caption em | 82    | `outerBoundRadiusM` — over-estimating is safe                                                                                                                                                                                  |
| altitude (h/R, regime bands, drag damping, zoom taper)       | 32    | `datumRadiusM` for the band arithmetic; `bestHeightM` where a readout means eye-to-ground                                                                                                                                      |
| ground collision                                             | 8     | `datumRadiusM + ceilingHeightM(dir)`, then `standoffRadii`                                                                                                                                                                     |
| atmosphere bottom, cloud shell                               | 41    | `innerBoundRadiusM` for the march (under-estimate, so a peak is never a hole) — correct only once the composite is depth-aware, §2. Cloud deck becomes **altitude metres above `outerBoundRadiusM`**, not a ratio of the datum |
| occlusion (trails, captions, umbra, horizon cap)             | 19    | `innerBoundRadiusM` for occluders — they must under-occlude; `boundsM(patch).max` for the occludee in the horizon cap                                                                                                          |
| pick                                                         | 23    | `raycast` against the height field (§8.1), not `raySphereRoots` — sphere picking is off by up to 8.8 km of parallax at grazing incidence                                                                                       |
| surface-fixed site placement, orbital elements, InfoCard     | 10    | `bestHeightM` for a rover's ground; `datumRadiusM` for the printed radius — the datum is the mean radius                                                                                                                       |

The cloud-deck shape matters more than it looks. `CLOUD_SHELL_PARAMS.radiusRatio`
is 1.002 ≈ 12.7 km, drawn on a `uvSphereMesh(128, 64)` whose facet-centre sag
brings the shell down to ≈ 8.9 km (`cloudShellRenderer.ts:85-86, :108`). Everest is
8,849 m. Expressing the deck as an altitude above the outer bound makes the
clearance true by construction instead of true by coincidence.

## 9. Mars

Mars needs the imagery path it does not have: today it is one whole-globe
`mars-8192.jpg` at 2.6 km/texel, no tiles, no DEM, no normal map.

- **Global albedo:** Viking MDIM21 → z3–z7, mirroring Earth's BMNG band.
- **Global height:** MOLA 463 m (amended, §4.2) → z3–z7 (1,300 m posts), matching
  the albedo band level for level. Mars relief is ±21 km on a 3,390 km radius — 0.6 %, four
  times Earth's — so Olympus Mons and Valles Marineris are visible from orbit in a
  way Earth's relief is not, which is the case for matching rather than trailing the
  imagery. The source supports z9.7, so z7 is a re-bake away from deeper if wanted.
- **Rover sites:** four bands at Gale, Jezero, Gusev and Meridiani — HiRISE ortho
  (25 cm) over HiRISE DTM (1 m), both at z17: the DTM's own ceiling is z17.3, so it
  matches the ortho rather than trailing it (§4.1). These are the small boxes that make
  the rovers stand somewhere real, and they are what the consumed
  `rover-terrain-region` backlog item asked for.
- The global CTX mosaic at 5 m/px (z13) is **deferred**: 5.6 TB compressed, and the
  Murray Lab asks for one tile at a time. Per-region CTX boxes are the EOX-shaped
  way in later, if wanted.
- A rover's `altitudeM` then reads `bestHeightM` at its site rather than the mean
  sphere, closing the areoid gap `SURFACE_FIXED_SITES` documents.

## 10. Budgets

Height bytes are 66,588 per tile (§5.3); a full pyramid to level `L` costs roughly
`(4/3) × (2^L × 128)² / 2 × 4` bytes.

| band                         | levels  | tiles          | post spacing | bytes           |
| ---------------------------- | ------- | -------------- | ------------ | --------------- |
| Earth global height          | z3–z7   | 10,912         | 2,446 m      | 727 MB          |
| Earth EOX boxes height       | z8–z13  | 4,694          | 38.2 m       | 313 MB          |
| Søndermarken height          | z14–z19 | 4,095          | 0.597 m      | 273 MB          |
| **Earth height total**       |         | 19,701         |              | **~1.31 GB**    |
| Mars global albedo           | z3–z7   | 10,912         | —            | ~360 MB         |
| Mars global height           | z3–z7   | 10,912         | 1,300 m      | 727 MB          |
| Mars rover sites albedo (4×) | z10–z17 | ~6,000         | —            | ~250 MB         |
| Mars rover sites height (4×) | z10–z17 | = albedo count | 1.27 m       | count × 66.6 KB |

Height bands equal albedo bands (§4.1), so on Earth the height pyramid mirrors the
albedo pyramid tile for tile, 19,701 each (the first real bake, 2026-09-15, landed on
exactly that count at 1.3 GB), plus the one-parent-wide halo per level that §5.4.4's
sibling closure adds to both products. Each ceiling is source-clean, not
interpolated: global z7's 2,446 m posts sit inside ETOPO 30″'s 926 m; the EOX boxes'
z13 38.2 m posts inside skadi 1″'s 30 m; Søndermarken's z19 0.597 m posts inside DHM's
0.4 m. Nothing is invented anywhere real data exists — the requirement in §1, and the
reason these ceilings are not a byte-budget trade.

Total against the existing 425 MB / 19,701-tile Earth albedo set and `public/data`'s
2.3 GB: ~2.65 GB of new tiles across the rows that have numbers, plus the rover-site
height bands on top, ≈ 0.04 USD/month of R2 at 0.015 USD/GB-month. Per the
parent spec, storage is not the constraint — **acquisition wall-clock is**, and it is
where this lands: a ~1.9 GB ETOPO download plus ~30 skadi cells for Earth, ~11 GB of
MOLA–HRSC for Mars, and the bake's own read-back-per-level pass over ~20k tiles per
body. Object count is the second constraint, which is why the tile edge is 512.

At z19 the height data (0.597 m) is finer than the geometry posts (1.19 m at `n = 64`,
§7). That is not waste: the surplus reaches the picture through the fragment-stage
normal, which samples the height texture at full resolution (§7.2). Raising `n`
further is a constant, not a re-bake, if the eye-check wants the geometry to carry it.

GPU: albedo atlas 268 MB (unchanged), height atlas 17.0 MB, per-patch instance
records 80 B × ~250 = 20 KB, geometry buffers one shared 65×65 template. The
per-frame vertex upload of 3–5 MB **goes away**.

## 11. Testing

Per `docs/superpowers/conventions/testing.md` — the question is whether a test can
fail on a real bug nothing else catches.

- **`heightTileFormat`** round-trip, and rejection of a payload with a non-finite post.
- **Edge agreement**: build two adjacent tiles through the real bake path and assert
  the shared post column is `Object.is`-identical, and that a decimated parent's
  posts are identical to the matching child posts. These are the two properties §7.3
  rests on, and both are silent when broken.
- **Position derivation against f64 ground truth**: the haversine form vs a
  plain-f64 absolute-direction reference at z7 and z19 (≤ 1e-6 m and ≤ 1e-7 m —
  ~70× the reference's own cancellation floor, far below the f32 budget), and
  asserting the `s = t = 0` corner is exactly `originRelEyeM`. This is the test that
  makes P6's numerics reviewable.
- **`ceilingHeightM` monotonicity**: feed a scripted residency sequence and assert
  the returned bound never increases.
- **The eye's ancestor chain is in every frame's request set**, whatever the frustum
  holds — the property that makes eviction unable to raise the floor (§8.2).
- **Horizon cap**: a patch containing a peak at `boundsM.max` is _not_ culled from a
  distance where the mean-sphere cap would cull it.
- **2:1 balance**: the walk never emits neighbouring leaves more than one level apart.
- Not tested: constant restatements, the registry's contents, clamp boundaries.

`npm run perf` before and after P6, and again after displacement lands, with the
worktree's own `--url`. A neutral-or-negative measurement halts the pipeline and the
land/park call is the user's.

## 12. Sequence

|     |                                                                                                    | PR                          |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| P1  | `BodySurface` split, 215 sites / ~10 hubs, `standoffRadii` honoured                                | #704 — landed               |
| P6  | Procedural VS patch geometry at resolution 8, no displacement, perf-measured                       | #705 — landed, perf NEUTRAL |
| F1  | P2–P5 as commits + height bake + height atlas + two-product cut                                    | one PR                      |
| F2  | Displacement, normals, edge collapse, base-globe shrink                                            | one PR                      |
| F3  | Ground truth: height field, `ceilingHeightM` routing, `raycast` pick, horizon cap, cloud clearance | one PR                      |
| F4  | Mars: imagery bake, global height, four rover-site bands                                           | one PR                      |

F3's atmosphere row waits on the depth-aware composite (§2); everything else in F3
is independent of it.
