# Per-planet 3D terrain — Earth and Mars — design

**Status:** Draft (2026-09-13), awaiting plans. Written against `main` at `be13f9dc7`.

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

**Earth terrain works to the deepest tile level (z19).** Not by inventing data —
real DEM resolution saturates well above z19 — but by the pyramid inheriting
heights from its deepest baked level while geometry keeps refining, with
displacement continuous and crack-free at every level by construction (§6, §7).

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
  readonly reliefM: readonly [number, number]; // [min, max] vs datum; compiled DATA, bake asserts it
};
// CelestialBody: `radiusM` → `surface: BodySurface`.  MeshBody untouched.
// Derived, never stored:  outerBoundRadiusM = datum + reliefM[1]   // over-estimate is safe
//                         innerBoundRadiusM = datum + reliefM[0]   // under-estimate is safe
// The viewer-facing radius moves to BODY_FACTS; `radiusM` ceases to exist as a name.

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
//   → products: Record<SurfaceTileProduct, { postsPerTile, encoding, bands: Band[] }>
//   + statsUrl                                  // per-tile subtree min/max/residual sidecar

// src/@types/scene/SurfaceHeightField.d.ts                                NEW
export type SurfaceHeightField = {
  ceilingHeightM(dirBodyFixed: Vec3): number; // conservative UPPER bound, monotone NON-INCREASING
  bestHeightM(dirBodyFixed: Vec3): number; // estimate: scale bar, pick, readouts
  boundsM(box: LonLatBounds): readonly [number, number]; // horizon cap, patch bounds
  lease(dirBodyFixed: Vec3): () => void; // pins the chain so eviction cannot re-raise the floor
};
// A NULL IMPLEMENTATION for every body without tiles — never a nullable field, or
// 215 call sites grow `?? radiusM` and the scalar is back wearing a new costume.

// SurfaceCutTile:  resident: {…}  →  albedo: ResolvedTileResidency;
//                                    height: ResolvedTileResidency;
//                                  + heightBoundsM; + edgeCoarser: [0|1, 0|1, 0|1, 0|1]

// deleted: bakeSurfaceTileMesh.ts · surfaceTileMeshCache.ts ·
//          EARTH_SURFACE_TILE_MESH_RESOLUTION / _CACHE_CAPACITY ·
//          the TileVertex storage buffer and its per-frame writeBuffer
// added:   heightTileFormat.ts · decodeHeightTile.ts · surfaceHeightField.ts ·
//          tools/textures/buildSurfaceTiles.ts · tools/fetch/fetchHeightSources.ts
```

### 3.2 Greenfield cross-check

A fresh derivation from the requirements alone agreed with the sketch on the tile
identity, the per-body registry, per-product band lists, f32 payload, nested
pyramid, procedural vertex-shader geometry and the bounds/field split. It diverged
on one thing that matters and one that does not.

**The divergence that matters — the monotone direction of the collision floor.**
The greenfield derivation made the floor a _lower_ bound on terrain height (per-cell
subtree **min**), monotone non-decreasing as data refines, and proved
monotonicity from "min over a subset is non-decreasing." The proof is right and the
direction is wrong: a floor that rises under the camera shoves it upward, which is
the jolt the requirement exists to forbid; a floor that relaxes downward is
harmless. Same sidecar, other bound. `ceilingHeightM` reads per-cell **max**,
monotone **non-increasing**, so the camera is never pushed — only ever permitted
lower as finer data lands. `lease()` survives unchanged, and for the derived reason:
eviction would otherwise let the bound climb back up.

**The divergence that does not — packed integer tile keys.** Greenfield derived a
42-bit packed numeric key to avoid per-frame string allocation. The incumbent key is
the tile's own URL path (`earthTilePath`), deliberately: "a name constructed twice
is a name that eventually 404s." At ~150–250 leaves per frame, two products, that is
~500 short strings per frame — not a pressure worth paying a second naming scheme
for. Keep the path key; revisit if the leaf count grows an order of magnitude.

### 3.3 Joint verdicts

| #   | Joint the feature needs                                                         | Verdict         | Current blocker                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Streaming parameterized on payload — height is f32 texels, not an `ImageBitmap` | bolt-on         | `earthTileSubsystem.ts:50` `ATLAS_FORMAT = 'rgba8unorm-srgb'`; `fetchEarthTileBitmap.ts:24-43`; `TextureAtlas.uploadBitmap`                                                                                                                                                              |
| 2   | A tiled-product axis of its own                                                 | bolt-on         | `EarthTileKind.d.ts:12` `Extract<TextureKind, 'surface' \| 'normal'>` — `height` is not a whole-globe texture _role_, and the reserved `'normal'` member was never reached. Second-special-case trigger                                                                                  |
| 3   | Per-body tile subsystem, registry-driven                                        | bolt-on         | `EngineSubsystemHandles.d.ts:79` `earthTiles`; `earthTileSubsystem.ts:48` `TILED_KIND` module constant; `runFrame.ts:253` `bodyId === 'earth'`                                                                                                                                           |
| 4   | A bake that merges products                                                     | bolt-on         | `buildEarthTiles.ts:445,450` overwrite `index.txt` / `manifest.json` outright                                                                                                                                                                                                            |
| 5   | Per-product downsample strategy                                                 | bolt-on         | `buildEarthTiles.ts:211-276` gamma-space 2×2 average — right for imagery, destroys cross-level height identity                                                                                                                                                                           |
| 6   | Height's sampled level from the manifest, not from residency                    | bolt-on         | `cutSurfaceTiles.ts:290-335` `resolveCutResidency` climbs until resident: for height that makes the sampled level differ between neighbours as tiles stream, i.e. flickering cracks                                                                                                      |
| 7   | 2:1-balanced refine, so `edgeCoarser` is one bit per edge                       | growth          | `cutSurfaceTiles.ts:212-231` has no balance constraint                                                                                                                                                                                                                                   |
| 8   | Surface as bounds + field, not one scalar                                       | bolt-on         | 215 read sites through ~10 hubs: `bodyFootprintRadiusM.ts:13`, `bodyDrawRadiusM.ts:18`, `hOverR.ts:20`, `pivotRadiusMpc.ts:24`, `surfaceFloorM.ts:7`, `sceneOccluderBodies.ts:41`, `cutSurfaceTiles.ts:95`, `pickOnBody.ts:10`, `atmosphereParams.ts:28`, `cloudShellParams.radiusRatio` |
| 9   | A ground-height query                                                           | absent entirely | `surfaceFloorM.ts:7` is `bodyRadiusM * SURFACE_STANDOFF_RADII`                                                                                                                                                                                                                           |
| 10  | Depth-aware inside-atmosphere                                                   | external        | §2                                                                                                                                                                                                                                                                                       |

### 3.4 Priced shape decisions

|     | Decision                                                                                                                          | Price paid                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a   | **Delete the name `radiusM`.** Every one of the 215 sites fails to compile and picks one of five currencies, legibly, in the diff | one mechanical PR over ~10 hubs. The alternative — keeping `radiusM` as the datum with bounds beside it — leaves R1/R4/R5 silently holding the wrong currency and removes the compiler from the loop, which is the entire value                                                                                                                  |
| b   | **Break the manifest shape** (`levels` → `products`)                                                                              | `fetchEarthTileManifest`'s guard rejects unknown shapes, so tiles are OFF in production between merge and R2 sync (`docs/DEPLOY.md:47`). Accepted: the bake must re-run for height anyway, and `prefix` versioning already isolates the CDN. Compat — both keys read forever — was rejected                                                      |
| c   | **Nested point decimation** for the height pyramid, not filtering                                                                 | coarse levels are point-sampled, so a peak can survive into a level where its neighbours averaged away. Bought: level _L_ is a bit-identical subset of _L+1_, making cross-level cracks structurally zero instead of skirt-hidden. Softened by choosing, among each coarse post's four candidates, the one nearest the local mean — still nested |
| d   | **Procedural vertex-shader geometry** (user's choice at the checkpoint)                                                           | replaces exact f64 CPU-baked positions with f32 small-angle trig on the _existing_ Earth path. Bought: deletes three modules and the per-frame vertex upload, and makes real instancing possible for the first time — one draw call, 64 B per patch. Requires a numeric test against f64 ground truth and its own perf measurement (P6)          |
| e   | **A compiled coarse max-height grid** (64×32 int16 ≈ 4 KB/body) in the bundle                                                     | 4 KB of bundle per body. Bought: `ceilingHeightM` has a bound at boot with zero network, so the floor never steps _up_ when the stats sidecar lands — which happens on close approach, exactly when the camera is near the ground                                                                                                                |
| f   | **One shared atlas, at most one engaged body**                                                                                    | a hypothetical pose close to two planets at once gets tiles on neither. Bought: 268 MB instead of 536 MB. Tiles engage only on close approach, and no pose is close to two planets                                                                                                                                                               |

### 3.5 Prep refactors

Each is its own diff, sequenced before the feature commits. None changes behaviour.

|        | Prep                                                                                                                                                                             | Note                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | `BodySurface`: `CelestialBody.radiusM` → `surface { datumRadiusM, reliefM }`; each hub returns the bound its purpose needs; `surfaceFloorM` starts honouring `standoffRadii`     | `reliefM` is `[0, 0]` for every body at first, so all three radii collapse onto the datum and the picture is identical                                                                      |
| **P2** | De-Earth the tile stack: registry-driven, per-body instance, one engaged; `runFrame`'s `bodyId === 'earth'` goes                                                                 |                                                                                                                                                                                             |
| **P3** | Retire the `Extract<TextureKind>` weld → `SurfaceTileProduct`; drop the unreached `'normal'` member                                                                              | the whole-globe `normal` texture kind is untouched                                                                                                                                          |
| **P4** | Generify stream + atlas on payload: `uploadTexels` beside `uploadBitmap`, `createStreamSubsystem<T>`                                                                             |                                                                                                                                                                                             |
| **P5** | Bake merges rather than overwrites; downsample strategy becomes per-product                                                                                                      |                                                                                                                                                                                             |
| **P6** | Procedural vertex-shader patch geometry + one instanced draw, replacing the CPU mesh bake, its cache and the per-frame upload — landed at mesh resolution 8, **no displacement** | the only prep that touches working rendering. A neutral `npm run perf` and an eye-check on today's picture is the only way to know the numerics are sound before displacement rides on them |

### 3.6 Packaging

P1 and P6 each get their own PR. P2–P5 ride the first feature PR as separate
commits. Prep, adjacent cleanup and feature are three different diffs whatever PR
they ride.

Sequencing conflict to resolve first: `TILE_PREFIX` is `earth-tiles/v5` on `main`
(`buildEarthTiles.ts:127`) but the on-disk bake is `v6` from the unmerged
`eox-2025` worktree. That must land or be abandoned before the height bake bumps
the prefix again.

### 3.7 Adjacent findings

Promoted into P1, because P1 rebuilds that exact joint: `surfaceFloorM.ts:7`
ignores the `standoffRadii` overrides that `pivotRadiusMpc.ts:46` honours — the R1
and R3 floors already disagree, and `surfaceFloorM` always uses the Earth-tuned
global.

Left in the backlog, none required by the ideal diff: `bodyDrawRadiusM.ts:27`
hardcodes `body.id === 'earth'` for the cloud shell with no registry row; the
atmosphere rows carry a documented 68 km bias for Venus. Four existing items sit in
code this feature modifies and are **not** consumed — the uv-conversion dead home
(`BACKLOG.md:108`), `tilePx`'s single value (`:114`), polar refinement
over-selection (`:107`), and the descent "island in stars" bug (`:112`).

## 4. Data

### 4.1 Resolution ladder

The tile pyramid is equirectangular plate carrée: level `z` is `512 << z` texels
wide and half that tall, `2^z` columns × `2^(z-1)` rows of 512 px albedo tiles
(`EarthTileId.d.ts`). A source's matching level is where its native ground sample
distance equals one texel.

| source                           | native GSD     | matching albedo level |
| -------------------------------- | -------------- | --------------------- |
| NASA BMNG (Earth, in use)        | 611 m at z7    | z7 (baked ceiling)    |
| EOX S2 cloudless (Earth, in use) | 9.6 m at z13   | z13 (baked ceiling)   |
| GeoDanmark ortho (Earth, in use) | 0.149 m at z19 | z19 (baked ceiling)   |
| ETOPO 2022 30″                   | 926 m          | z6.4                  |
| GEBCO 2024 15″                   | 463 m          | z7.4                  |
| SRTM / Copernicus GLO-30 1″      | 30 m           | z11.3                 |
| DHM/Terræn (Denmark)             | 0.4 m          | z17.6                 |
| MOLA–HRSC blend (Mars)           | 200 m          | z7.7                  |
| Viking MDIM21 (Mars)             | 232 m          | z7.5                  |
| HiRISE DTM (Mars sites)          | 1 m            | z15.3                 |
| HiRISE ortho (Mars sites)        | 0.25 m         | z17.3                 |

### 4.2 Acquisition

Heights are only needed where bands exist, which makes acquisition modest.

- **Earth global:** ETOPO 2022 30″ (~1.9 GB, one download, geographic grid,
  includes bathymetry). Bathymetry is clamped to 0 at bake time — the ocean is a
  flat sea at the datum, not a hole (§4.4).
- **Earth deep bands:** the `skadi` product in `s3://elevation-tiles-prod`, which
  is SRTM-format 1°×1° 3601² int16 **in geographic coordinates** — no reprojection,
  unlike the terrarium PNGs in the same bucket, which are WebMercator. Verified
  live: `skadi/N55/N55E012.hgt.gz` → 200, 2.1 MB, 3601², min −60 / max 129. The 19
  EOX boxes need ~30 cells.
- **Søndermarken (z14–19 albedo):** DHM/Terræn 0.4 m raster via the Dataforsyningen
  WCS `dhm_terraen` coverage (token required). Note the repo's existing
  `npm run fetch-dhm` pulls DHM _point clouds_ for the scene-workbench LiDAR bake —
  a different endpoint and a different product.
- **Mars global:** MOLA–HRSC blended DEM 200 m v2 (USGS Astrogeology, 106,694 ×
  53,347 int16, simple cylindrical, sphere radius 3,396,190 m — note this differs
  from the scene's 3,390,000 m Mars radius; see §4.3). Imagery: Viking MDIM21.
- **Mars rover sites:** HiRISE DTM mosaics at ~1 m with 25 cm orthoimages (Jezero
  has the USGS Mars 2020 TRN products; the 2024 MSR TRN release is a 5.3 GB zip).

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
ETOPO carries real bathymetry, which would make every ocean a 4 km pit. The bake
clamps heights at 0 over water. Coastal cliffs are not introduced: the clamp
matches what the hydro-flattened deep sources already do, so the two agree at band
boundaries.

## 5. The tiled products

### 5.1 Identity and density

A tile is `(product, z, x, y)`, scoped to a body — the body owns its own manifest,
cache and lifetime, so it owns its own key space. A height tile at `(z, x, y)`
covers exactly the same lon/lat box as the albedo tile at `(z, x, y)` but carries
**129 posts** per edge instead of 512 texels: quarter linear density, expressed as
a per-product `postsPerTile` in the manifest rather than as a `−2` at every call
site. The walk therefore asks one coordinate question, not two.

### 5.2 Manifest

```ts
export type SurfaceTileManifest = {
  readonly prefix: string; // 'earth-tiles/v7' — versioned, immutable bodies
  readonly tilePx: number; // albedo texels per edge; 512
  readonly products: Partial<Record<SurfaceTileProduct, TiledProduct>>;
  readonly statsUrl?: string; // the height min/max/residual sidecar
};
export type TiledProduct = {
  readonly postsPerTile: number; // albedo: 512 TEXELS (cell centres); height: 129 POSTS
  // (cell corners, outer row shared with the neighbour)
  readonly encoding: 'webp' | 'shgt1';
  readonly bands: readonly SurfaceTileBand[]; // priority order; first match wins
};
```

Band geometry is **not shared** between products. Imagery and DEM footprints are
independent facts — Mars has imagery over boxes with no matching DTM at all —
and sharing would force phantom bands with invented ceilings. Duplicating a
bounding box literal is cheaper than an indirection that means two things.

Derived once at load, never stored twice:

```ts
export type CoverageIndex = {
  ceilingLevelAt(lonDeg: number, latDeg: number): number; // deepest band max covering the point
  resolveUrl(tile: SurfaceTileId): string | null; // null ⇒ not covered at this level
  maxLevel: number;
};
```

**The invariant that makes crack-freedom hold:** a patch's height target level is

```ts
heightTargetLevel(patch) = min(patch.z, coverage.height.ceilingLevelAt(patchCentre));
```

— a pure function of **static manifest data, never of residency**. Residency gates
_drawability_; it never selects _which level of height we sample_. Reusing the
incumbent `resolveCutResidency` climb for height is the tempting mistake (joint 6):
it makes neighbouring patches sample different height levels as tiles arrive, and
the cracks flicker.

### 5.3 Height tile format — `shgt1`

```
off  size        field
  0     4  u32   magic 'SHGT' (LE 0x54474853)
  4     2  u16   version = 1
  6     1  u8    product = 1
  7     1  u8    flags — bit0 voidsFilled, must be 1 or the loader rejects the tile
  8     2  u16   postsX = 129
 10     2  u16   postsY = 129
 12     4  f32   subtreeMinM   min over this tile's entire descendant subtree, finest data
 16     4  f32   subtreeMaxM   max over the same
 20     4  f32   tileMinM      min over this tile's own posts
 24     4  f32   tileMaxM
 28     4  f32   geometricResidualM   max |this level's bilinear − finest| inside this tile
 32  4·129·129   f32 heightM[]  row-major, north row first, metres above datum
```

32 B of header plus `129² × 4 = 66,564` B of payload = **66,596 B**. The 32-byte
header keeps the array 4-aligned for a zero-copy
`new Float32Array(buf, 32, 16641)` — only if the fetch hands back a 4-aligned
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

**Voids** are filled from the coarser level at bake time, with `flags bit0` set. A
NaN reaching the runtime propagates into vertex positions; a `−9999` sentinel
reaches the GPU as a 10 km pit. The runtime sees neither.

### 5.5 The stats sidecar

`(i16 minM, i16 maxM, u16 residualM)` per tile — 6 B — for every tile of the height
pyramid, Morton-ordered per level with a per-level offset table. Quantization
**rounds outward** (floor the min, ceil the max) so the values stay true bounds.
Fetched once alongside the manifest.

This is why the cut can evaluate geometric error before a tile arrives (§6), and
why `ceilingHeightM` is conservative-but-correct immediately rather than
network-bound (§8).

### 5.6 The height atlas

A second atlas instance, `r32float`, slot stride **132** (129 + 3) to keep rows
4-aligned — 2.3 % waste. A 2048² atlas gives 15×15 = 225 slots at 16.8 MB, sized
against the albedo atlas's 256 slots.

Sampled with `textureLoad` and **manual bilinear**, clamped to the slot rect. Three
independent reasons, any one sufficient: `textureSample` is illegal in the vertex
stage; core WebGPU does not guarantee `r32float` is filterable (`float32-filterable`
is optional and `device.ts` does not request it — `compositor.ts:192` already
records this trap); and hardware bilinear in a slot atlas bleeds the neighbouring
slot in as a one-texel ridge along every patch edge regardless of format.

## 6. The walk

`cutSurfaceTiles` keeps its shape — one pure per-frame quadtree walk resolving both
`requests` and `cut` — and gains four things.

1. **Two products resolved per leaf.** `SurfaceCutTile` carries an `albedo` and a
   `height` `ResolvedTileResidency` (the inline shape today, extracted to its own
   type). Albedo's target is `z`; height's is §5.2's manifest-derived ceiling.
2. **A geometric error term.** Refinement becomes
   `max(albedoTexelErrorPx, geometricErrorPx)`, where
   `geometricErrorPx = residualM / distanceM × pxPerRad` from the sidecar's
   `residualM` — the bound on how far this level's bilinear surface sits from the
   finest data. Two independent error sources, one level
   decision — which is what lets geometry keep refining past the imagery ceiling
   and lets a smooth region stop refining early.
3. **A 2:1 balance constraint**, so a leaf never neighbours a leaf more than one
   level away. This is what bounds `edgeCoarser` to one bit per edge and lets §7's
   stitching be a vertex-shader decision needing no neighbour data beyond four bits.
4. **A terrain-aware horizon cap.** Today `capAngle = acos(radiusM / camLen)` with
   a hard `camLen > radiusM` early-return of an empty cut. Both are mean-sphere
   facts and both are wrong with terrain: a +9 km peak is geometrically visible from
   247 km where the mean horizon is 82 km, so patches containing it are culled and
   never fetched — a peak that pops in as you approach. The cap uses
   `datumRadiusM + boundsM(patch).max` for the occludee and `innerBoundRadiusM` for
   the occluder, and the early-return goes: a camera below the datum is legal (Hellas,
   an ocean trench) and must still get a cut.

**Drawability.** A patch draws when both products resolve to some resident ancestor.
Because height's ceiling is shallow — z6 globally, z11 in the EOX boxes — a height
tile is shared by up to 256 albedo patches, so the chain a deep patch needs is
resident long before the camera descends into it. Gating on height residency is
therefore cheap and buys exact crack-freedom. A patch with no albedo ancestor stays
dropped from the cut; the base globe covers it, exactly as today.

## 7. Displaced geometry

**One shared template mesh, positions in the vertex shader, normals in the fragment
shader, nothing per-patch uploaded but a 64-byte instance record.** This replaces
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
  originRelEyeM  : vec3f,   // f64-differenced on the CPU: f64(origin) − f64(eye)
  datumRadiusM   : f32,     // fround'd; the CPU used THIS value for originRelEyeM
  lon0Rad        : f32,     // fround'd
  lat0Rad        : f32,     // fround'd
  dLonRad        : f32,
  dLatRad        : f32,
  heightSlotOrigin : vec2u,
  heightSubRect  : vec4f,   // ancestor inheritance, flattened to this patch's sub-rect
  albedoRect     : vec4f,
  edgeCoarser    : u32,     // 4 × 1 bit
  fadeWeight     : f32,     // the existing crossfade
}                           // 64 B
```

### 7.1 Position derivation

With `s, t ∈ [0,1]` the template parameters, `dlon = s·dLonRad`,
`dlat = t·dLatRad`, `lat = lat0Rad + dlat`, `R = datumRadiusM`, `h` the sampled
height:

```
hav_lon = 2·sin²(dlon/2)          // NEVER (1 − cos dlon)
hav_lat = 2·sin²(dlat/2)
xE = (R + h)·cos(lat)·sin(dlon)
xN = (R + h)·( sin(dlat) + cos(lat)·sin(lat0)·hav_lon )
xU = (R + h)·( −hav_lat − cos(lat)·cos(lat0)·hav_lon ) + h
p  = originRelEyeM + xE·Ê + xN·N̂ + xU·Û
```

Every term is a large factor times a small-angle factor, so `p` is patch-local —
≤ 40 m at z19, ≤ 300 km at z7 — and f32-exact to micrometres. At `s = t = 0` the
result is exactly `originRelEyeM`, so patch corners land on the f64 origin exactly.
`(R + h)` is f32 and does quantize to 0.5 m, but it only ever multiplies a
small-angle term, so the induced error at z19 is 76 m × 8e-8 ≈ 6 µm. The forbidden
form is `R + h` as a radius multiplying a unit vector built from absolute lon/lat:
that is 0.5 m of per-vertex noise, and it is the naive shape.

**The CPU/GPU contract.** If the CPU derives the f64 patch origin from `lat0` while
the shader derives its frame from `f32(lat0)`, the patch shifts coherently by
~0.13 m — differently per patch, so: cracks. `Math.fround` the anchor triple
`(datumRadiusM, lon0Rad, lat0Rad)` **first**, then derive the f64 origin from the
rounded values. The f32 triple is the contract; f64 is downstream of it, never
parallel to it.

### 7.2 Normals

In the fragment shader, from a central difference of the height texture in the local
`(Ê, N̂, Û)` frame at the **source level's** post spacing:

```
dhdE = (h(i+1,j) − h(i−1,j)) / (2·postSpacingE_M)
dhdN = (h(i,j+1) − h(i,j−1)) / (2·postSpacingN_M)
n    = normalize(Û − dhdE·Ê − dhdN·N̂)
```

Shading resolution decouples from tessellation, and a coarse patch and a fine patch
sampling the same height level produce **identical** normals — no shading seam at an
LOD boundary even though the geometry densities differ. The whole-globe
tangent-space normal map composites on top where it exists, unchanged.

### 7.3 Crack accounting

| mismatch                                         | resolved by                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| different vertex counts along a shared edge      | **edge collapse**: where `edgeCoarser` is set, odd template indices snap to the adjacent even index in the parametric domain, so the fine polyline becomes exactly the coarse one. Costs 32 degenerate triangles per collapsed edge. Requires §6's 2:1 balance |
| different height _tiles_ across a tile boundary  | the duplicated 129th post, bit-identical by §5.4.2                                                                                                                                                                                                             |
| different height _levels_ across an LOD boundary | bit-identical at shared lattice points by §5.4.3                                                                                                                                                                                                               |
| f32 arithmetic from two different patch origins  | ~µm residue, five orders below a 0.149 m texel. Acceptable _only because_ the data and the topology are exact; it cannot be relied on to hide either                                                                                                           |

No skirts. A skirt is what you build when the heights disagree; these do not.

### 7.4 The base globe

The tile pipeline's `depthCompare: 'nearer-or-equal'` exists because it shares the
base globe's nominal radius (`earthSurfaceTileRenderer.ts:30-33`). Displace the
tiles and that tie assumption breaks: wherever terrain drops below the datum the
un-displaced globe occludes the patches, until `baseGlobeFadeAlpha` removes it over
the 300→150 km band.

Fix: draw the base globe at `datumRadiusM + reliefM[0]` — shrunk by maximum
depression, 11 km on Earth, 0.17 % — so resident patches always cover it. Where no
patch is resident the globe reads 11 km small, which is sub-pixel except at close
range, where patches are guaranteed resident. The fade band and the
`'nearer-or-equal'` compare both stay as they are.

## 8. Terrain as ground truth

### 8.1 The height field

```ts
export type SurfaceHeightField = {
  ceilingHeightM(dirBodyFixed: Vec3): number;
  bestHeightM(dirBodyFixed: Vec3): number;
  boundsM(box: LonLatBounds): readonly [number, number];
  lease(dirBodyFixed: Vec3): () => void;
};
```

Two queries, deliberately different, because "the height" wants two incompatible
properties — safe-for-collision and best-estimate — and one name guarantees the
wrong one gets used for the floor.

`boundsM` and `ceilingHeightM`'s conservative branch are backed by the stats
sidecar plus the compiled boot grid; `bestHeightM` and `ceilingHeightM`'s exact
branch by the CPU tile cache — the same `Float32Array`s that were uploaded to the
atlas. One decode, two consumers.

### 8.2 Why the floor never rises

```
ceilingHeightM(dir):
  T = deepest tile containing dir that the sidecar knows (level = ceilingLevelAt(dir))
  if T is resident:  return bilinear(T, dir)
  else:              return stats[deepest ANCESTOR of T present].subtreeMaxM
```

Monotone non-increasing from two facts, no ratchet and no convention:

1. `subtreeMaxM` is a max over a **subset** as you descend, so it is non-increasing
   along any ancestor chain.
2. A tile's bilinear interpolation is ≤ that tile's own max ≤ its `subtreeMaxM` ≤
   every ancestor's `subtreeMaxM`.

So every answer over time forms a non-increasing sequence terminating at the best
the data supports: the camera is never pushed up, only ever permitted lower.

**Eviction is the one thing that could break it**, and `lease()` closes it
structurally — the camera's ground track holds a lease, so the LRU cannot reclaim
the chain under it. The tempting alternative, remembering the lowest value ever
returned, never releases: fly from the Dead Sea to Everest and the floor stays in
the valley.

Before the sidecar loads, the compiled 64×32 int16 max grid (§3.4e) supplies the
bound, so the conservative phase is immediate rather than network-bound and there is
no upward step at manifest load.

### 8.3 Per-purpose routing

`radiusM` ceases to exist. The 215 sites, through ~10 hubs, become:

| purpose                                                      | sites | reads                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| render footprint, near plane, LOD gates, framing, caption em | 82    | `outerBoundRadiusM` — over-estimating is safe                                                                                                                                                                                  |
| altitude (h/R, regime bands, drag damping, zoom taper)       | 32    | `datumRadiusM` for the band arithmetic; `bestHeightM` where a readout means eye-to-ground                                                                                                                                      |
| ground collision                                             | 8     | `datumRadiusM + ceilingHeightM(dir)`, then `standoffRadii`                                                                                                                                                                     |
| atmosphere bottom, cloud shell                               | 41    | `innerBoundRadiusM` for the march (under-estimate, so a peak is never a hole) — correct only once the composite is depth-aware, §2. Cloud deck becomes **altitude metres above `outerBoundRadiusM`**, not a ratio of the datum |
| occlusion (trails, captions, umbra, horizon cap)             | 19    | `innerBoundRadiusM` for occluders — they must under-occlude; `boundsM(patch).max` for the occludee in the horizon cap                                                                                                          |
| pick                                                         | 23    | `raycast` against the height field, not `raySphereRoots` — sphere picking is off by up to 8.8 km of parallax at grazing incidence                                                                                              |
| surface-fixed site placement, orbital elements, InfoCard     | 10    | `bestHeightM` for a rover's ground; `BODY_FACTS` for the printed radius                                                                                                                                                        |

The cloud-deck shape matters more than it looks. `CLOUD_SHELL_PARAMS.radiusRatio`
is 1.002 ≈ 12.7 km, drawn on a `uvSphereMesh(128, 64)` whose facet-centre sag
brings the shell down to ≈ 8.9 km (`cloudShellRenderer.ts:78-86`). Everest is
8,849 m. Expressing the deck as an altitude above the outer bound makes the
clearance true by construction instead of true by coincidence.

## 9. Mars

Mars needs the imagery path it does not have: today it is one whole-globe
`mars-8192.jpg` at 2.6 km/texel, no tiles, no DEM, no normal map.

- **Global albedo:** Viking MDIM21 → z3–z7, mirroring Earth's BMNG band.
- **Global height:** MOLA–HRSC 200 m → z3–z6 (2.6 km posts). Mars relief is ±21 km
  on a 3,390 km radius — 0.6 %, four times Earth's — so Olympus Mons and Valles
  Marineris are visible from orbit in a way Earth's relief is not. z6 resolves both
  amply; deeper is a data change.
- **Rover sites:** four bands at Gale, Jezero, Gusev and Meridiani — HiRISE ortho
  (25 cm → z17) over HiRISE DTM (1 m → z15). These are the small boxes that make
  the rovers stand somewhere real, and they are what the consumed
  `rover-terrain-region` backlog item asked for.
- The global CTX mosaic at 5 m/px (z13) is **deferred**: 5.6 TB compressed, and the
  Murray Lab asks for one tile at a time. Per-region CTX boxes are the EOX-shaped
  way in later, if wanted.
- A rover's `altitudeM` then reads `bestHeightM` at its site rather than the mean
  sphere, closing the areoid gap `SURFACE_FIXED_SITES` documents.

## 10. Budgets

Height bytes are 66,596 per tile (§5.3); a full pyramid to level `L` costs roughly
`(4/3) × (2^L × 128)² / 2 × 4` bytes.

| band                               | levels  | tiles  | bytes       |
| ---------------------------------- | ------- | ------ | ----------- |
| Earth global height                | z3–z6   | 2,720  | 181 MB      |
| Earth EOX boxes height             | z8–z11  | ~470   | 31 MB       |
| Søndermarken height                | z12–z18 | ~1,025 | 68 MB       |
| **Earth height total**             |         | ~4,215 | **~280 MB** |
| Mars global albedo                 | z3–z7   | 10,912 | ~360 MB     |
| Mars global height                 | z3–z6   | 2,720  | 181 MB      |
| Mars rover sites (4×, ortho + DTM) | z10–z17 | ~6,000 | ~250 MB     |

Against the existing 425 MB / 19,701-tile Earth albedo set and `public/data`'s
2.3 GB. R2 storage at 0.015 USD/GB-month makes ~1 GB of new tiles ≈ 0.015 USD/month;
per the parent spec, storage is not the constraint and acquisition effort is.

Why the global height ceiling is z6 and not z7: z7 alone is 8,192 tiles = 546 MB, and
at the 50–150 km altitudes where z7 albedo draws, one screen pixel is ~109 m, so
4.9 km posts are ~45 px — blocky only for mountain-scale silhouette, which is 0.14 %
of Earth's radius. z7 is a re-bake away if the eye-check wants it.

GPU: albedo atlas 268 MB (unchanged), height atlas 16.8 MB, per-patch instance
records 64 B × ~250 = 16 KB, geometry buffers one shared 65×65 template. The
per-frame vertex upload of 3–5 MB **goes away**.

## 11. Testing

Per `docs/superpowers/conventions/testing.md` — the question is whether a test can
fail on a real bug nothing else catches.

- **`heightTileFormat`** round-trip, and rejection of `voidsFilled = 0`.
- **Edge agreement**: build two adjacent tiles through the real bake path and assert
  the shared post column is `Object.is`-identical, and that a decimated parent's
  posts are identical to the matching child posts. These are the two properties §7.3
  rests on, and both are silent when broken.
- **Position derivation against f64 ground truth**: the haversine form vs a
  `mat4d`-grade reference at z7 and z19, asserting sub-millimetre agreement, and
  asserting the `s = t = 0` corner is exactly `originRelEyeM`. This is the test that
  makes P6's numerics reviewable.
- **`ceilingHeightM` monotonicity**: feed a scripted residency sequence and assert
  the returned bound never increases; assert a lease prevents the eviction that
  would raise it.
- **Horizon cap**: a patch containing a peak at `boundsM.max` is _not_ culled from a
  distance where the mean-sphere cap would cull it.
- **2:1 balance**: the walk never emits neighbouring leaves more than one level apart.
- Not tested: constant restatements, the registry's contents, clamp boundaries.

`npm run perf` before and after P6, and again after displacement lands, with the
worktree's own `--url`. A neutral-or-negative measurement halts the pipeline and the
land/park call is the user's.

## 12. Sequence

|     |                                                                                          | PR     |
| --- | ---------------------------------------------------------------------------------------- | ------ |
| P1  | `BodySurface` split, 215 sites / ~10 hubs, `standoffRadii` honoured                      | own PR |
| P6  | Procedural VS patch geometry at resolution 8, no displacement, perf-measured             | own PR |
| F1  | P2–P5 as commits + height bake + height atlas + two-product cut                          | one PR |
| F2  | Displacement, normals, edge collapse, base-globe shrink                                  | one PR |
| F3  | Ground truth: height field, `ceilingHeightM` routing, pick, horizon cap, cloud clearance | one PR |
| F4  | Mars: imagery bake, global height, four rover-site bands                                 | one PR |

F3's atmosphere row waits on the depth-aware composite (§2); everything else in F3
is independent of it.
