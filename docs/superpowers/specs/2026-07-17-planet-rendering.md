# Planet rendering — textures, sun-relative lighting, axial tilt, Saturn's rings, glints — design

> **Status.** Approved design (grill session `docs/grill-sessions/planet-rendering-2026-07-17.md`,
> Q1–Q13, user-ratified 2026-07-17; source verification 2026-07-17). Awaiting plan.
> **Date.** 2026-07-17.
> **Relationship to prior work.** Grows the true-scale foreground body layer shipped
> by the zoom-to-Earth work
> (`specs/completed/2026-06-29-zoom-to-earth-true-scale-design.md`) and the conic
> orbit trails (`specs/completed/2026-07-11-conic-orbit-trails.md`). Consumes the
> `f64` NEAR0 slab + compose-then-narrow precision architecture, the
> `ORBITAL_ELEMENTS`/`orbitPlaneFrames` element tables, and the `AssetSlot` +
> `ASSET_WIRING` demand system, all unchanged in kind — this is growth at their
> existing seams plus the two loading-system joints named in Ground preparation.

## 1. What we're building

The true-scale solar-system bodies (7 planets + Earth + Moon + 13 moons, drawn
today as flat-lit UV spheres with a fixed aesthetic light, no tilt, no textures,
no rings, and a hard 1 px sub-pixel cull) become a visually honest depiction on
close approach:

- **Textures** on the 13 near-spherical bodies (Mercury–Neptune, Earth, Moon,
  Io, Europa, Ganymede, Callisto), demand-loaded per body per approach, sized by
  the existing tier dropdown, released when the camera leaves. Irregular moons
  and Titan stay flat-albedo (their placeholder path doubles as the pre-load and
  never-textured state).
- **Real sun-relative lighting** — Lambert + ambient floor, sun direction
  computed CPU-side and rotated into each body's local frame, so correct phases
  (crescent Venus, gibbous Moon) fall out. Earth's currently full-bright shader
  gains the same Lambert.
- **Axial tilt / correct facing** from IAU/WGCCRE J2000 rotation elements —
  Jupiter's bands at the right angle, tidally-locked moons genuinely facing their
  parent, Saturn's rings sharing its exact equatorial frame.
- **Saturn's rings** — annulus mesh in Saturn's IAU equatorial frame, radial
  alpha strip, alpha-blended two-sided, with analytic mutual shadows (ring on
  planet, planet on ring).
- **Sub-pixel glints** — below the resolution limit a body becomes a
  brightness-scaled additive point sprite (size × albedo × phase), cross-fading
  with the mesh over ~1–3 px so bodies stop popping in/out during descent.

### Non-goals (explicitly deferred — grill Q1, "Out of scope")

- Animated ephemeris / clock (both the orbital and the new rotation element
  tables carry the named `W(t) = W₀ + Ẇ·t` extension point; nothing propagates it).
- Foreground-body picking (separate blocked backlog item, unchanged).
- Inter-body eclipse shadows (deferred until a clock makes them discoverable;
  Saturn ring↔planet mutual shadowing is the one exception, §8).
- Earth's ultra-real treatment (atmosphere, day/night terminator, ocean
  specular) — Earth keeps its dedicated renderer as the future home; this bundle
  only adds Lambert to it.
- Uranus/Jupiter/Neptune rings (invisible-dark; not worth assets).
- A "peel the clouds" Venus surface / "pierce the haze" Titan mode (possible
  later per-body treats; this bundle ships the honest cloud/haze appearance).

## 2. Ground preparation

Checkpoint (user-approved 2026-07-17). The `refactor-ground` pass over the
touchpoints found **everything is growth at existing seams EXCEPT two missing
joints in the loading system**:

1. **`DemandCtx` exposes only distance-to-focus.** `cameraDistanceMpc` answers
   "how close to the focus target" — the Earth texture's descent gate. Per-body
   proximity ("is the camera near *this* body, wherever it sits") needs the
   camera's world position, which the ctx did not carry.
2. **`reevaluateDemand` is one-way.** It loads idle slots whose demand is true
   and never releases. Keeping thirteen bodies' textures (an 8 k RGBA is ~135 MB
   of GPU memory uncompressed) resident forever defeats the whole per-body
   proximity scheme — 8 k residency is only viable if flying away frees the
   memory.

**The prep (implemented alongside this feature, not as a prior PR — user
authorized the single-PR deviation from the usual prep-first convention):**

- `AssetSlot` gains `release()` + an `onRelease` un-commit hook (drops the
  payload, returns the slot to `idle`).
- `AssetWiringRow` gains optional `release?: (ctx: DemandCtx) => boolean` — the
  evict edge. **Omitted ⇒ never evict ⇒ current load-once semantics**, so every
  existing row is unchanged. Separate predicate from `demand`, not `!demand`, so
  the two edges can carry hysteresis (§7).
- `reevaluateDemand` becomes a two-way sweep: load idle+demanded rows (as
  today); release ready rows whose `release(ctx)` is true.
- `DemandCtx` gains `cameraPosMpc: Readonly<Vec3>` — the last produced pose's
  world eye position, derived from the same `assembleOrbitCamera(pose,
  projection)` the frame uses for `drawCamPos`, so demand-time proximity agrees
  with draw-time position.

These four changes are **already present in the type files this spec cites**
(`@types/loading/DemandCtx.d.ts` surface 5, `@types/loading/AssetWiringRow.d.ts`
`release`) — the spec is written against them as existing.

**Ideal-diff verdict for the rest:** growth. New body-metadata tables
(`rotationElements`, `bodyTextureRegistry`, `sceneRings`) sit beside the existing
`orbitalElements`/`palette` tables; new renderers join the `renderers/bodies/`
family and `EngineGpuHandles`; new layers join `CONTENT_LAYERS`; the texture
fetch/build/R2 pipeline mirrors the catalog `.bin` and famous-hires paths
verbatim; the keyed `bodyTextures` slot family mirrors the keyed
`assetSlots.points` family (`galaxyCatalogSourceRegistry.ts`).

**Adjacent findings deliberately NOT in scope** (recorded so a future
entanglement-radar pass doesn't re-flag them as this feature's debt):

- `orbitTrailsLayer`'s hand-rolled brightness-trail ramp (not folded into
  `fadeBand`; a separate cleanup).
- `starRenderer`'s single-uniform gap (two simultaneously-resolved stars clobber
  each other's MVP) — existing BACKLOG item "starRenderer per-instance uniforms";
  the new `texturedBodyRenderer` does NOT inherit this gap (it holds a per-body
  uniform buffer, §7), which is why body textures don't wait on that fix.

## 3. Verified texture sources (canonical source-of-truth table)

Verified 2026-07-17 by web-research agents (GET-probed URLs, page licence text,
pixel dims). **Bandwidth note: `solarsystemscope.com` ignores `Range` headers AND
returns `200 text/html` to `HEAD` — the fetcher must use `GET` and must not
`HEAD`-probe** (this is why the texture fetcher can't reuse `syncR2`'s
`HEAD`-for-ETag resume shape; it resumes on on-disk byte count only, §9).

### Solar System Scope — CC BY 4.0

Page text confirms "use, adapt, share… even commercially"; required attribution:
`Solar System Scope (solarsystemscope.com), CC BY 4.0`.
Base: `https://www.solarsystemscope.com/textures/download/<file>`

| Body | Files | Native / notes |
|---|---|---|
| Mercury | `2k_mercury.jpg` / `8k_mercury.jpg` | 2k = 2048×1024; 8k = 15 MB (inferred 8192×4096) |
| Venus (atmosphere) | `2k_venus_atmosphere.jpg` / `4k_venus_atmosphere.jpg` | **caps at 4k** — the 8k variant is the radar surface (wrong appearance, Q11) |
| Mars | `2k_mars.jpg` / `8k_mars.jpg` | 8k available |
| Jupiter | `2k_jupiter.jpg` / `8k_jupiter.jpg` | 8k available |
| Saturn | `2k_saturn.jpg` / `8k_saturn.jpg` | 8k available |
| **Saturn ring** | `2k_saturn_ring_alpha.png` / `8k_saturn_ring_alpha.png` | 2k = 2048×125 RGBA PNG, real alpha; thin radial strip — sample by radius; ship as an **N×1 `texture_2d`, never `texture_1d`** (iOS WebKit landmine, §8) |
| Uranus | `2k_uranus.jpg` | **2k ONLY** — near-featureless source; do NOT manufacture 4k/8k |
| Neptune | `2k_neptune.jpg` | **2k ONLY** — same caveat |
| Moon | `2k_moon.jpg` / `8k_moon.jpg` | 8k available |

**No 4k tier exists on SSS** except Venus atmosphere. The 4k tier is always a
build-time downsample of the 8k raw; **never upscale.**

### NASA Blue Marble Next Generation — Earth raw (public domain; credit "NASA Earth Observatory")

- `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x21600x10800.jpg`
  — verified 200, 29.9 MB, 21600×10800, `Access-Control-Allow-Origin: *`. Single
  equirect file; downsamples to 8k/4k/2k. Replaces the committed
  `public/images/earth/blue-marble-4k.jpg` (Q12).
- 5400×2700 sibling (`…3x5400x2700.jpg`, 2.4 MB) — the dev/quick-fetch subset.
- SSS `earth_daymap` is the documented fallback if BMNG moves.

### USGS Astrogeology — big moons (public domain; credit "NASA/USGS")

Plain 8-bit GeoTIFFs (no ISIS toolchain; sharp/libvips reads TIFF directly).
Base: `https://planetarymaps.usgs.gov/mosaic/<file>`

| Body | File | Native | Bands | Build note |
|---|---|---|---|---|
| Io | `Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif` | 11445×5723 | RGB | — |
| Europa | `Europa_Voyager_GalileoSSI_global_mosaic_500m.tif` | 19631×9816 | **gray** | **tint in build** (no global colour; S-pole gap below −83° acceptable) |
| Ganymede | `Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif` | 11520×5760 | RGB | — |
| Callisto | `Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif` | 15138×7569 | **gray** | **tint in build** (no global colour; near-uniform) |

**Titan dropped → flat albedo** (Q13): the only global map is a 938 nm surface
mosaic, not Titan's visual appearance (a featureless orange haze ball = exactly
what the flat path renders). Textured set is therefore **13 bodies** (incl.
Earth); Titan renders through the flat path like the irregular moons.

**Per-body tier ceilings are DATA, baked into the registry (§4), not 404-probed:**
Uranus/Neptune → 2k; Venus → 4k; everything else → 8k.

## 4. Data model — new metadata tables beside the element tables

Four authored tables join `src/data/bodies/`, in the same
single-source-of-truth / one-`SCALE_UNITS`-conversion discipline as
`orbitalElements.ts` and `orbitPlaneFrames.ts`.

### 4.1 Rotation elements (axial tilt + facing)

IAU/WGCCRE J2000 mean rotation elements: north-pole direction (RA/Dec) + prime
meridian W₀. Rates omitted (static scene); `Ẇ` is the named clock extension
point. Mirrors `ORBITAL_ELEMENTS`' authoring style (human units at the seed
site, `degToRad` inline, a `findByIdOrThrow` lookup).

```ts
// src/@types/scene/RotationElements.d.ts   (one type per file)
export type RotationElements = {
  readonly id: string;
  readonly poleRaDeg: number;   // IAU north-pole right ascension, J2000
  readonly poleDecDeg: number;  // IAU north-pole declination, J2000
  readonly primeMeridianDeg: number; // W0 at J2000 epoch
};
```

```ts
// src/data/bodies/rotationElements.ts
export const ROTATION_ELEMENTS: readonly RotationElements[];   // the 13 textured bodies
export function rotationById(id: string): RotationElements;    // findByIdOrThrow wrapper
```

Only the 13 textured bodies need rotation elements (a flat-albedo sphere is
rotation-invariant, so the irregular moons + Titan carry none). Saturn's pole
here MUST equal the pole `SATURN_EQUATORIAL_FRAME` (`orbitPlaneFrames.ts:82`) was
built from (α=40.589°, δ=83.537°) — the rings and Saturn's moons share one
equatorial frame (Q9); the spec's test pins that equality (§10).

The baked orientation is a `Mat3` rotation (local body-fixed frame → equatorial
world frame), derived once per body from the IAU convention
`R = Rz(90°+α)·Rx(90°−δ)·Rz(W₀)`:

```ts
// src/utils/orbit/rotationFromIau.ts   (one fn per file)
export function rotationFromIau(el: RotationElements): Mat3;
```

`Mat3` (`@types/math/Mat3.d.ts`) already exists (column-major, WGSL-compatible).

### 4.2 PlanetBody / EarthBody grow `orientation`; Earth's bespoke texture dies

```ts
// src/@types/scene/PlanetBody.d.ts   (add one field)
readonly orientation: Mat3;   // local → equatorial-world rotation, baked from ROTATION_ELEMENTS

// src/@types/scene/EarthBody.d.ts   (add orientation, DELETE textureUrl)
readonly orientation: Mat3;
//  readonly textureUrl: string;   ← removed (Q12: Earth joins the R2 texture family)
```

The makers bake `orientation`:
`heliocentricPlanet` / `satelliteBody` / `sceneEarth` read `rotationById(id)`
when the body is a textured one and set `orientation = rotationFromIau(...)`;
flat bodies (irregular moons, Titan) get the identity `Mat3` (rotation-invariant,
so any value renders identically — the identity is the honest "no facing
modelled" value). `BodySpec` is unchanged (orientation is derived from the
rotation table by id, not authored per body).

**Texture identity is registry-derived, not a baked field.** A body is textured
iff its `id` is a key of `BODY_TEXTURE_REGISTRY` (§4.3). No per-body `textureId`
or `textured: boolean` is baked — that would be a mirror of the registry, exactly
the kind of second-source-of-truth the `bodies/` folder avoids (`sceneOrbits`
deriving from the element table is the precedent). This is a deliberate reading
of the checkpoint's "texture identity" as *the registry keyed by body id* (the
scheme Earth now joins by losing its `textureUrl`), rather than a new field.

### 4.3 Body-texture registry (per-body tier ceilings + build metadata)

```ts
// src/@types/data/BodyTextureId.d.ts   — registry-derived id union
export type BodyTextureId =
  | 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn'
  | 'uranus'  | 'neptune' | 'moon' | 'io' | 'europa' | 'ganymede' | 'callisto';

// src/@types/scene/BodyTextureSpec.d.ts
export type BodyTextureSpec = {
  readonly bodyId: BodyTextureId;
  readonly maxTier: Tier;              // ceiling: 'small'(2k) | 'medium'(4k) | 'large'(8k)
  readonly provenance: 'sss' | 'usgs' | 'nasa';
  readonly grayscaleTint?: Vec3;       // build-time tint for mono USGS sources (Europa, Callisto)
};
```

```ts
// src/data/bodies/bodyTextureRegistry.ts
export const BODY_TEXTURE_REGISTRY: Readonly<Record<BodyTextureId, BodyTextureSpec>>;
export function bodyTextureSpec(id: string): BodyTextureSpec | null; // registry lookup
```

`maxTier`: Uranus/Neptune → `'small'`; Venus → `'medium'`; every other → `'large'`.
The runtime clamps the requested tier to `maxTier` (§5); the build emits only
non-upscaled tiers per this table (§9). One table feeds three consumers — the
runtime clamp, the build's per-body tier set, and the fetch's source list — so a
new textured body is one registry row plus its raw-data registry entries.

### 4.4 Scene rings (Saturn only)

```ts
// src/@types/scene/RingSpec.d.ts
export type RingSpec = {
  readonly bodyId: BodyTextureId;   // 'saturn' — the ring rides its body's orientation + position
  readonly innerRadiusKm: number;   // 74_500  (C-ring inner)
  readonly outerRadiusKm: number;   // 140_220 (A-ring outer)
  readonly textureId: RingTextureId; // 'saturn-ring' — the radial alpha strip
};

// src/data/bodies/sceneRings.ts
export const SCENE_RINGS: readonly RingSpec[];   // just Saturn today
```

The ring lies in Saturn's **IAU equatorial plane**, which is exactly Saturn's
baked `orientation` (pole = +z local). The ring layer therefore reuses the Saturn
body's `orientation` + `positionMpc` — no separate plane frame stored on the
ring (un-braided: the ring plane IS the body's equatorial plane, one source).
Radii stay in km (native unit), resolved to Mpc at draw time like `radiusKm`.

## 5. Loading — a keyed `bodyTextures` slot family, proximity-demanded + released

The Earth texture's single descent-gated `ASSET_WIRING` row generalises into a
**keyed slot family** mirroring `assetSlots.points`
(`galaxyCatalogSourceRegistry.ts`): one `AssetSlot<ImageBitmap, BodyTextureReq>`
per textured body, keyed by `BodyTextureId` (+ the ring strip key). Earth's
bespoke slot/fetcher/wiring-row are **deleted**; Earth becomes body id `'earth'`
in the family and `earthRenderer.setTexture` becomes the family's commit target
for that key.

```ts
// src/@types/loading/BodyTextureReq.d.ts
export type BodyTextureReq = { readonly bodyId: BodyTextureId; readonly tier: Tier };

// state.assetSlots grows a keyed family (mirrors `.points`):
//   bodyTextures: Map<BodyTextureId | RingTextureId, AssetSlot<ImageBitmap, BodyTextureReq>>
```

### 5.1 Minting + commit targets (external build)

The slots are minted in `initGpu` alongside the renderers their commits upload
into (mirrors `wireGalaxyCatalogSourceSlot`), so their `ASSET_WIRING` rows are
`built: 'external'` (demand+req+release only). Commit dispatch by key:

- key `'earth'` → `state.gpu.earthRenderer?.setTexture(bitmap)`
- any other `BodyTextureId` → `state.gpu.texturedBodyRenderer?.setTexture(bodyId, bitmap)`
- key `'saturn-ring'` → sets BOTH `ringRenderer.setTexture(bitmap)` AND
  `texturedBodyRenderer.setRingTexture('saturn', bitmap)` (the sphere fragment
  samples the strip for the ring-on-planet shadow, §8).

Each commit generates mips (§7) after upload. Commit re-checks the renderer
handle for null (destroy race), same posture as `wireGalaxyCatalogSourceSlot`.

### 5.2 Fetcher — `dataUrl`-based, tier-sized filename

```ts
// src/services/loading/fetchers/bodyTextureFetcher.ts
export const bodyTextureFetcher: Fetcher<ImageBitmap, BodyTextureReq>;
//  fetch(dataUrl(`images/textures/${bodyId}-${tierToTexturePx(tier)}.jpg`))
//     → createImageBitmap(await res.blob())
```

`tierToTexturePx` (`src/utils/math/tierToTexturePx.ts`): `small→2048`,
`medium→4096`, `large→8192`. The ring strip fetches
`images/textures/saturn-ring-<px>.png` (PNG for alpha). `dataUrl` resolves under
`VITE_DATA_BASE_URL` (R2 in prod, `public/data/` in dev) exactly like the
catalog `.bin`s and famous-hires WebPs.

### 5.3 Demand + release — proximity with hysteresis, tier clamp

```ts
// generated per body, mirroring assetWiring.ts's `pointRow(source)`:
function bodyTextureRow(id: BodyTextureId): AssetWiringRow {
  return {
    key: id,
    built: 'external',
    factory: externalFactory,
    req: (tier) => ({ bodyId: id, tier: clampTier(tier, BODY_TEXTURE_REGISTRY[id].maxTier) }),
    demand:  (ctx) => distanceMpc(ctx.cameraPosMpc, bodyPosOf(id)) < loadRadiusMpc(id),
    release: (ctx) => distanceMpc(ctx.cameraPosMpc, bodyPosOf(id)) > 2 * loadRadiusMpc(id),
  };
}
```

- **`clampTier(tier, ceiling)`** (`src/utils/math/clampTier.ts`): min of the two
  under the `small < medium < large` order.
- **`loadRadiusMpc(id)`** (`src/services/engine/frame/bodyTextureLoadRadius.ts`):
  derived from the body radius — `radiusKm · KM_TO_MPC · LOAD_RADIUS_BODY_RADII`
  — so a bigger body starts loading from farther out; the constant is generous
  (the fetch of an 8 k JPG needs lead time before the surface resolves), the same
  "descent gives orders of magnitude of lead time" argument the deleted
  `EARTH_TEXTURE_MAX_DISTANCE_MPC` docstring made, now derived per body instead
  of a hand-typed literal. Derived from `SCENE_BODIES`, so a moved/added body
  carries its own radius automatically (the `FOREGROUND_MAX_DISTANCE_MPC`
  precedent).
- **Hysteresis** (the reason `release` is a separate predicate, not `!demand`):
  load inside `loadRadius`, evict outside `2·loadRadius`, so a camera dithering
  at the boundary never thrashes a ~MB (or ~135 MB GPU) load/free cycle.
  `release` → `slot.release()` (drops the payload; the un-commit hook drops the
  texturedBodyRenderer's per-body GPU texture, freeing residency).

### 5.4 Tier change = release + re-demand (one release edge, NOT a `makeRunTierTransition` entry)

A tier change re-runs `reevaluateDemand` (state change). Galaxy catalogs reload
in lockstep via `setTier`; **body textures do not** — a tier change must not
re-fetch thirteen proximity-gated textures. Instead the two-way sweep treats a
**stale resident tier as another release edge**: a `ready` body-texture slot
whose committed request tier ≠ `req(state.tier).tier` is released, and the next
proximity demand re-fetches at the new (clamped) tier. Because textures are
proximity-gated this is a lazy re-fetch — only the body currently in view
re-fetches immediately; the rest re-fetch on next approach — which is the desired
behaviour and adds **no** `makeRunTierTransition` entry.

Mechanism: the stale-tier comparison reads the slot's last committed request
against `req(state.tier)`. `release: (ctx) => boolean` cannot see the slot, so
this comparison lives in the `bodyTextures`-family handling inside the demand
loop (the loop already holds `slotFor(state, key)` and `state.tier`). It is the
*same* `slot.release()` → idle → re-demand machinery as the distance edge, not a
second mechanism — distance-evict and stale-tier-evict are two conditions on one
release concept. (Essential asymmetry: proximity-gated vs always-resident assets
genuinely have different tier-change lifecycles; not accidental complexity to
un-braid.)

## 6. Rendering — three sphere paths by presentation partition (Q6)

Bodies partition each frame into presentations by pure predicates (mirroring
`partitionStarsByResolution`), each mapping 1:1 to a renderer via table dispatch
— never an `if (id === …)` chain:

```ts
// src/services/engine/frame/partitionBodiesByPresentation.ts
//   { glints, flat, textured }  ← disjoint by construction (one predicate cascade)
//   'earth' is drawn by its own dedicated renderer, gated by the same size test.
```

| Presentation | Condition | Renderer | Target/slab/blend |
|---|---|---|---|
| **glint** | apparent diameter ≲ 3 px (cross-fade), all bodies | `bodyGlintRenderer` | `(hdr, NEAR0, additive)` |
| **flat** | ≥ 1 px AND (not in registry OR texture not resident) | `planetRenderer` (existing) | `(foreground:0, NEAR0, opaque)` |
| **textured** | ≥ 1 px AND in registry AND texture resident | `texturedBodyRenderer` (NEW) | `(foreground:0, NEAR0, opaque)` |
| **earth** | ≥ 1 px, always | `earthRenderer` (existing, +Lambert) | `(foreground:0, NEAR0, opaque)` |
| **rings** | Saturn, ring texture resident, ≥ few px | `ringRenderer` (NEW) | `(foreground:0, NEAR0, alpha-over)` |

The flat path is the **fallback and placeholder** (irregular moons + Titan
forever; textured bodies whose texture isn't resident yet — flat albedo IS the
placeholder, mirroring Earth's mid-blue). Earth keeps its dedicated renderer
(planned divergence toward atmosphere/day-night, Q6 — recorded so a future fold
review checks this decision).

### 6.1 `composeBodyMvp` grows `T·R·S` (orientation param; ALL callers)

```ts
// src/utils/camera/composeBodyMvp.ts  — new param, model becomes T · R · S
export function composeBodyMvp(
  foregroundVp: Float64Array,
  bodyPosMpc: Readonly<Vec3>,
  renderOrigin: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,   // NEW — R, embedded into a mat4 between T and S
): Float32Array;
```

Callers (`earthLayer`, `planetsLayer`, `starSpheresLayer`, the new
`texturedBodiesLayer`, `ringsLayer`) pass the body's baked `orientation`; the
star spheres (emissive, rotation-invariant) pass `IDENTITY_MAT3`
(`src/utils/math/identityMat3.ts` — a shared const, not re-spelled per caller).
The rings pass Saturn's orientation with the annulus mesh (§8).

### 6.2 Sun-relative lighting — CPU sun-dir rotated into body-local frame

The Sun sits at `RENDER_ORIGIN_MPC` (0,0,0), so `sunDir_world =
normalize(−bodyPos)`. Rotated into the body-local frame it becomes
`sunDirLocal = orientationᵀ · sunDir_world` (`orientation` is orthonormal, so the
transpose is its inverse). Computed CPU-side per body per frame, so **the shader
stays a dot product** even with tilt:

```ts
// src/utils/camera/sunDirLocal.ts
export function sunDirLocal(bodyPosMpc, renderOriginMpc, orientation: Mat3): Vec3;
```

The Lambert term with a shared ambient floor lives in one WESL helper so the
flat, textured, and Earth fragments read one definition:

```wgsl
// src/services/gpu/shaders/lib/bodyLighting.wesl
const AMBIENT: f32 = 0.08;              // shared floor — keeps night sides legible
fn litShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32; // AMBIENT + (1-AMBIENT)*max(dot,0)
```

The fixed `LIGHT_DIR` in `planet/fragment.wesl` is deleted.

### 6.3 Shared uniform layouts (byte tables — the contract)

Two structs join `lib/sphere.wesl` beside `SphereUniforms`/`TintedSphereUniforms`
(the same "one struct per exact buffer size" discipline that file already
documents). Earth uses `LitBodyUniforms`; the textured path uses
`TexturedBodyUniforms`.

`LitBodyUniforms` (Earth — 80 B / 20 f32):

| offset | field | notes |
|---|---|---|
| 0..63 | `mvp` mat4x4<f32> | `composeBodyMvp` output |
| 64..75 | `sunDirLocal` vec3<f32> | 16-byte aligned |
| 76..79 | `ambient` f32 | (folds into the vec4 tail) |

`TexturedBodyUniforms` (textured planets/moons — 96 B / 24 f32) = `LitBodyUniforms` +

| offset | field | notes |
|---|---|---|
| 80..83 | `ringInnerRatio` f32 | ring inner radius / planet radius |
| 84..87 | `ringOuterRatio` f32 | ring outer / planet radius; **`0` ⇒ no ring** (default) |
| 88..95 | pad ×2 | zeroed |

Flat instance record (`planetRenderer`) grows **20 → 24 f32 / 80 → 96 B**:

| offset | loc | field |
|---|---|---|
| 0..63 | 1..4 | mvp columns |
| 64..79 | 5 | albedo (rgb + pad) |
| 80..95 | 6 | `sunDirLocal` (xyz + pad) — NEW |

Glint instance record (`bodyGlintRenderer`) — 28 B / 7 f32, mirrors
`starPointRenderer`'s layout (`position` f32x3 @0, `color` f32x3 @12,
`brightness` f32 @24).

### 6.4 The textured body renderer (NEW — per-body bind group + per-body uniform buffer)

`texturedBodyRenderer` (`src/services/gpu/renderers/bodies/texturedBodyRenderer.ts`)
holds a `Map<BodyTextureId, {uniformBuffer, texture, bindGroup}>`. **Per-body
uniform buffers, each written once before its own draw**, so there is no single
mid-frame uniform for a later `writeBuffer` to clobber — this is the fix for the
`starRenderer` single-uniform gap the sphere path otherwise inherits, achieved by
construction rather than by "draw at most once per frame". Bind group layout
(explicit, not `'auto'`):

- binding 0: `TexturedBodyUniforms` (vertex+fragment)
- binding 1: sampler (`filtering`, `mipmapFilter: 'linear'`)
- binding 2: body `texture_2d<f32>` (with mips)
- binding 3: ring-alpha `texture_2d<f32>` — the ring strip for Saturn's
  ring-on-planet shadow; a shared 1×1 transparent placeholder for every other
  body (never sampled because `ringOuterRatio == 0` short-circuits — the same
  "always bind a real texture, branch on data" trick `earthRenderer`'s
  placeholder uses).

`setTexture(bodyId, bitmap)` creates the per-body texture (+mips), rebuilds that
body's bind group; `setRingTexture('saturn', bitmap)` swaps binding 3 for
Saturn. `draw(pass, bodyId, uniforms)` writes that body's uniform buffer and
issues one indexed draw. Pipeline profile matches `earthRenderer` /
`foreground:0` (`rgba16float` + `depth32float`, opaque, CCW/back-cull).

Shader family `shaders/bodies/texturedBody/{io,vertex,fragment}.wesl`: vertex
projects `uvSphereMesh` position+uv through the uniform mvp (uv forwarded like
Earth); fragment samples the body texture, applies `litShade`, then attenuates by
the ring-on-planet shadow when `ringOuterRatio > 0` (§8).

### 6.5 Mip generation — a net-new `gpu/lib` helper (planets AND Earth)

`copyExternalImageToTexture` uploads mip 0 only; WebGPU has no built-in mipmap
generation. A render-pass 2× downsample chain helper builds the rest:

```ts
// src/services/gpu/lib/generateMipChain.ts
export function generateMipChain(device: GPUDevice, texture: GPUTexture): void;
// full mip count from max(w,h); each level a fullscreen blit sampling the level above,
// shaders/lib/mipBlit.wesl (linear downsample); textures created with RENDER_ATTACHMENT usage.
```

Both `texturedBodyRenderer` commits AND `earthRenderer.setTexture` call it, and
both samplers set `mipmapFilter: 'linear'` — so the surfaces don't shimmer as a
body shrinks toward the glint handoff.

### 6.6 WESL meticulousness (this bundle's shader-heavy work)

`feedback_wgsl_meticulous` applies. No backtick characters in WESL comments
(single quotes). **`texture_2d` only — never `texture_1d`** (the iOS WebKit
landmine that silently kills the whole shared-encoder frame); this specifically
governs the Saturn ring radial strip, stored as an N×1 `texture_2d`. Verify every
shader visually.

## 7. Earth — Lambert now, texture on R2 (Q12)

- **Lambert.** `earth/fragment.wesl` gains `litShade(normalLocal, sunDirLocal)`
  (~one added term); `earthRenderer`'s uniform grows from bare MVP (64 B) to
  `LitBodyUniforms` (80 B), `earthLayer` computes `sunDirLocal(earth.positionMpc,
  RENDER_ORIGIN_MPC, earth.orientation)`. Sun-lit planets beside a full-bright
  Earth would look inconsistent; the ultra-real Earth (atmosphere, day/night)
  stays future work in the dedicated renderer.
- **Texture on R2.** `sceneEarth.ts` loses `textureUrl`; Earth joins the
  `bodyTextures` family as key `'earth'` with 2k/4k/8k tiers built from BMNG.
  `earthTextureSlot.ts` + `earthTextureFetcher.ts` are deleted; the
  `earthTexture` `ASSET_WIRING` row + `EARTH_TEXTURE_MAX_DISTANCE_MPC` are
  removed. `earthRenderer.setTexture` stays as the commit target for `'earth'`.

## 8. Saturn's rings + analytic mutual shadows (Q9)

Saturn only (Uranus near-black, Jupiter gossamer — assets for invisible pixels).

- **Geometry.** `annulusMesh` (`src/utils/math/annulusMesh.ts`, sibling of
  `uvSphereMesh`): an N-segment annulus in the z=0 local plane, authored with
  outer radius = 1 and inner radius = `innerRadiusKm/outerRadiusKm`, uv radial u
  = normalized radius (inner→outer → 0→1) for the strip sample. Drawn via
  `composeBodyMvp(vp, saturnPos, origin, outerRadiusMpc, saturnOrientation)` — so
  the ring rides Saturn's exact equatorial frame by construction.
- **Appearance.** Radial alpha strip (SSS `saturn_ring_alpha.png`) as an N×1
  `texture_2d`, sampled by radius. Alpha-blended (straight-alpha `over`),
  `cullMode: 'none'` (two-sided), `depthCompare: 'less'` but
  `depthWriteEnabled: false` (Saturn's opaque sphere occludes the far ring
  half; front/back ring portions blend). Drawn after the opaque foreground
  spheres, into the same `foreground:0` target.
- **Analytic mutual shadows (Option A — ~20 lines WGSL each, closed-form, only
  Saturn's fragments pay):**
  - **Ring on planet** (in the *textured* Saturn sphere fragment): march from the
    surface point `p` (unit normal, local frame) toward `sunDirLocal` to the ring
    plane `z=0`: `t = −p.z / sunDirLocal.z`; if `t>0` and the hit radius
    `length(hit.xy)` (in planet-radius units) is within `[ringInnerRatio,
    ringOuterRatio]`, sample the ring strip alpha there and attenuate the Lambert
    term. This is why binding 3 (ring strip) lives on the textured-body bind
    group, and why `ringOuterRatio == 0` on every non-Saturn body cleanly skips
    the whole branch — **ring presence is data on the uniform, not a Saturn-only
    shader** (the un-braiding: the non-Saturn bodies pay one comparison, no
    branch complexity).
  - **Planet on ring** (in the ring fragment): ray-sphere test from the ring
    point toward `sunDirLocal` against the unit planet sphere
    (`RingUniforms.planetRadiusRatio = planetRadius/outerRadius`); a hit dims the
    ring sample.
  - `RingUniforms` (96 B): `mvp` (0..63) + `sunDirLocal` (64..75) +
    `planetRadiusRatio` f32 (76..79) + `innerRatio` f32 (80..83) + pad (84..95);
    bindings sampler + ring-alpha `texture_2d`.

## 9. Sub-pixel glints (Q10)

Below the resolution limit a body becomes a **brightness-scaled additive point
sprite** rather than vanishing:

- **Renderer.** `bodyGlintRenderer` (`renderers/bodies/bodyGlintRenderer.ts`) —
  a thin additive point pipeline into `(hdr, NEAR0)`, mirroring
  `starPointRenderer`'s camera-relative f64-rebase seam and Gaussian-dot WESL
  (shared at the `lib/billboard` level, not the pipeline level — the same
  justification `starPointRenderer` gives for not wrapping `pointRenderer`).
  Instance record `position`/`color`/`brightness` (§6.3).
- **Brightness.** `bodyGlintsLayer` computes per body `brightness = f(apparent
  size × albedo × phase)`, where phase is the illuminated fraction from the
  sun–body–camera geometry (crescent Venus dim, gibbous Moon bright — physically
  what naked-eye planets are). `color` = the body's albedo tint.
- **Cross-fade.** A new `SCALE_FADE_BANDS` row `bodyGlint` keyed on apparent
  diameter px — `{ fullAt: 1, goneAt: 3 }` (recede fade: glint full ≤1 px, gone
  ≥3 px). The mesh keeps its hard `SUB_PIXEL_BODY_CULL_PX = 1` cull; the glint
  fades IN over 3→1 px while the mesh still draws, so at 3 px the glint is ~0
  (mesh carries) and by 1 px it is full (mesh about to cull) — a smooth handoff,
  no pop. Reuses the `fadeBand` primitive, no new mechanism.
- **Gating.** Inside `FOREGROUND_MAX_DISTANCE_MPC` (nothing changes at galaxy
  scale). `feedback_opacity_zero_no_render`: a glint whose `brightness·fadeBand`
  rounds to 0 skips its draw (a faded-out or unlit-far-side body adds nothing).

## 10. Tools / pipeline

Mirrors the catalog raw→build→R2 pipeline verbatim (Q5 Option A).

- **`tools/fetch/fetchTextures.ts`** (`npm run fetch-textures`): `downloadWithResume`
  (`fetchCosmicflows4.ts` shape) writing raw sources to `data/raw/textures/`,
  **GET-only, no `HEAD`/`Range` probe** (SSS breaks both, §3); `.sha256` sidecars
  (`sha256OfFile`); `rawDataRegistry` rows under `textures.*`; provenance
  `data/raw/textures/README.md`. **Prints the ~700 MB full-fetch size up front and
  requires go-ahead** (`feedback_announce_big_downloads`). `--dev` flag fetches
  only the small subset (SSS 2k JPGs + NASA 5400×2700, ~7 MB) to exercise the
  pipeline visually without the full pull.
- **`tools/textures/buildTextures.ts`** (`npm run build-textures`): sharp/libvips —
  reads GeoTIFF (USGS) + JPEG (SSS) + BMNG; multiplies `grayscaleTint` into the
  mono sources (Europa, Callisto); downsamples to each body's registry tiers
  (only non-upscaled — reads `BODY_TEXTURE_REGISTRY[id].maxTier`); JPG quality
  ~80; ring PNG passthrough+downsample (alpha preserved). Emits
  `public/data/images/textures/<bodyId>-<px>.jpg` (+ `saturn-ring-<px>.png`).
  Sharp precedent: `tools/famous/fetchFamousImages.ts`.
- **R2 sync.** `collectTextureImages(dir)` (`tools/deploy/collectTextureImages.ts`,
  mirroring `collectHiResImages.ts`) sweeps `public/data/images/textures/` →
  r2Key `data/images/textures/<file>`; a second sweep in `syncR2.ts`'s `main`
  (like the hi-res sweep), so `dataUrl('images/textures/…')` resolves.
- **Attribution.** Add the credit line to the Splash footer credits paragraph
  (`src/components/Splash/Splash.tsx`, the existing `.credits` `<p>`): Solar
  System Scope (CC BY 4.0), NASA Earth Observatory (Blue Marble), NASA/USGS
  (moon mosaics).

## 11. Testing (`docs/superpowers/conventions/testing.md` — test what can break)

Unit (pure, hand-computed expectations — never a mirror of the source formula):

- `rotationFromIau`: a body with pole at (α=0, δ=90°), W₀=0 → identity-equivalent
  facing (pole on +z); a 90° W₀ rotates the prime meridian to +y. **Saturn's
  rotation-element pole equals `SATURN_EQUATORIAL_FRAME.normal`** (the rings /
  moons shared-frame invariant, Q9).
- `clampTier`: `large` clamped to Uranus's `small` ceiling → `small`; `small`
  clamped to `large` ceiling → `small` (never upscales).
- `bodyTextureRow` demand/release: inside `loadRadius` demands; between
  `loadRadius` and `2·loadRadius` **neither** demands nor releases (the
  hysteresis gap `!demand` could not encode); beyond `2·loadRadius` releases.
- Tier-freshness release: a `ready` slot committed at `medium` with desired
  `small` (clamped) is released.
- `partitionBodiesByPresentation`: glint / flat / textured disjoint and covering;
  a registry body with a non-resident slot lands in `flat`, resident in
  `textured`; Titan + irregular moons always `flat`.
- `sunDirLocal`: a body on +x world with identity orientation → sun direction −x
  in local frame; a body with a 90° orientation rotates it correspondingly
  (hand-checked).
- `composeBodyMvp` with a non-identity orientation: a surface point on the body's
  local +x lands where the rotated world direction projects (round-trip against a
  constructed f64 VP, the `composeOrbitConic` test shape).
- `buildTextures` pure tier-selection helper (registry → emitted tiers) and
  `tierToTexturePx`.
- `syncR2` `collectTextureImages` r2-key mapping + `ALLOW`/sweep coverage.

Visual (user-verified on the dev server, `?deepZoom` + `/link-data`, §12).

## 12. Definition of done

- Full test suite green (`npm test`), `npm run typecheck`, `npm run build` clean.
- No dangling refs to the deleted Earth texture path (grep-gated:
  `earthTextureSlot`, `earthTextureFetcher`, `EARTH_TEXTURE_MAX_DISTANCE_MPC`,
  `textureUrl`).
- **Visual verification on the dev server (dev texture subset, `?deepZoom`):**
  - lit textured **Mars** and **Jupiter** (2k dev subset) with correct band /
    feature orientation from the rotation elements;
  - **Saturn's rings** present, in Saturn's equatorial plane, with visible
    ring-on-planet AND planet-on-ring shadows;
  - **phase crescent on Venus** (sun-relative lighting produces a crescent, not a
    full disc);
  - **glint cross-fade** during descent — a body shrinking below ~3 px hands off
    to a brightness-scaled point with no pop;
  - **Earth Lambert** — Earth's lit/night hemisphere reads consistently with the
    lit planets beside it.
- **Full-res fetch + `build-textures` + `sync-r2-secure` run POST-MERGE from the
  MAIN worktree by the user** — worktree data isolation
  (`project_worktree_data_isolation`) + the constrained network
  (`feedback_announce_big_downloads`) mean the ~700 MB raw pull and R2 sync do not
  run in the feature branch/worktree; the branch merges green against the dev
  subset, and the user does the production texture build + sync from `main`
  afterward. The CLAUDE.md data-pipeline section gains a "Re-run order when
  planet textures change" block (fetch-textures → build-textures →
  sync-r2-secure) alongside the CF4/DESI/structures blocks.

## 13. File inventory

**New — types (one per file):**
```
src/@types/scene/RotationElements.d.ts
src/@types/scene/BodyTextureSpec.d.ts
src/@types/scene/RingSpec.d.ts
src/@types/data/BodyTextureId.d.ts        (+ RingTextureId.d.ts)
src/@types/loading/BodyTextureReq.d.ts
src/@types/rendering/TexturedBodyRenderer.d.ts
src/@types/rendering/RingRenderer.d.ts
src/@types/rendering/BodyGlintRenderer.d.ts
```
**New — data / utils:**
```
src/data/bodies/rotationElements.ts
src/data/bodies/bodyTextureRegistry.ts
src/data/bodies/sceneRings.ts
src/utils/orbit/rotationFromIau.ts
src/utils/math/clampTier.ts
src/utils/math/tierToTexturePx.ts
src/utils/math/identityMat3.ts
src/utils/math/annulusMesh.ts
src/utils/camera/sunDirLocal.ts
src/services/engine/frame/partitionBodiesByPresentation.ts
src/services/engine/frame/bodyTextureLoadRadius.ts
```
**New — renderers / shaders / loading / passes:**
```
src/services/gpu/renderers/bodies/texturedBodyRenderer.ts
src/services/gpu/renderers/bodies/ringRenderer.ts
src/services/gpu/renderers/bodies/bodyGlintRenderer.ts
src/services/gpu/shaders/bodies/texturedBody/{io,vertex,fragment}.wesl
src/services/gpu/shaders/bodies/ring/{io,vertex,fragment}.wesl
src/services/gpu/shaders/bodies/bodyGlint/{io,vertex,fragment}.wesl
src/services/gpu/shaders/lib/bodyLighting.wesl
src/services/gpu/lib/generateMipChain.ts + shaders/lib/mipBlit.wesl
src/services/loading/fetchers/bodyTextureFetcher.ts
src/services/engine/wiring/bodyTextureSlotRegistry.ts   (mint + commit dispatch)
src/services/engine/frame/passes/texturedBodiesLayer.ts
src/services/engine/frame/passes/ringsLayer.ts
src/services/engine/frame/passes/bodyGlintsLayer.ts
```
**New — tools:**
```
tools/fetch/fetchTextures.ts
tools/textures/buildTextures.ts
tools/deploy/collectTextureImages.ts
data/raw/textures/README.md            (provenance)
```
**Modified:**
```
src/@types/scene/PlanetBody.d.ts        (+orientation)
src/@types/scene/EarthBody.d.ts         (+orientation, −textureUrl)
src/data/bodies/{scenePlanets,sceneEarth}.ts + makers/{heliocentricPlanet,satelliteBody}.ts (bake orientation)
src/utils/camera/composeBodyMvp.ts      (orientation param → T·R·S)
src/services/gpu/shaders/lib/sphere.wesl (+LitBodyUniforms, +TexturedBodyUniforms)
src/services/gpu/renderers/bodies/planetRenderer.ts (24-float instance + sunDirLocal)
src/services/gpu/shaders/bodies/planet/{io,vertex,fragment}.wesl (sunDirLocal; delete LIGHT_DIR)
src/services/gpu/renderers/bodies/earthRenderer.ts (LitBodyUniforms + mips)
src/services/gpu/shaders/bodies/earth/{vertex,fragment}.wesl (litShade)
src/services/engine/frame/passes/{planetsLayer,earthLayer,index}.ts
src/services/engine/wiring/assetWiring.ts (bodyTexture family rows; DELETE earthTexture row)
src/services/engine/wiring/reevaluateDemand.ts (bodyTextures stale-tier release)
src/services/engine/phases/initGpu.ts (construct new renderers; mint bodyTextures family)
src/@types/engine/handles/EngineGpuHandles.d.ts (+texturedBodyRenderer, ringRenderer, bodyGlintRenderer)
src/@types/engine/state/… (assetSlots.bodyTextures family Map)
src/services/engine/presentation/scaleFadeBands.ts (bodyGlint band)
tools/deploy/syncR2.ts (texture sweep)
tools/utils/io/rawDataRegistry.ts (textures.* rows)
package.json (fetch-textures, build-textures scripts)
src/components/Splash/Splash.tsx (SSS/NASA/USGS attribution)
CLAUDE.md (re-run order when planet textures change)
```
**Deleted:**
```
src/services/loading/slots/earthTextureSlot.ts
src/services/loading/fetchers/earthTextureFetcher.ts
public/images/earth/blue-marble-4k.jpg    (Earth texture now on R2)
```

## 14. Open questions / simplicity notes

- **Fold candidate surfaced (not taken now):** `bodyGlintRenderer` and
  `starPointRenderer` are near-identical additive point-sprite pipelines with the
  same camera-relative f64-rebase seam. They are strong candidates to merge into
  one "point glint" renderer taking `(position, color, brightness)` instances.
  **Deliberately kept separate for this feature** to avoid entangling the body
  glints into `starPointRenderer`'s subtle star-jitter rebase seam mid-feature;
  flagged here for a follow-up simplicity pass
  (`feedback_surface_fold_candidates`).
- **Ring presence as data, not a shader branch** (§8) is the deliberate
  un-braiding of the "Saturn is special" asymmetry — `ringOuterRatio == 0` makes
  every non-Saturn textured body skip the shadow term with one comparison and a
  never-sampled 1×1 placeholder, so no Saturn-only pipeline variant exists.
- **Tier change = one release edge** (§5.4) un-braids "proximity assets vs
  always-resident assets" into a single `slot.release()` concept (distance-evict
  OR stale-tier-evict), rather than a second tier-reload mechanism.

## 15. References

- Grill session: `docs/grill-sessions/planet-rendering-2026-07-17.md` (Q1–Q13).
- Zoom-to-Earth true-scale design + conic orbit trails
  (`specs/completed/2026-06-29-…`, `specs/completed/2026-07-11-…`) — the `f64`
  NEAR0 slab, `composeBodyMvp`, element-table single-source-of-truth this grows.
- `docs/superpowers/conventions/{plan-style,simplicity,testing}.md`;
  `wesl-shaders` skill (no backticks, `?static`, `package::`, texture_2d-only).
- Source verification: SSS (CC BY 4.0), NASA BMNG (PD), USGS Astrogeology (PD) —
  §3 table.
</content>
</invoke>
