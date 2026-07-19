# Photoreal Earth A — Cubesphere + PBR Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace Earth's UV-sphere + single-Lambert surface with a pole-pinch-free **cubesphere** mesh and a **physically-based** surface (GGX specular + Oren-Nayar diffuse + Fresnel) driven by a channel-packed **material map**, so Earth gains an even silhouette and a real sun **glint** off the ocean on close approach.

**Architecture:** Earth keeps its own dedicated renderer (`earthRenderer.ts`) — this is the Earth-specific surface layer of the three-layer shell design (spec §3). The mesh + shading maths are new `utils/math/` + `shaders/lib/` modules; the material map flows through the existing `(body, kind)` texture family (Prep 1) and the single `TEXTURE_SOURCES` table (Prep 2) with no new dispatch. The cloud + atmosphere shells (plans D/E) and night lights (plan B) / normal relief (plan C) are OUT of scope — this plan only leaves the seams they read (the `EarthSurfaceUniforms` `cloudShadowStrength` placeholder scalar, the mesh's emitted tangents, the linear-texture build primitive).

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders, `sharp`/libvips for the offline texture build, Vitest.

**Spec:** docs/superpowers/specs/2026-07-18-photoreal-earth-design.md (§4, §5, §9, §10, §12 row A)

### Header notes — resolved decisions (do not re-litigate)

- **`writeLinearTier` lands in THIS plan, not plan C.** Spec §12's table lists it under C, but §12's dependency order (A → {B, C}) plus §9.3's "material must not be sRGB-encoded" and §12's "data fetches land with the PR that first consumes each" force it into A: the material map is the **first linear consumer**. Plan C adds only `bakeNormalMap` on top of it.
- **The material map auto-wires through the prep-refactored slot family.** Adding `material` to `BODY_TEXTURE_REGISTRY.earth.kinds` makes `ALL_BODY_TEXTURE_KEYS` mint the slot, the `ASSET_WIRING` proximity row, and the fetcher URL automatically (`bodyTextureKeys.ts:22-29`). The only runtime code edit is `earthRenderer.setMap('material', …)` binding it. No `assetWiring` / `bodyTextureSlotRegistry` edit is needed — the commit dispatch already routes every Earth kind to `setMap(kind, …)` (`bodyTextureSlotRegistry.ts:86-91`).
- **The glint needs a view vector.** GGX specular is view-dependent; the current uniform carries no camera position. `EarthSurfaceUniforms` therefore adds `camPosLocal` (camera position in the body's unit-sphere local frame) beyond the §10 field list — see the ambiguity note in Task 4. This is the one addition beyond spec §10's literal scalar list.

## Global Constraints

Binding values copied from the spec; every task inherits them.

- **BRDF (spec §5):** Cook-Torrance GGX specular (`D·G·F / 4·NoL·NoV`), Oren-Nayar diffuse, Schlick Fresnel. **Dielectric constant F0 ≈ 0.02–0.04**, no metalness, no IBL. Keep the shared `AMBIENT` floor from `lib/bodyLighting.wesl:34` as the skylight floor.
- **Material map (spec §5, §9.1, §9.3):** channel-packed **linear** (NOT sRGB) texture — `R = roughness`, `G = ocean/specular mask`, `B/A` spare. One material sample in the surface fragment. **4K ceiling** (spec §9.2) → `kinds.material = 'medium'`.
- **Cubesphere (spec §4, §1):** six faces, evenly tessellated, pole-pinch-free. Generator parameterized by `(face, level, tileX, tileY)`, invoked **only for the six whole faces at level 0** today. **NO** quadtree / LOD / streaming / displacement. Same **J2000 equatorial frame** as `uvSphereMesh` (prime meridian on +x, longitude winds x→y), same **CCW-outward winding** (`frontFace:'ccw'` + `cullMode:'back'`), **equirectangular UVs** matching `uvSphereMesh`'s convention so the existing Blue Marble texture + `flipY:true` upload are unchanged. **Emit tangents now** (plan C consumes them).
- **Uniforms (spec §10):** new `EarthSurfaceUniforms` struct in `lib/sphere.wesl`, **sibling of `TexturedBodyUniforms`** — do NOT overload the shared `LitBodyUniforms` (planets/moons/ring bind it). Reuse the 80-byte lit prefix via `packLitBodyUniforms`.
- **Filename convention (spec §9.3):** `surface` unsegmented, non-surface kinds segmented; the **single home** is `bodyTextureFilename` — never introduce a second name site.
- **Performance (spec §11):** target **60 fps desktop / 30–60 fps iOS**. All quality knobs are **named tunable constants** — NO adaptive-quality machinery. Cubesphere is a single fixed subdivision (LOD is the terrain phase).
- **Downloads (spec §9.4):** the material-source fetch (~10–20 MB water mask) announces its size and **gets user go-ahead BEFORE fetching** (announce-big-downloads). Nothing downloads except in the explicit fetch task.
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `src/@types/` (filename = export name); deep relative imports, no barrels; didactic multi-paragraph module headers; WESL comments use single quotes (NO backticks), WESL imports use literal `package::` paths; wgpu-matrix (`vec3`/`mat4`) + `Vec3` aliases never raw tuples; raw-data paths via `rawDataPath('<key>')`; stage specific paths on commit (never `git add -A`).

---

## Task 1: `CubeSphereMesh` type + `cubeSphereMesh` generator

**Files:**

- Create `src/@types/math/CubeSphereMesh.d.ts`
- Create `src/utils/math/cubeSphereMesh.ts`
- Create `tests/utils/math/cubeSphereMesh.test.ts`

**Interfaces — Produces:**

```ts
// @types/math/CubeSphereMesh.d.ts
export type CubeSphereMesh = {
  readonly positions: Float32Array; // 3 per vertex, UNIT radius, J2000 frame
  readonly uvs: Float32Array; // 2 per vertex, equirectangular (matches uvSphereMesh: u=lon/2π, v=lat/π+0.5)
  readonly indices: Uint32Array; // triangle list, CCW = outward-facing
  readonly tangents: Float32Array; // 3 per vertex, unit local-space +u (east) direction
};

// utils/math/cubeSphereMesh.ts — ONE whole face-tile's mesh
export function cubeSphereMesh(
  face: number, // 0..5 (±x, ±y, ±z)
  level: number, // subdivision level; 0 = whole face (the only level today)
  tileX: number, // tile column within the face at `level` (0 today)
  tileY: number, // tile row within the face at `level` (0 today)
  resolution: number, // quads per tile edge
): CubeSphereMesh;
```

- `(face, level, tileX, tileY)` is the load-bearing forward-compat coordinate system (spec §4). At `level 0`, `tileX/tileY` are `0` and the whole face is generated; the params exist so a future quadtree subdivides without a signature change. Implement level 0 only — a `level > 0` tile is a sub-rectangle of the face's `[0,1]²` parameter square (`tileX/2^level … (tileX+1)/2^level`), but do **not** build quadtree machinery.
- Grid → cube-face position → **normalize to the unit sphere** → derive lon/lat → equirect UV. The J2000 frame + winding must match `uvSphereMesh.ts:74-118` exactly (see its header lines 24-46) so the Blue Marble texture and the renderer's `flipY:true`/CCW/`cullMode:'back'` are unchanged.
- **UV seam:** the +x face straddles the equirect u=0/1 seam (lon 0 sits at its centre). Emit each face's u values in a locally-continuous range (allow u slightly <0 or >1 and rely on the sampler's `addressModeU:'repeat'`, `earthRenderer.ts:165`) so no triangle spans the whole texture width. This is essential seam geometry, not a special case to teach around.
- **Tangent** = unit local-space direction of increasing longitude (east) at each vertex; `bitangent = cross(normal, tangent)` is left for plan C. Tangents are emitted here but NOT uploaded by the renderer until plan C samples the normal map (Task 2 note).
- `indices` is `Uint32Array` (six faces at `resolution ≈ 48` exceed the 65535 `uint16` ceiling).

**Steps (TDD):**

- [x] Write `tests/utils/math/cubeSphereMesh.test.ts` (model style on `tests/utils/math/uvSphereMesh.test.ts`), asserting for a whole-face call and for the six faces assembled:
  - [x] `every position is unit length` — `Math.hypot(x,y,z) ≈ 1` for all vertices (fails if the cube→sphere normalize is dropped).
  - [x] `winding is outward-facing` — first-triangle geometric normal `·` centroid `> 0`, the same assertion as the uvSphere test (fails on inverted winding, which would cull all of Earth).
  - [x] `tangents are unit length and perpendicular to the normal` — `hypot(t) ≈ 1` and `dot(t, normalize(pos)) ≈ 0` (fails if tangents are garbage — the load-bearing contract plan C reads).
  - [x] `equirect uv matches the J2000 convention at face centres` — the +x face centre vertex is `≈ (1,0,0)` with `v ≈ 0.5`; the +z face centre is `≈ (0,0,1)` with `v ≈ 1`; the +y face centre `≈ (0,1,0)` with `u ≈ 0.25`. Hand-computed from `u=lon/2π, v=lat/π+0.5` — the same map orientation `uvSphereMesh` produces (fails if the frame or uv formula drifts from uvSphere, which would render continents rotated/mirrored).
  - [x] `no triangle spans more than half the u range` across all six faces' triangles (fails on the +x seam wrap bug — a triangle straddling u=0/1 would smear the whole texture).
- [x] Implement `cubeSphereMesh`; keep a didactic module header explaining the face→sphere map, the J2000/winding parity with `uvSphereMesh`, and the seam-continuity choice.
- [x] `npm test -- cubeSphereMesh` green; `npx tsc --noEmit` clean.
- [x] Commit (`src/@types/math/CubeSphereMesh.d.ts`, `src/utils/math/cubeSphereMesh.ts`, `tests/utils/math/cubeSphereMesh.test.ts`).

---

## Task 2: `earthRenderer` switches to the cubesphere

**Files:**

- Modify `src/services/gpu/renderers/bodies/earthRenderer.ts`

**Interfaces — Consumes:** `cubeSphereMesh` (Task 1). **Produces:** unchanged `EarthRenderer` surface (still `LitBodyUniforms` + the Lambert fragment at this task — PBR arrives in Task 8).

- Replace `uvSphereMesh(SEGMENTS, RINGS)` (`earthRenderer.ts:117`, consts lines 95-96) with the six whole faces of `cubeSphereMesh` concatenated (positions/uvs appended, indices offset per face). Add a named `CUBESPHERE_FACE_RESOLUTION` const (≈ 48 — comparable vertex budget to today's 48×24, silhouette-smooth at close range; spec §11 single fixed subdivision).
- Index buffer becomes `Uint32Array` — update the `drawIndexed` index format from `'uint16'` to `'uint32'` (`earthRenderer.ts:329`).
- **Do NOT** upload the tangent VBO yet — the mesh emits tangents, but the tangent vertex buffer + attribute + `VSOut.tangent` varying land in plan C when the normal map is sampled. Leaving them out avoids a dead varying now; plan C's diff is then purely additive.
- Positions (slot 0, stride 12) and uvs (slot 1, stride 8) upload exactly as today (`earthRenderer.ts:120-132`, pipeline buffers `250-259`) — the cubesphere reuses the two-VBO layout.
- Pick (`earthLayer.drawPick`) is untouched — it draws its own floored sphere via `bodyPickRenderer`, not this mesh.

**Steps:**

- [x] Swap the mesh source + index type; add the `CUBESPHERE_FACE_RESOLUTION` const; update the module header's "same UV sphere every body renderer uses" note to describe the cubesphere.
- [x] `npx tsc --noEmit` clean; `npm run build` clean (the `?static` WESL import must still link).
- [x] **Visual check:** ask the user to look at the already-running dev server (do not start/kill it) and confirm Earth on close approach has an **even, pole-pinch-free silhouette** — no puckering at the poles, texture continents in the same orientation as before. Note nothing else should have changed (still the plain Lambert day map).
- [x] Commit (`src/services/gpu/renderers/bodies/earthRenderer.ts`).

---

## Task 3: `camPosLocal` util — camera position in the body's local frame

**Files:**

- Create `src/utils/camera/camPosLocal.ts`
- Create `tests/utils/camera/camPosLocal.test.ts`

**Interfaces — Produces:**

```ts
// (camPosMpc − bodyPosMpc), rotated into the body's LOCAL frame by Rᵀ,
// divided by radiusMpc → camera position in UNIT-sphere local units.
export function camPosLocal(
  camPosMpc: Readonly<Vec3>,
  bodyPosMpc: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,
): Vec3;
```

- Sibling of `sunDirLocal.ts` (read its header for the `Rᵀ = R⁻¹` transpose rationale and the column-major indexing). Unlike `sunDirLocal`, this keeps **magnitude** (a position, not a direction): subtract the body centre, apply `Rᵀ` (dot with each column of `orientation`), divide by `radiusMpc`. The fragment then forms the view vector `V = normalize(camPosLocal − surfacePosLocal)`, and `surfacePosLocal` is the unit-sphere local position already forwarded as `normalLocal` (`earth/io.wesl:27-35`).
- Compute in JS doubles: `camPosMpc` and `bodyPosMpc` are both origin-relative (heliocentric) Mpc; near Earth their difference is small and resolves cleanly in f64 before narrowing — the same precision posture the `earthLayer` f64 seam documents (`earthLayer.ts:16-30`).

**Steps (TDD):**

- [x] Write the failing test with **hand-computed** expectations (independent of the implementation, not a mirror):
  - [x] `identity orientation, unit radius` — body at `[10,0,0]`, camera at `[13,0,0]`, radius `1` ⇒ `[3,0,0]` (camera 3 body-radii along +x).
  - [x] `radius scaling` — same geometry, radius `3` ⇒ `[1,0,0]`.
  - [x] `orientation rotates into the local frame` — a 90°-about-z `orientation` maps a world +x offset to local −y (or +y — assert the exact hand-derived sign for the column-major `Rᵀ` convention `sunDirLocal` uses).
- [x] Implement `camPosLocal`.
- [x] `npm test -- camPosLocal` green; `npx tsc --noEmit` clean.
- [x] Commit.

---

## Task 4: `EarthSurfaceUniforms` struct + `packEarthSurfaceUniforms`

**Files:**

- Modify `src/services/gpu/shaders/lib/sphere.wesl`
- Create `src/utils/gpu/packEarthSurfaceUniforms.ts`
- Create `tests/utils/gpu/packEarthSurfaceUniforms.test.ts`

**Interfaces — Produces:**

```wgsl
// lib/sphere.wesl — sibling of TexturedBodyUniforms (sphere.wesl:161-169), NOT an overload of LitBodyUniforms
struct EarthSurfaceUniforms {
  mvp: mat4x4<f32>,          // f32[0..15]   bytes  0..63
  sunDirLocal: vec3<f32>,    // f32[16..18]  bytes 64..75
  roughnessBase: f32,        // f32[19]      bytes 76..79   (fills sunDirLocal's vec3 tail — a REAL field, like RingUniforms.planetRadiusRatio)
  camPosLocal: vec3<f32>,    // f32[20..22]  bytes 80..91   (16-byte aligned)
  f0: f32,                   // f32[23]      bytes 92..95   (fills camPosLocal's vec3 tail)
  sunIrradiance: f32,        // f32[24]      bytes 96..99
  cloudShadowStrength: f32,  // f32[25]      bytes 100..103 (plan-D placeholder; bound + unused in A so plan D never reshapes the struct)
  _pad0: f32,                // f32[26]      bytes 104..107
  _pad1: f32,                // f32[27]      bytes 108..111 (rounds struct to 112 / 16-byte alignment)
};
```

```ts
// utils/gpu/packEarthSurfaceUniforms.ts
export const EARTH_SURFACE_UNIFORM_FLOATS = 28; // 112 bytes
export function packEarthSurfaceUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  roughnessBase: number,
  f0: number,
  sunIrradiance: number,
  cloudShadowStrength: number,
): Float32Array;
```

- **Byte layout (uniform address space):** total **112 bytes / 28 f32**, table above. Max member align is 16 (mat4/vec3); `camPosLocal` sits at the 16-aligned offset 80; the struct rounds to 112.
- The packer **reuses `packLitBodyUniforms`** (`packLitBodyUniforms.ts:38-51`) for the 80-byte lit prefix (`out.set(packLitBodyUniforms(mvp, sunDirLocal), 0)`), then **overwrites `out[19]`** with `roughnessBase` (the lit packer leaves it a zeroed pad; here it is the real field filling the vec3 tail — the same trick `packRingUniforms` uses for `planetRadiusRatio`). Then `out[20..22]=camPosLocal`, `out[23]=f0`, `out[24]=sunIrradiance`, `out[25]=cloudShadowStrength`, `out[26..27]=0`.

**Ambiguity resolved (report to user):** spec §10 lists only `{ roughnessBase/F0, sunIrradiance, cloudShadowStrength }`, but GGX specular is view-dependent and the current lit uniforms carry no camera position, so the ocean **glint** (the acceptance win) is uncomputable without a view vector. `camPosLocal` is added to close that gap; it is the one field beyond §10's literal list.

**Steps (TDD):**

- [x] Add the `EarthSurfaceUniforms` struct to `lib/sphere.wesl` with a didactic header (single-quote comments) explaining: sibling-not-overload, the reused lit prefix, `roughnessBase` filling the vec3 pad, and `cloudShadowStrength` as the plan-D seam.
- [x] Write `tests/utils/gpu/packEarthSurfaceUniforms.test.ts` — a **uniform byte-layout** test (a keep-rule category: WGSL↔TS parity, iOS-silent-drop guard). Pack distinct hand-placed values and assert:
  - [x] `out.length === EARTH_SURFACE_UNIFORM_FLOATS`.
  - [x] `out[0..15]` equals the mvp, `out[16..18]` equals `sunDirLocal`.
  - [x] `out[19] === roughnessBase` (the pad-slot override — fails if the packer leaves the lit pad zeroed).
  - [x] `out[20..22] === camPosLocal`, `out[23] === f0`, `out[24] === sunIrradiance`, `out[25] === cloudShadowStrength`.
- [x] Implement `packEarthSurfaceUniforms`.
- [x] `npm test -- packEarthSurfaceUniforms` green; `npx tsc --noEmit` clean.
- [x] Commit (`sphere.wesl`, `packEarthSurfaceUniforms.ts`, its test).

---

## Task 5: `lib/pbr.wesl` — GGX + Oren-Nayar + Fresnel

**Files:**

- Create `src/services/gpu/shaders/lib/pbr.wesl`

**Interfaces — Produces (WESL, `package::lib::pbr::*`):**

```wgsl
fn distributionGGX(NoH: f32, roughness: f32) -> f32;              // Trowbridge-Reitz D
fn geometrySmithGGX(NoV: f32, NoL: f32, roughness: f32) -> f32;  // Smith G (height-correlated or separable)
fn fresnelSchlick(cosTheta: f32, f0: f32) -> f32;                // scalar dielectric F0
fn orenNayarDiffuse(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, roughness: f32) -> f32; // diffuse factor
// Direct outgoing radiance for a unit-radiance sun (diffuse·albedo + specular, cosine-weighted by NoL).
// The fragment scales the result by sunIrradiance and adds the AMBIENT floor separately.
fn pbrDirect(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, albedo: vec3<f32>, roughness: f32, f0: f32) -> vec3<f32>;
```

- Cook-Torrance specular `D·G·F / (4·NoV·NoL)` guarded against the `NoV·NoL → 0` divide; scalar dielectric `f0 ≈ 0.02–0.04` (no metalness, no IBL). Oren-Nayar diffuse (Lambert at `roughness ≈ 0`, so airless-body reuse costs nothing — spec §5). Fresnel via `fresnelSchlick`.
- Named tunable consts local to this module: `MIN_ROUGHNESS` (clamp floor, avoids the GGX singularity) and `OCEAN_ROUGHNESS` (the smooth-water value that makes the glint tight). No adaptive machinery.
- Comments single-quoted, no backticks. This module is **not** unit-testable (WESL runs on the GPU); its correctness is verified visually via the Task 8 fragment (the ocean glint). Do NOT add a runtime-type or source-grep test for it.

**Steps:**

- [x] Write `lib/pbr.wesl` with the five functions + a didactic header (the microfacet decomposition, why dielectric-constant-F0, why Oren-Nayar over Lambert, the `AMBIENT`-is-separate note).
- [x] `npm run build` clean (the module links; no consumer yet — that is fine, it is imported in Task 8).
- [x] Commit.

---

## Task 6: LANDMINE — rewire fetch + build to iterate `(body, kind)` pairs

**Files:**

- Modify `tools/fetch/fetchTextures.ts`
- Modify `tools/textures/buildTextures.ts`
- Modify `tests/tools/fetch/fetchTextures.test.ts`
- Create `tests/tools/textures/buildTextures.test.ts` (if no build-entries test exists)

**Why (landmine):** both derivations currently hardcode `.surface` and iterate by body only. `fetchTextures.ts:127-130` (`SURFACE_SOURCES` maps `ALL_BODY_TEXTURE_KEYS → TEXTURE_SOURCES[bodyId].surface`) and `buildTextures.ts:208-228` (the body loop uses `emittedTiersForBody(id, 'surface')` at line 216 and `bodyTextureFilename(id, 'surface', tier)` at line 224). This plan adds the **first non-surface kind** (Task 7). Unless both iterate `(bodyId, kind)`, the material map **silently never fetches or builds** and Earth renders with a placeholder material forever, no error. This task rewires both **behavior-neutrally** (today every registry kind is `surface`, so the derived work lists are byte-identical) and adds a generic drift guard that goes red the moment Task 7 adds `material` if the rewire were ever reverted.

**Interfaces — Produces:**

```ts
// buildTextures.ts — extract the build's per-(body,kind) work list as a PURE, testable derivation.
export function textureBuildEntries(): readonly { bodyId: BodyTextureId; kind: TextureKind }[];
```

- **fetch rewire:** replace the by-body `.surface` map with a `(bodyId, kind)` map over `ALL_BODY_TEXTURE_KEYS`: `ALL_BODY_TEXTURE_KEYS.map(({ bodyId, kind }) => TEXTURE_SOURCES[bodyId][kind]!)`. Fold the local `SurfaceSource` alias (`fetchTextures.ts:88`) into the exported `TextureSourceEntry` (`textureSources.ts:51-55`) where it falls out — do NOT make it a separate task. A kind with no `dev` variant (material) yields `null` from `devSource` and is filtered from the `--dev` subset (correct — material is a full-pull-only source).
- **build rewire:** in the body loop (`buildTextures.ts:208-228`), iterate `Object.keys(spec.kinds)` per body instead of the fixed `'surface'`, driving `emittedTiersForBody(id, kind)` and `bodyTextureFilename(id, kind, tier)` off the loop `kind`. Dispatch the writer by kind — `surface` → the existing `writeBodyTier` (Task 7 adds the `material` branch). Keep the ring loop (`buildTextures.ts:230-242`) separate: the ring carries only `surface` and is not registry-driven (`emittedTiersForBody` indexes `BODY_TEXTURE_REGISTRY`, which has no ring row). Expose `textureBuildEntries()` as the pure list the loop consumes.

**Steps (TDD):**

- [x] Add the generic drift tests (they pass now — all-surface — and become load-bearing in Task 7):
  - [x] In `fetchTextures.test.ts`: `the full pull covers every (body,kind) native in TEXTURE_SOURCES` — for every `(bodyId, kind)` entry in `TEXTURE_SOURCES`, `rawDataPath(entry.native)` is among `textureSourcesFor(false)` dest paths. Fails if fetch iterates surface-only while a non-surface source exists.
  - [x] In `buildTextures.test.ts`: `textureBuildEntries covers every non-ring (body,kind) in TEXTURE_SOURCES` — the entry set equals the `TEXTURE_SOURCES` `(bodyId, kind)` keys minus ring ids. Fails if the build loop drops a kind.
- [x] Rewire `fetchTextures.ts` and `buildTextures.ts`; run the existing `fetchTextures.test.ts` cases (`textureSourcesFor` dev/full lists at `fetchTextures.test.ts:20-82`) — they must stay green (behavior-neutral).
- [x] `npm test -- fetchTextures buildTextures` green; `npx tsc --noEmit -p tsconfig.tools.json` clean.
- [x] Commit.

---

## Task 7: `writeLinearTier` + the material map data chain

**Files:**

- Modify `tools/utils/io/rawDataRegistry.ts` (water-mask source rows)
- Modify `tools/utils/io/textureSources.ts` (`earth.material` source row)
- Modify `src/data/bodies/bodyTextureRegistry.ts` (`earth.kinds.material`)
- Create `src/utils/scene/isLinearTextureKind.ts` + `tests/utils/scene/isLinearTextureKind.test.ts`
- Modify `src/utils/scene/bodyTextureFilename.ts` + `tests/utils/scene/bodyTextureFilename.test.ts`
- Create `tools/textures/writeLinearTier.ts` + `tests/tools/textures/writeLinearTier.test.ts`
- Modify `tools/textures/buildTextures.ts` (material build path)
- Modify `data/raw/textures/README.md` (provenance for the water mask)

**Interfaces — Produces:**

```ts
// utils/scene/isLinearTextureKind.ts — the ONE home for "is this kind linear-packed data (not sRGB colour)?"
// Read by bodyTextureFilename (ext), bodyTextureFetcher (decode), and earthRenderer.setMap (GPU format).
export function isLinearTextureKind(kind: TextureKind): boolean; // material today; plan C adds normal

// tools/textures/writeLinearTier.ts — the FIRST linear-data build output (spec §9.3).
// Resizes a prepared linear RGBA buffer to widthPx and writes a PNG with NO sRGB gamma re-encoding.
export function writeLinearTier(
  rgba: { data: Buffer; info: { width: number; height: number; channels: number } },
  widthPx: number,
  outPath: string,
): Promise<void>;
```

- **`rawDataRegistry` rows:** add `'textures.earthWaterMask'` (gitignored, `source: 'gitignored'`, `upstream` = the NASA water-mask URL, `fetcher: 'tools/fetch/fetchTextures.ts'`, `readme: 'textures.readme'`) modeled on `textures.nasaBmng` (`rawDataRegistry.ts:582-592`). **Verify the exact URL + native dimensions before writing the row** (feedback: verify-external-data-before-spec) — the fetch task confirms it live. The `.sha256` sidecar + README are already covered by the committed globs.
- **`TEXTURE_SOURCES`:** add `material: { native: 'textures.earthWaterMask' }` under the `earth` entry (`textureSources.ts:68`). No `dev` variant (full-pull-only). The `satisfies` check + Task 6 drift tests now enforce the fetch/build cover it.
- **`BODY_TEXTURE_REGISTRY.earth`:** add `material: 'medium'` to `kinds` (`bodyTextureRegistry.ts:56`) — the **4K ceiling** (spec §9.2). This one edit auto-mints the slot + `ASSET_WIRING` proximity row + fetcher URL (`bodyTextureKeys.ts:22-29`) — no wiring edit.
- **`bodyTextureFilename`:** route the extension through `isLinearTextureKind` — `png` for the ring OR a linear kind, else `jpg` (`bodyTextureFilename.ts:37`). So `bodyTextureFilename('earth','material','medium') === 'earth-material-4096.png'`. Linear packed masks must be PNG — JPEG's chroma subsampling + sRGB assumption would corrupt the packed R/G channels along coastlines.
- **build material path:** in the rewired `buildTextures` loop, the `material` kind reads the water-mask source, composes a linear RGBA where `R = roughness` (derive from the mask — ocean smooth, land rough; document the ramp) and `G = ocean mask` (1 = ocean), `B/A` spare, then writes each tier via `writeLinearTier` (NOT `writeBodyTier` — no sRGB, PNG output). `emittedTiersForBody('earth','material')` caps at `medium`.
- **`writeLinearTier`:** the generic linear-PNG primitive — resize + `.png()`, **no** `.toColourspace('srgb')` / gamma. Contrast the sRGB path in `writeBodyTier` (`buildTextures.ts:187-191`).

**Steps (TDD):**

- [x] `isLinearTextureKind` test: `material is linear`, `surface/night/clouds are not` — hand-listed, a small structural predicate (not a constant restatement — it drives three consumers' correctness).
- [x] Extend `bodyTextureFilename.test.ts`: `a linear kind uses PNG` → `bodyTextureFilename('earth','material','medium')` is `'earth-material-4096.png'` (fails if the ext ignores linear kinds → the fetcher 404s the material map). Keep the existing surface/ring cases green.
- [x] `writeLinearTier` test: `preserves raw pixel values (no sRGB gamma applied)` — feed a tiny known linear RGBA buffer, write at same width, read the PNG back to raw, assert the bytes round-trip unchanged (fails if a gamma/sRGB transform sneaks in — a real property, not a mirror).
- [x] Add the registry/source/kinds rows; implement `isLinearTextureKind`, `writeLinearTier`, and the build material path.
- [x] `npm test -- isLinearTextureKind bodyTextureFilename writeLinearTier buildTextures fetchTextures textureSources` green (the Task 6 drift tests now exercise `material`). `npx tsc --noEmit` + `npx tsc --noEmit -p tsconfig.tools.json` clean.
- [x] Commit (stage each path explicitly).

---

## Task 8: PBR surface fragment + material binding + `EarthSurfaceUniforms` draw path

**Files:**

- Modify `src/services/gpu/shaders/bodies/earth/fragment.wesl`
- Modify `src/services/gpu/shaders/bodies/earth/vertex.wesl`
- Modify `src/services/gpu/renderers/bodies/earthRenderer.ts`
- Modify `src/@types/rendering/EarthRenderer.d.ts`
- Modify `src/services/loading/fetchers/bodyTextureFetcher.ts`
- Create `src/data/bodies/earthSurfaceParams.ts`
- Modify `src/services/engine/frame/passes/earthLayer.ts`

**Interfaces — Consumes:** `EarthSurfaceUniforms` + `packEarthSurfaceUniforms` (Task 4), `pbrDirect` & friends (Task 5), `camPosLocal` (Task 3), `isLinearTextureKind` (Task 7). **Produces:** the new `EARTH_SURFACE_PARAMS` tunables and the updated `EarthRenderer.draw` uniform contract (length-28 `Float32Array`).

```ts
// src/data/bodies/earthSurfaceParams.ts — named tunable constants (spec §11), one object home
export const EARTH_SURFACE_PARAMS: {
  readonly roughnessBase: number; // global land micro-roughness multiplier
  readonly f0: number; // dielectric F0, 0.02–0.04
  readonly sunIrradiance: number; // sun brightness scale into the HDR target
  readonly cloudShadowStrength: number; // 0 in plan A (plan D sets it)
};
```

- **`earthRenderer` uniform + bindings:** `UNIFORM_BUFFER_SIZE` becomes **112** (`earthRenderer.ts:102`). Bind group layout grows a binding **3** for the material texture (fragment, `sampleType: 'float'`), added to the layout (`earthRenderer.ts:196-215`) and `buildBindGroup` (`earthRenderer.ts:219-229`). Create a **1×1 linear placeholder** material texture at construction (`rgba8unorm`, e.g. `R=255,G=0,B=0,A=255` → `roughness = roughnessBase`, ocean mask 0 = no glint) so the fragment always samples a real texture, mirroring the surface placeholder (`earthRenderer.ts:169-189`). Bind the new `pbr`-composing fragment + the material-aware vertex.
- **`setMap` real material case:** replace the `if (kind !== 'surface') return` inert branch (`earthRenderer.ts:290`) with a `material` case: create a fresh texture sized to the bitmap with format chosen by `isLinearTextureKind(kind)` — `rgba8unorm` (LINEAR) for material, `rgba8unorm-srgb` for surface — upload, generate mips, rebuild the bind group. Keep `night`/`clouds`/`normal` inert (plans B/C/D). Update the `EarthRenderer.d.ts` `setMap` doc (`EarthRenderer.d.ts:31-41`) and `draw` doc (line 48: uniforms now length-28 / 112 bytes).
- **`bodyTextureFetcher` linear decode:** for a linear kind, decode the bitmap without colour management — `createImageBitmap(blob, { colorSpaceConversion: 'none' })` (`bodyTextureFetcher.ts:35`) so the packed R/G channels are not gamma-shifted. Branch on `isLinearTextureKind(req.kind)` — the same predicate that chose PNG + the GPU format, keeping the sRGB-vs-linear distinction in one home.
- **fragment (`earth/fragment.wesl`) — composition (spec §5; contract, not a body):**
  - sample surface `albedo = textureSample(surface).rgb` (sRGB texture → linear on read, unchanged);
  - sample material `mat = textureSample(material, uv).rg` (LINEAR texture, binding 3): `mat.r = roughness`, `mat.g = oceanMask`;
  - `n = normalize(in.normalLocal)`; `v = normalize(u.camPosLocal - in.normalLocal)`; `l = u.sunDirLocal`;
  - `roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), OCEAN_ROUGHNESS, mat.g)`;
  - `direct = pbrDirect(n, v, l, albedo, roughness, u.f0)`;
  - `colour = direct * u.sunIrradiance + AMBIENT * albedo` (import `AMBIENT` from `lib/bodyLighting.wesl`);
  - `u.cloudShadowStrength` is bound but unused in A (plan D multiplies `direct` by the cloud-shadow term);
  - return `vec4(colour, 1.0)`. Replace the `litShade` import/use (`earth/fragment.wesl:62,78`) with `pbr` + `AMBIENT`. Update bindings decl (add binding 3, `earth/fragment.wesl:64-66`) and the uniform type to `EarthSurfaceUniforms`.
- **vertex (`earth/vertex.wesl`):** switch the bound uniform type to `EarthSurfaceUniforms` (`earth/vertex.wesl:33,36`); `VSOut` (`earth/io.wesl:27-35`) is unchanged (the fragment reuses `normalLocal` as both normal and surface position for `V`). No tangent varying yet (plan C).
- **`earthLayer.draw`:** replace `packLitBodyUniforms(mvp, sun)` (`earthLayer.ts:120`) with `packEarthSurfaceUniforms(mvp, sun, camLocal, …EARTH_SURFACE_PARAMS)`, where `camLocal = camPosLocal(view.camPos, earth.positionMpc, earth.radiusKm * SCALE_UNITS.KM_TO_MPC, earth.orientation)`. `view.camPos` is the slab-appropriate origin-relative camera position (`SlabView.d.ts:29`); Earth's `positionMpc` is likewise origin-relative — matching frames.

**Steps:**

- [x] Add `EARTH_SURFACE_PARAMS`; wire the renderer (uniform size, binding 3, placeholder material, `setMap` material case), the fetcher linear-decode branch, both shaders, and `earthLayer`.
- [x] `npx tsc --noEmit` clean; `npm run build` clean (the WESL links — watch for the iOS-strict traps: no `texture_1d`, valid struct layout; use `createShaderModuleWithDevLog` output if it fails).
- [x] **Visual check (placeholder material, before Task 9 data):** ask the user to confirm Earth still renders lit — a plausible surface with the day map, no crash, terminator intact. No glint yet (material is the all-land placeholder).
- [x] Commit (stage each path explicitly).

---

## Task 9: Fetch + build the material map, then verify the glint

**Files:** none (data + verification). Produces `data/raw/textures/<water-mask>` (gitignored) and `public/data/images/textures/earth-material-{2048,4096}.png` (gitignored build artefacts).

- [x] **Announce the download** (announce-big-downloads): tell the user the NASA water-mask source is ~10–20 MB, state the exact URL + size confirmed against `textures.earthWaterMask`, and **get explicit go-ahead before fetching**. Do not fetch otherwise.
- [x] On go-ahead, fetch the water mask (`npm run fetch-textures -- --confirm`, or a targeted single-source fetch) — it lands via `downloadGetOnly` into `data/raw/textures/` and upserts its `textures.sha256` line.
- [x] Build the material tiers: `npm run build-textures` emits `earth-material-4096.png` (+ `-2048`) into `public/data/images/textures/` via the Task 7 material path. Confirm the files exist and are PNG.
- [x] **Visual check (the acceptance win):** ask the user to fly close to Earth on the running dev server and confirm a tight, bright **ocean glint** tracking the sun's sub-solar point, with land reading rougher/matte and no glint — the primary realism win (spec §12 row A). Confirm the material loaded (network tab shows `earth-material-4096.png`, not a 404 to the placeholder).
- [x] No commit (all artefacts gitignored). Note for the merge: R2 sync of the new `earth-material-*.png` is a post-merge deploy step (spec §9.3 — the dir glob sweeps it automatically), not part of this PR.

---

## Task 10: entanglement-radar review pass

**Files:** none (review).

- [x] Run the `entanglement-radar` skill over the whole branch diff (house convention). Pay attention to: the `isLinearTextureKind` predicate genuinely being the single home for the sRGB-vs-linear distinction (filename ext + fetch decode + GPU format — no fourth site); the `(body, kind)` fetch/build derivations not re-splitting into surface-vs-material special cases; the cubesphere seam handling being essential geometry, not an accidental branch. Name any knot precisely and fix or file it before the final review.
- [x] Address findings (or record why deferred); keep the suite green.

---

## Task 11: Final review + verification

**Files:** none.

- [x] Run `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [x] Request code review (`superpowers:requesting-code-review`) covering the byte-layout parity (`EarthSurfaceUniforms` ↔ `packEarthSurfaceUniforms`), the landmine rewire drift tests, and the linear-material path.
- [x] Confirm the DoD before marking the plan done (`/feature-done`), which sweeps the backlog + relocates spec/plan on merge.

---

## Interfaces produced for later plans

Plans B/C/D/E are drafted against these exact shapes.

**`EarthSurfaceUniforms`** (`lib/sphere.wesl`) — 112 bytes / 28 f32:

| f32 idx | bytes    | field                      | notes                                                                                              |
| ------- | -------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| 0..15   | 0..63    | `mvp: mat4x4<f32>`         | column-major                                                                                       |
| 16..18  | 64..75   | `sunDirLocal: vec3<f32>`   | body-local sun dir                                                                                 |
| 19      | 76..79   | `roughnessBase: f32`       | fills the vec3 tail (real field)                                                                   |
| 20..22  | 80..91   | `camPosLocal: vec3<f32>`   | camera in unit-sphere local frame                                                                  |
| 23      | 92..95   | `f0: f32`                  | dielectric F0 (fills vec3 tail)                                                                    |
| 24      | 96..99   | `sunIrradiance: f32`       | sun brightness scale                                                                               |
| 25      | 100..103 | `cloudShadowStrength: f32` | A reserves (packs `0`); **plan D** activates it (non-zero from `EARTH_SURFACE_PARAMS`)             |
| 26      | 104..107 | `_pad0: f32`               | **plan D** renames → `cloudShellRadius` + adds the packer's 8th arg; **B and C claim NO pad slot** |
| 27      | 108..111 | `_pad1: f32`               | stays free after all A–E plans land (rounds struct to 112 / 16-byte)                               |

Packer: `packEarthSurfaceUniforms(mvp, sunDirLocal, camPosLocal, roughnessBase, f0, sunIrradiance, cloudShadowStrength) → Float32Array(28)`; `EARTH_SURFACE_UNIFORM_FLOATS = 28`. Reuses `packLitBodyUniforms` for the 80-byte lit prefix, then overwrites `out[19]` with `roughnessBase`.

**Pad ledger (canonical — the final resting state of the two reserved tail slots after all A–E plans land):**

- `[25] cloudShadowStrength` — A reserves + packs `0`; **plan D** sets it non-zero from `EARTH_SURFACE_PARAMS.cloudShadowStrength`.
- `[26] _pad0 → cloudShellRadius` — **plan D** renames the pad to a real field (the cloud shell's unit-sphere local radius) and extends `packEarthSurfaceUniforms` with an 8th arg `cloudShellRadius` (writes `out[26]`). The struct does NOT reshape — still 112 B / 28 f32, `EARTH_SURFACE_UNIFORM_FLOATS = 28`.
- `[27] _pad1` — remains free. Plan B claims no slot (night factor derives from the sun term; brightness is a WESL const); plan C claims no slot (exaggeration is baked offline, no runtime normal-scale scalar).

**Final earth surface fragment bindings** (`earth/fragment.wesl` + `earthRenderer` BGL) — the authoritative slot map for the whole photoreal-Earth feature. Bindings 0–2 ship today; each later plan appends the NEXT free slot in serial-execution order (A → B → C → D), so no two plans collide. **B/C/D MUST use exactly the slot listed here — do not renumber:**

| binding | resource                         | stage             | added by                      |
| ------- | -------------------------------- | ----------------- | ----------------------------- |
| 0       | `EarthSurfaceUniforms` (uniform) | VERTEX + FRAGMENT | **A** (was `LitBodyUniforms`) |
| 1       | `earthSampler`                   | FRAGMENT          | existing                      |
| 2       | surface (day/albedo) texture     | FRAGMENT          | existing                      |
| 3       | material texture                 | FRAGMENT          | **A** (Task 8)                |
| 4       | night texture                    | FRAGMENT          | **B**                         |
| 5       | normal texture                   | FRAGMENT          | **C**                         |
| 6       | cloud texture                    | FRAGMENT          | **D**                         |

The cloud **shell**'s own pipeline (plan D `cloudShellRenderer`) has a SEPARATE bind-group layout (0 = `CloudShellUniforms`, 1 = sampler, 2 = cloud texture) — the shared surface-pipeline map above is only for D's surface-side shadow + night-occlusion samples.

**Filename extension rule** (the single `bodyTextureFilename` home, as it reads after all plans land): `ext = png` when the body is the ring OR `isLinearTextureKind(kind)` OR `isAlphaTextureKind(kind)`; else `jpg`. Plan A implements the ring-OR-linear portion (`isLinearTextureKind`, this plan — Task 7); **plan D adds the `isAlphaTextureKind` term** (clouds — sRGB but alpha-bearing → PNG). The two predicates are orthogonal axes (linear = data precision; alpha = channel count) and each independently forces PNG — do NOT fold them into one predicate. B/C/D reference this rule rather than restating an extension branch.

**`cubeSphereMesh`** (`utils/math/cubeSphereMesh.ts`):
`cubeSphereMesh(face: number, level: number, tileX: number, tileY: number, resolution: number): CubeSphereMesh` where `CubeSphereMesh = { positions: Float32Array/*3*/, uvs: Float32Array/*2, equirect*/, indices: Uint32Array/*CCW outward*/, tangents: Float32Array/*3, unit +u east*/ }`. Level 0 = whole face; `(face, level, tileX, tileY)` is the quadtree address a future terrain LOD subdivides. **Tangents are already emitted** — plan C uploads the tangent VBO + adds a `VSOut.tangent` varying + samples the tangent-space normal map; it does NOT touch the mesh.

**`pbr.wesl`** (`shaders/lib/pbr.wesl`, `package::lib::pbr::*`):
`distributionGGX(NoH, roughness) -> f32`; `geometrySmithGGX(NoV, NoL, roughness) -> f32`; `fresnelSchlick(cosTheta, f0) -> f32`; `orenNayarDiffuse(n, v, l, roughness) -> f32`; `pbrDirect(n, v, l, albedo, roughness, f0) -> vec3<f32>` (direct outgoing radiance for a unit-radiance sun; caller scales by `sunIrradiance` and adds `AMBIENT`). Local consts `MIN_ROUGHNESS`, `OCEAN_ROUGHNESS`.

**Material `(earth, 'material')` wiring shape** (the pattern plans B/D reuse for `night` / `clouds`):

- `BODY_TEXTURE_REGISTRY.earth.kinds.material = 'medium'` (4K ceiling) → auto-mints slot + `ASSET_WIRING` proximity row + fetcher URL via `ALL_BODY_TEXTURE_KEYS`.
- `TEXTURE_SOURCES.earth.material = { native: 'textures.earthWaterMask' }` (no `dev` variant).
- On-disk name `earth-material-<px>.png` via `bodyTextureFilename` (linear kinds → PNG through `isLinearTextureKind`).
- `isLinearTextureKind(kind)` is the single home for the sRGB-vs-linear axis: PNG ext, `createImageBitmap … colorSpaceConversion:'none'` decode, and `rgba8unorm` (not `-srgb`) GPU format. **Plan C adds `'normal'` to it** (the second linear kind) — do not add a parallel predicate.
- Commit dispatch is unchanged: `commitBodyTexture` routes every Earth kind to `earthRenderer.setMap(kind, bitmap)` (`bodyTextureSlotRegistry.ts:86-91`); plan D adds the `clouds → cloudShellRenderer` branch there.
- `writeLinearTier(rgba, widthPx, outPath)` is the linear-PNG build primitive; **plan C adds `bakeNormalMap`** as the derived-output sibling on top of it.
