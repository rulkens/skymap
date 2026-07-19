# Photorealistic Earth — PBR surface, night lights, clouds, atmospheric scattering — design

> **Status.** Approved design (grill session `docs/grill-sessions/photoreal-earth-2026-07-18.md`,
> Q1–Q10, user-ratified 2026-07-18; source seams verified against the repo 2026-07-18).
> Awaiting plans.
> **Date.** 2026-07-18.
> **Relationship to prior work.** Grows the true-scale foreground body layer shipped by
> planet rendering (`specs/completed/2026-07-17-planet-rendering.md`) and zoom-to-Earth
> (`specs/completed/2026-06-29-zoom-to-earth-true-scale-design.md`). Consumes the `f64`
> NEAR0 slab + `composeBodyMvp` precision path, the `CONTENT_LAYERS` (target, slab, blend)
> table, the `AssetSlot`/`ASSET_WIRING` proximity-gated demand system, and the
> `sunDirLocal` local-frame lighting seam — all unchanged in kind. This is growth at
> those seams plus the two loading-system joints named in §2. Retires the `docs/BACKLOG.md`
> "Ultra-real Earth" `needs-design` item.

## 1. What we're building

Earth — drawn today as a single equirectangular Blue Marble day map on a UV sphere,
shaded by one Lambert term plus a flat ambient floor (`earthRenderer.ts`,
`earth/fragment.wesl`) — becomes photorealistic on close approach:

- **Physically-based surface** — a microfacet BRDF (GGX specular + Oren-Nayar diffuse +
  Fresnel, dielectric constant F0, no IBL) driven by a channel-packed roughness/ocean
  **material map**, so the ocean throws a real sun **glint** and land/sea read with
  correct roughness contrast. Plus a **normal map** baked offline from elevation for
  terminator relief.
- **Day/night city lights** — a NASA Black Marble night map blended in on the dark side
  by the day/night factor, dimmed where clouds cover it.
- **A translucent cloud shell** — a separate body-agnostic shell renderer above the
  surface, casting a soft shadow onto the ground and occluding night-side city lights,
  with a seam designed for a future live cloud-coverage provider.
- **Physically-based atmosphere** — a body-agnostic atmosphere shell using the
  Bruneton/Hillaire precomputed multi-scattering model, LUTs baked on-device at startup,
  giving the blue limb and the reddened sunset ring.

The surface upgrade is Earth-specific (Earth keeps its own renderer — it grows
person-level terrain later); the atmosphere and cloud **shells** and the shading
**maths** are body-agnostic and reused by other bodies.

### Non-goals (explicitly deferred)

- **Person-level terrain** — tiled heightmap streaming, mountains, 3D buildings, LOD.
  This spec only prepares the *coordinate system* for it (cubesphere + tile addressing,
  §4); no quadtree, no streaming, no displacement.
- **Aerial-perspective froxel** (the 3D view-dependent LUT) — only matters looking
  *through* the atmosphere from inside; deferred to the terrain/descent phase. Ship the
  2D LUTs (transmittance + multi-scatter) + the per-frame sky-view LUT now.
- **Live "digital-twin" Earth** — real-time cloud coverage + wall-clock Earth rotation +
  wall-clock terminator. Feasible and seam-compatible (§7.4), but only meaningful as a
  *bundle* (skymap has no time-of-day/rotation model today); shipped as a static cloud
  map now with the live seam designed in.
- **Gas-giant atmospheric scattering** — Bruneton assumes a thin shell over a solid
  surface, which gas giants lack. They get a `lib/limbDarkening` term in the surface
  fragment instead (§8.4), not the atmosphere shell.
- **Volumetric clouds**, **metalness maps** (planets are dielectric), **IBL** (no
  environment map in the foreground).

## 2. Ground preparation

Checkpoint user-approved 2026-07-18. The `refactor-ground` pass over the touchpoints
found **everything is growth at existing seams EXCEPT two missing joints in the texture
pipeline**. Two joints I initially suspected turned out already built:

- **Earth-stays-separate is already a joint.** `BodyStore.earth: EarthBody | null` is
  deliberately split from `.planets` (`@types/engine/data/BodyStore.d.ts`), and
  `earthLayer` is its own `CONTENT_LAYERS` row — routing to `earthRenderer` needs no new
  dispatch. Matches the Q1 decision exactly.
- **Translucent-OVER on `foreground:0` is already a joint.** `ringsLayer` is a
  `blend: 'over'` row that depth-tests but writes no depth, drawn last
  (`passes/ringsLayer.ts`). The cloud + atmosphere shells are new rows modeled on it —
  no new mixed-blend seam.

### Ideal shape (data delta first)

```
── DATA ─────────────────────────────────────────────────────────────
rawDataRegistry.ts   + textures.earthNight, .earthClouds, .earthWaterMask,
                       .earthElevation   (gitignored, upstream URLs, fetcher, sha256)

# PREP 2 — one source table (today: SSS_BODIES [fetch] ⊕ BODY_SOURCE_KEYS [build] mirror)
TEXTURE_SOURCES: Record<TextureKey, { native, dev?, ... }>   (single home)

# PREP 1 — texture-kind axis (today: family keyed by body id only)
TextureKind          'surface' | 'night' | 'clouds' | 'material' | 'normal'
BodyTextureReq       { bodyId, kind, tier }                  // + kind
BodyTextureSpec      per-(body,kind) tier ceiling            // clouds/night can be lower
fetcher filename     `${bodyId}-${kind}-${px}.{jpg|png}`     // + kind segment
commit dispatch      (body,kind) → earthRenderer.setMap(kind, bitmap)
                                 / cloudShellRenderer.setTexture(bitmap)

# FEATURE data (growth)
EarthSurfaceUniforms  LitBodyUniforms prefix + { roughness/F0, sunIrradiance,
                        cloudShadowStrength, … }   ← sibling of TexturedBodyUniforms
CubeSphereMesh        { positions, uvs, indices, tangents }  // (face,level,tileX,tileY)
AtmosphereParams      per-body { planetR, atmoR, rayleigh[3], mieScatter, mieG, ozone, … }

── MODULES (growth — new files at existing seams) ──────────────────
shaders/lib/pbr.wesl             GGX + Oren-Nayar + Fresnel
shaders/lib/nightLights.wesl     day/night blend + cloud occlusion
shaders/lib/limbDarkening.wesl   gas-giant term (surface fragment composes it)
utils/math/cubeSphereMesh.ts     + @types CubeSphereMesh
renderers/bodies/cloudShellRenderer.ts          + shaders/bodies/cloudShell/*
renderers/atmosphere/atmosphereShellRenderer.ts + LUT-bake compute + shaders/atmosphere/*
tools/textures/  writeLinearTier() + bakeNormalMap()   (first linear + first derived output)
CONTENT_LAYERS   + cloudShellLayer, + atmosphereShellLayer  (blend:'over', after earthLayer)
```

### Missing joints (verdicts)

| Touchpoint | Verdict | Blocker |
|---|---|---|
| Earth carries 4+ maps | **BOLT-ON** — family is one-texture-per-body-*key*, no kind discriminant; adding maps forces fake body-ids (`earth-night`) polluting `BodyTextureId` (which drives partition/glint/**pick**), or hard-coding outside the slot family | `@types/loading/BodyTextureReq.d.ts:19`, `bodyTextureFetcher.ts:40`, `bodyTextureSlotRegistry.ts:79`, `bodyTextureKeys.ts:18` |
| Add 4 source rows to a hand-maintained mirror | **BOLT-ON** — `SSS_BODIES` (fetch) ⊕ `BODY_SOURCE_KEYS` (build) duplicated; `SSS_BODIES` not keyed by `BodyTextureId` ⇒ an omitted map compiles clean → silent untextured render. Adding rows 5–8 is the second-special-case trigger | `fetchTextures.ts:91`, `buildTextures.ts:94` |
| Everything else | **GROWTH** | — |

### Prep refactors (two PRs, land before the feature PRs)

- **Prep 1 — Texture-kind axis.** Generalize the body-texture family from `(body)` to
  `(body, kind)` across `BodyTextureReq`, the fetcher filename, the slot keys
  (`ALL_BODY_TEXTURE_KEYS`), the commit dispatch (`commitBodyTexture`), and the renderer
  setter; per-kind tier ceilings. **Behavior-neutral** — every existing body's day map
  flows through `(id, 'surface')`. Independently testable. Unblocks all five feature PRs.
  Decision (grill §refactor-ground ask): **generalize the shared family**, not
  Earth-private slots — clouds are body-agnostic (Venus/Titan reuse them), it is a modest
  behavior-neutral extension, and the commit-dispatch-by-key already routes ring textures
  to a different renderer, so `(body,kind) → right renderer` is the natural extension.
- **Prep 2 — Single texture source table.** Collapse the `SSS_BODIES`/`BODY_SOURCE_KEYS`
  mirror into one body→source table keyed by the texture key, so new maps are added once.
  **Retires** the `docs/backlog/2026-07-17-texture-source-table-single-home.md` detail
  file + its `docs/BACKLOG.md` index line in the same PR.

### Adjacent findings (not required — stay backlogged)

- **Tier-ladder duplication** (`['small','medium','large']` hard-coded in `clampTier`,
  `emittedTiersForBody`, `tiersFittingSourceWidth`, `buildAllBins`, `buildStars`) —
  `docs/BACKLOG.md` "tier-ladder single home". Untouched by this feature.
- **Blend↔pipeline parity check** — the `foreground:0` mixed-blend guardrail the `Blend`
  docs anticipate; `ringsLayer` already draws OVER there without it. Remains a future
  guardrail.

## 3. Architecture — three layers, one shell pattern

```
earthRenderer (surface)   ── grows terrain later; composes shared shading libs
   ↑ opaque, depth-write, foreground:0
cloudShellRenderer        ── body-agnostic shell, blend:'over', depth-test/no-write
   ↑
atmosphereShellRenderer   ── body-agnostic shell, blend:'over', drawn LAST
```

- **Surface** = Earth-specific renderer (Q1). Keeps its own pipeline, mesh, bind group;
  free to evolve toward terrain. Composes `lib/pbr.wesl` + `lib/nightLights.wesl`.
- **Shells** = body-agnostic renderers parameterized by per-body uniforms. A body invokes
  a shell iff its data says so (Earth: clouds + atmosphere; Venus later: clouds + thick
  atmosphere; Moon: neither). Pure "branch on data" — a body that invokes no shell pays
  nothing.
- **Shading maths** = `shaders/lib/` functions Earth composes now and other bodies opt
  into later. `lib/limbDarkening.wesl` is the gas-giant path (§8.4), composed by the
  *surface* fragment — gas giants get no atmosphere shell.

## 4. Geometry — cubesphere, tile-addressed

Replace Earth's `uvSphereMesh(48, 24)` with a **cubesphere** base mesh (six faces, each a
grid, evenly tessellated, pole-pinch-free — an immediate silhouette + specular win).
Other bodies keep `uvSphereMesh` (`utils/math/uvSphereMesh.ts` unchanged).

- **New:** `utils/math/cubeSphereMesh.ts` + `@types/math/CubeSphereMesh` = `{ positions,
  uvs, indices, tangents }`. UVs map each face into the equirectangular maps; **tangents**
  are emitted for tangent-space normal mapping (the current `UvSphereMesh` has none, and
  `VSOut` carries only `uv` + `normalLocal`).
- **Tile addressing (forward-compat, the "don't rewrite" prep):** the generator is
  parameterized by `(face, level, tileX, tileY)`, called only for the six whole faces
  (level 0) today. That `(face,level,x,y)` scheme is the coordinate system a future
  quadtree subdivides — getting it right now is the load-bearing forward-compat. **No**
  quadtree/LOD/streaming/displacement in this spec (§1 non-goals).
- Same J2000 equatorial frame as `uvSphereMesh` (prime meridian on +x, longitude winds
  x→y). Same CCW-outward winding, `frontFace:'ccw'` + `cullMode:'back'`.

## 5. Surface PBR

The surface fragment replaces the single Lambert term (`earth/fragment.wesl`'s `litShade`)
with a microfacet direct-lighting model against the one directional Sun (no IBL). New
`shaders/lib/pbr.wesl`:

- **Specular:** Cook-Torrance GGX (D·G·F / 4·NoL·NoV). **Dielectric constant F0** (~0.02–
  0.04); no metalness map. Roughness from the **material map** — ocean smooth (tight bright
  glint), land/cloud rough (broad/none). The ocean glint is the primary realism win.
- **Diffuse:** **Oren-Nayar** (roughness-driven), not Lambert — fixes the too-flat/too-
  bright terminator on rough bodies (its first reuse customers are the Moon/Mars). Costs
  nothing at roughness≈0.
- **Fresnel:** the GGX Fresnel term gives the ocean's grazing-angle brightening for free.
- **Normal map:** tangent-space, sampled with the cubesphere tangents (§4), baked offline
  (§9.3). Adds terminator relief.
- **Ambient:** keep the shared low `AMBIENT` const (`lib/bodyLighting.wesl`) as a small
  skylight floor for now; a future atmosphere-fed ambient is out of scope.

**Material map channel packing** (the linear "ORM" texture): `R = roughness`,
`G = ocean/specular mask`, `B/A` spare. One material sample in the surface fragment.

## 6. Night lights

`shaders/lib/nightLights.wesl`. The Black Marble night map is blended in by the night
factor `(1 − dayFactor)` where `dayFactor` tracks the Lambert/Sun term, so city lights
appear only on the dark hemisphere and fade through the terminator. **Cloud occlusion:**
the night contribution is multiplied by `(1 − cloudAlpha)` sampled at the fragment's own
UV (§7.3), so a city under cloud dims. Night lights are emissive (added, not lit).

## 7. Cloud shell

### 7.1 Renderer

`cloudShellRenderer` — a body-agnostic translucent sphere slightly above the surface, its
own cloud+alpha map, lit by the same `sunDirLocal`. `CONTENT_LAYERS` row `cloudShellLayer`
(`target:'foreground:0'`, `slab:NEAR0`, `blend:'over'`), inserted after `earthLayer`,
before `atmosphereShellLayer`. Depth-test on, depth-write off (modeled on `ringsLayer`).
Static (no drift — skymap has no clock; §7.4).

### 7.2 Cloud shadow on ground

For a day-side surface fragment, analytic ray→cloud-shell-sphere intersection along
`sunDirLocal`, sample cloud alpha at the crossing UV, darken the direct sun term by
`(1 − cloudAlpha·strength)`. Self-limits at the terminator (multiplies the ~0 sun term).

### 7.3 The surface↔cloud coupling (accepted)

Cloud-shadow (§7.2) and night-occlusion (§6) both require the **surface fragment to bind
and sample the cloud texture** — two samples at different UVs (along-sun for shadow, own-UV
for occlusion). This is the one place the layers aren't perfectly independent: the cloud
map is a shared input bound in both the surface and cloud pipelines. Earth-specific and
data-gated (Venus reuses the cloud shell but wants no ground shadow — you never see its
surface). Accepted for the realism payoff (grill Q6c).

### 7.4 Live-cloud provider seam (future, not built)

The cloud map lands through the same async `setTexture(bitmap)` seam as every body texture,
so the *source* is swappable: shipped static R2 map now; a future **NASA GIBS** WMTS
EPSG:4326 (equirectangular, CORS-enabled) fetch later, behind the same seam with zero
renderer rework. Physically-correct live clouds also require wall-clock Earth rotation +
terminator (absent today), so "live Earth" is a coherent future bundle, not half-built here.

## 8. Atmosphere shell

### 8.1 Model

Bruneton/Hillaire precomputed atmospheric scattering. Per-body `AtmosphereParams` (planet
radius, atmosphere-top radius, Rayleigh coefficients + scale height, Mie scatter/absorb +
scale height + phase-g, ozone) — **data, not code**: Earth now, Mars/Venus/Titan later by
coefficient rows.

### 8.2 LUTs — baked on-device (grill Q4)

Four LUTs, two kinds:

| LUT | Dims | View-dependent? | Lifecycle |
|---|---|---|---|
| Transmittance | 256×64 (2D) | No | **baked once at startup** (compute) |
| Multi-scatter | 32×32 (2D) | No | **baked once at startup** (compute) |
| Sky-view | ~192×108 (2D) | Yes | per-frame render |
| Aerial-perspective froxel | 32×32×32 (3D) | Yes | **DEFERRED** (§1) |

On-device bake (compute precedent: `galaxy/createGenerationPipelines.ts`, `flow/compute.wesl`)
— no R2/data-pipeline changes, and it keeps the tune-a-coefficient-see-it-live loop that
matters for eyeballed realism. The bakeable LUTs are 2D and tiny (~136 KB); shipping them
would only add a pipeline dependency and kill live tuning.

### 8.3 Compositing & the march bound (grill Q8)

`atmosphereShellLayer` draws **last** in the `foreground:0` group, `blend:'over'`:
`out = inScatter + dst·(1 − opacity)`, `opacity = 1 − transmittance` — physically-correct
(everything behind attenuated by transmittance, in-scatter added).

- **March bound = analytic ray–sphere intersection with Earth's *surface* sphere**, NOT a
  depth-buffer read. The surface is a sphere this phase, so the fragment bounds the
  integral analytically — this keeps the `foreground:0` depth texture `RENDER_ATTACHMENT`-
  only (`renderTargets.ts:76`), untouched. Occlusion by *other* opaque bodies (Moon in
  front) is handled by the ordinary **depth-test**.
- **Inside/outside robustness:** draw the proxy's **back faces** + analytic atmosphere-
  shell intersection for `[tNear, tFar]`, clamp `tNear→0` when inside. Orbital + grazing
  work now; the aerial-perspective *refinement* (froxel) is the deferred piece.
- **Later (terrain phase):** make the depth texture `TEXTURE_BINDING` and read it (surface
  is no longer a sphere). One usage-flag change, deferred.
- **NEAR0 safety:** shells reuse the exact `depth32float` NEAR0 profile and **write no
  depth** — zero new z-fighting (can't worsen the Sun/star-flicker bracket issues).
- **Picking:** shells non-pickable; `bodyPickRenderer` unchanged.

### 8.4 Gas giants — not the shell

Gas giants have no solid surface / no shell — Bruneton is geometrically meaningless for
them. They get `shaders/lib/limbDarkening.wesl` (Minnaert / cosine-power) composed in the
**surface** fragment (banded albedo they already ship + limb darkening + a faint scattering
rim). Clean branch-on-data: a body is has-scattering-shell (terrestrial) / has-limb-
darkening (gas giant) / airless (neither). This is a `texturedBodyRenderer` follow-on, not
Earth work — noted here because it's why the atmosphere shell stays terrestrial-only.

## 9. Texture data set

### 9.1 Maps

| Map | Have? | Source | Format | Tier |
|---|---|---|---|---|
| Day albedo (`surface`) | ✅ `world.topo.bathy` | shipped (`textures.nasaBmng`) | sRGB | 8K |
| Night (`night`) | ❌ | NASA Black Marble (VIIRS) | sRGB | 8K |
| Clouds (`clouds`) | ❌ | NASA cloud composite (alpha from luminance) | sRGB + α | 8K |
| Material (`material`) | ❌ | NASA water mask (or derive from bathymetry) | **linear** | 4K |
| Normal (`normal`) | ❌ | **baked offline** from an elevation heightmap | **linear** RG | 4K |
| Elevation (bake input) | ❌ | GEBCO/SRTM downsampled proxy | — | build-only |

### 9.2 Resolution & memory

8K for colour maps (day/night/cloud); **4K for masks** (material/normal read coarsely) —
halves their memory. Top-tier VRAM ≈ 450 MB for Earth alone; acceptable (Earth is the only
body at top tier during descent), riding the existing `build-textures` tier ladder + mips.

### 9.3 Build pipeline (two new capabilities in `tools/textures/`)

- **`writeLinearTier`** — the first **linear-data** output (material + normal must not be
  sRGB-encoded; today every output is treated as sRGB colour). No precedent.
- **`bakeNormalMap`** — the first **derived/computed** output (today every output is a
  straight resize of a fetched source). Elevation heightmap → tangent-space normal via a
  gradient kernel, tunable exaggeration. Needs a raw heightmap source (`textures.earthElevation`).

Runtime URL derivation and R2 sync need **no** change beyond the kind axis. The filename
convention is **surface = default, unsegmented**: `surface` keeps the existing
`<id>-<px>.{jpg,png}` name (so every already-deployed texture stays valid and Prep 1 is a
zero-data-op refactor), and only non-surface kinds get a `-<kind>-` segment
(`earth-night-<px>.jpg`, …). A single `bodyTextureFilename(bodyId, kind, tier)` helper is
the one home for that convention, called by both the runtime fetcher and the build tool so
they cannot drift. `collectTextureImages` globs the whole textures dir, so future segmented
maps sweep to R2 automatically when their feature PR builds them. (The §2 ideal-shape sketch
showed an always-segmented name; it is superseded here — a uniform segment would force a
rebuild + re-sync of all deployed textures for a behavior-neutral prep. The `(body,kind)`
*data shape* is unchanged; only the `surface` filename *encoding* differs. See Prep 1 plan
"Coupling".)

### 9.4 Bandwidth

New source fetches (night + cloud + water-mask + elevation) ≈ **20–40 MB** one-time,
resumable. Exact URLs + real total pinned and **user go-ahead obtained before any fetch**
(announce-big-downloads convention). Nothing downloads during design.

## 10. Uniforms

New `EarthSurfaceUniforms` struct (in `lib/sphere.wesl`, sibling of `TexturedBodyUniforms`/
`RingUniforms`) + `packEarthSurfaceUniforms` (sibling of `packLitBodyUniforms`, reusing the
80-byte lit prefix): the `LitBodyUniforms` prefix (mvp + sunDirLocal) + surface scalars
(roughness base / F0, sun irradiance, cloud-shadow strength). Shells carry their own
uniforms (`AtmosphereParams` prefix + camera-relative fields for the LUT lookup). Do **not**
overload the shared `LitBodyUniforms` (other bodies bind it) — new struct per the
established sibling pattern.

## 11. Performance (grill Q9)

The LUT choice keeps per-pixel atmosphere cost to a couple of LUT samples + the analytic
intersection (not a march), so full-screen-at-closest-zoom stays cheap; the heaviest
existing pass (volume raymarch) is heavier. Target **60 fps desktop / 30–60 fps iOS**. No
adaptive-quality machinery in v1 — LUT dimensions + any march-sample counts are **named
tunable constants** (lower a number if a weak device appears in testing). iOS safety: the
bakeable LUTs are 2D (the 3D froxel WebKit would choke on is deferred). Cubesphere stays a
single fixed subdivision (LOD is the terrain phase).

## 12. Delivery — PR sequence

Fine-grained (grill Q10). Data fetches land with the PR that first consumes each; docs
(this spec + all plans) ride the **first PR** (grill Q10 — same PR as the first ground-prep
code, not a separate docs PR).

| PR | Scope | Visible win |
|---|---|---|
| **Prep 1** | Texture-kind axis (`(body,kind)` family) — behavior-neutral | none (refactor) |
| **Prep 2** | Single texture source table — retires the backlog item | none (refactor) |
| **A** | Cubesphere + PBR surface (`lib/pbr.wesl`, material map, `EarthSurfaceUniforms`) | even silhouette + ocean glint |
| **B** | Night lights (Black Marble + day/night blend) | city lights on the dark side |
| **C** | Normal/relief (`bakeNormalMap` + `writeLinearTier` + surface sample) | terminator relief |
| **D** | Cloud shell (`cloudShellRenderer` + shadow + night occlusion) | clouds + soft ground shadows |
| **E** | Atmosphere shell (`atmosphereShellRenderer` + on-device LUT bake) | blue limb + sunset ring |

Dependency order: Prep 1, Prep 2 → A → {B, C} → D → E. Prep PRs land first. Each feature PR
is its own plan under `docs/superpowers/plans/` per `plan-style.md`.

## 13. Open questions / future extensions

- **Live Earth bundle** (§7.4) — live GIBS clouds + wall-clock rotation + terminator.
- **Aerial-perspective froxel** (§8.2) — the 3D LUT, for the terrain/descent phase.
- **Terrain** (§4) — the quadtree the cubesphere tile-addressing prepares for.
- **Gas-giant limb darkening** (§8.4) — a `texturedBodyRenderer` follow-on reusing
  `lib/limbDarkening.wesl`.
