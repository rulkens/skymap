# Photoreal Earth D — Cloud Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a **translucent cloud shell** above Earth's surface — a body-agnostic shell renderer drawing its own cloud+alpha map, `blend:'over'`, depth-tested/no-depth-write (modeled on `ringsLayer`) — plus the surface-side coupling that makes it read as physical: a **soft ground shadow** (the surface fragment samples cloud alpha along `sunDirLocal` and darkens the direct sun term) and **night-light occlusion** (city lights dim under cloud). The acceptance win is **clouds + soft ground shadows, with city lights dimmed under cloud** (spec §12 row D).

**Architecture:** The shell is the second of the three-layer shell design (spec §3): a body-agnostic renderer (`cloudShellRenderer`, sibling of `ringRenderer`) parameterized by its own `CloudShellUniforms`, invoked via a `cloudShellLayer` `CONTENT_LAYERS` row inserted **after `earthLayer`, before** plan E's `atmosphereShellLayer` (which draws last). The one accepted non-independence (spec §7.3): the single cloud map is bound in **both** the shell pipeline (its own copy, for the shell render) **and** the surface pipeline (for the shadow + occlusion samples). A single `(earth,'clouds')` bitmap fans to two resident consumers at the **existing** `commitBodyTexture` seam — the same one-asset-two-consumers shape the Saturn-ring commit already uses (`bodyTextureSlotRegistry.ts:95-101`), so the single-dispatch seam is **not** forked. The clouds map rides plan A's `(body,kind)` texture family + single `TEXTURE_SOURCES` table; the fetch/build `(bodyId,kind)` iteration is already rewired (plan A LANDMINE) — D adds a source row only.

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders, `sharp`/libvips for the offline texture build, Vitest.

**Spec:** docs/superpowers/specs/2026-07-18-photoreal-earth-design.md (§7, §9)

**Depends on:** plan A (`docs/superpowers/plans/2026-07-19-photoreal-earth-a-cubesphere-pbr-surface.md`) — `EarthSurfaceUniforms` (D activates the reserved `cloudShadowStrength` [f32 25] and claims the reserved `_pad0` [f32 26]), the `CONTENT_LAYERS`/shell pattern (`ringsLayer` + `ringRenderer`), the sibling-uniform-struct pattern in `lib/sphere.wesl`, the `(body,kind)` material-wiring pattern, and `EARTH_SURFACE_PARAMS`. plan B (`docs/superpowers/plans/2026-07-19-photoreal-earth-b-night-lights.md`) — the `nightLights(nightColour, NoL, cloudAlpha)` seam (D fills `cloudAlpha`, changing the argument value only, no signature change). **All line citations below assume plans A + B have landed**; where they shift a line, read the current file — do not trust a stale offset.

### Header notes — resolved decisions (do not re-litigate)

- **The intersection helper is a pure TS util, unit-tested; the WESL shadow reuses `lib/util.wesl::raySphere`.** WESL runs on the GPU and is not unit-testable (plans A/B state this for `pbr.wesl`/`nightLights.wesl`). The analytic ray→shell-sphere solve is therefore authored **once as a tested TS reference** (`raySphereRoots`, Task 1) that locks the quadratic (hit/miss/tangent/inside), and the surface fragment's per-pixel shadow reuses the **existing** `lib/util.wesl::raySphere` primitive (its second consumer — this is exactly the graduation trigger `util.wesl:27-33` names; graduating it to `lib/raycast.wesl` is OPTIONAL and deferred, do not pre-emptively move it). The TS↔WESL pair co-encodes the same quadratic — the same accepted mirror posture as `packLitBodyUniforms`↔`LitBodyUniforms`. **Plan E's atmosphere march-bound reuses `raySphereRoots` too** (this is why it is a shared util, not inlined). Flag the mirror in the entanglement-radar pass (Task 9).
- **`cloudShadowStrength` is plan A's reserved `EarthSurfaceUniforms[25]`, sourced from `EARTH_SURFACE_PARAMS`.** Plan A shipped it as `0`; D sets `EARTH_SURFACE_PARAMS.cloudShadowStrength` to a non-zero named tunable (Task 7). No new settings field — the simplest source is the existing tunable object (spec §11: named tunable constants).
- **The cloud-shell radius is threaded through the reserved `EarthSurfaceUniforms[26]` (`_pad0`), NOT duplicated.** The shell's radius (unit-sphere local units) drives BOTH the shell's CPU scale (`composeBodyMvp` radius in `cloudShellLayer`) AND the surface fragment's shadow intersection. To keep ONE runtime home, `CLOUD_SHELL_PARAMS.radiusRatio` (TS const) feeds both: `cloudShellLayer` scales by it, and `earthLayer` packs it into `EarthSurfaceUniforms[26]` so the shadow fragment intersects the correct shell sphere. This claims plan A's reserved `_pad0` slot exactly as A anticipated ("`_pad0`/`_pad1` … free for plan C's normal-scale or plan D's cloud fields") — **the 112-byte / 28-f32 struct does NOT reshape** (the win A engineered). This extends plan A's `packEarthSurfaceUniforms` signature by one arg (reported below).
- **Clouds are sRGB colour + alpha → PNG, but NOT linear.** Do NOT add `'clouds'` to plan A's `isLinearTextureKind` (that would force `colorSpaceConversion:'none'` + `rgba8unorm` and mis-decode the colour). Clouds ride the sRGB decode + `rgba8unorm-srgb` format like `surface`/`night`; only the **filename extension** differs (PNG, for the alpha channel a JPG cannot hold). The PNG axis is "needs alpha", a NEW predicate (`isAlphaTextureKind`, Task 5), parallel to `isLinearTextureKind`.
- **Alpha is derived from luminance at BUILD time.** The NASA cloud composite is a white-on-black coverage image with no alpha channel; the build step (`writeCloudTier`, Task 5) sets `alpha = luminance` (white cloud → opaque, black gap → transparent) and keeps the RGB as the cloud colour. State it there, not at runtime.
- **Live-provider seam (spec §7.4) — DESIGNED, NOT BUILT.** The cloud map lands through the same async `setTexture(bitmap)` / `setMap('clouds', …)` seam every body texture uses, so a future **NASA GIBS** WMTS EPSG:4326 (equirectangular, CORS-enabled) fetch swaps the _source_ behind the same seam with zero renderer rework. Physically-correct live clouds also need wall-clock Earth rotation + terminator (absent today — skymap has no clock, so the shell is **static, no drift**), so "live Earth" is a coherent future bundle, not half-built here. **No task** — the seam already exists by construction; this is a note only.

## Global Constraints

Binding values copied from the spec; every task inherits them.

- **Shell pipeline (spec §7.1, modeled on `ringRenderer`):** `blend:'over'` straight-alpha, `depthCompare:'less'` with `depthWriteEnabled:false` (depth-TESTED against the opaque Earth surface so the far cloud hemisphere is occluded, writes NO depth), `('rgba16float','depth32float')` `foreground:0` formats. Two-sided is NOT wanted here (unlike the ring) — the shell is a closed sphere; `frontFace:'ccw'` + `cullMode:'back'` like `earthRenderer` (`earthRenderer.ts:272-276`). Explicit bind-group layout (not `'auto'`) so the texture swap rebuilds against a stable layout (`feedback_webgpu_auto_layout_trap`).
- **Static, no drift (spec §7.1/§7.4):** the shell does not rotate or animate — skymap has no clock. No time uniform, no per-frame texture offset.
- **Ground shadow (spec §7.2):** for a day-side surface fragment, analytic ray→cloud-shell-sphere intersection along `sunDirLocal` from the surface point, sample cloud alpha at the crossing UV, darken the direct sun term by `(1 − cloudAlpha·cloudShadowStrength)`. Self-limits at the terminator (multiplies the ~0 sun term). The surface point is ALWAYS inside the shell (`|P|=1 < radiusRatio`), so the exit root is always real + positive — no miss branch on the shadow ray.
- **Night occlusion (spec §6/§7.3):** the night contribution is multiplied by `(1 − cloudAlpha)` sampled at the fragment's OWN uv, via plan B's `nightLights(nightColour, NoL, cloudAlpha)` — D replaces B's `0.0` with the real sample.
- **The accepted coupling (spec §7.3):** the cloud map is a shared input bound in BOTH the surface and shell pipelines; the surface fragment takes TWO samples (along-sun for shadow, own-uv for occlusion). This is the ONE place the layers are not perfectly independent. Earth-specific + data-gated (Venus reuses the shell but sets `cloudShadowStrength = 0` — its surface is never seen). Accepted for the realism payoff (grill Q6c).
- **Texture data (spec §9.1/§9.2):** clouds are **sRGB + α**, **8K** (`kinds.clouds = 'large'`), **PNG** (alpha). Alpha derived from luminance at build.
- **Named tunables (spec §11):** the shell radius ratio + opacity (`CLOUD_SHELL_PARAMS`), the surface `cloudShadowStrength` (`EARTH_SURFACE_PARAMS`), and any shell shading curve consts are **named tunable constants** — NO adaptive-quality machinery.
- **Draw order (spec §7.1):** `cloudShellLayer` is inserted into `CONTENT_LAYERS` **after `earthLayer`, before** plan E's `atmosphereShellLayer` (which draws last in the `foreground:0` group).
- **Downloads (spec §9.4):** the NASA cloud-composite fetch (~10–20 MB) announces its size + exact URL and **gets user go-ahead BEFORE fetching** (announce-big-downloads). Verify the exact upstream URL + native dimensions live before writing the registry row (verify-external-data-before-spec). Nothing downloads except in the explicit fetch task (Task 8).
- **iOS safety:** an invalid shell shader silently drops the WHOLE frame — all foreground passes share one command encoder, so a bad `cloudShell` pipeline makes `queue.submit()` drop the frame with no thrown error (navigation moves, nothing presents). `createShaderModuleWithDevLog` (used by `ringRenderer.ts:158-159`) prints the real `getCompilationInfo()` error + line. Verify on iOS after Tasks 3/4/7.
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `src/@types/` (filename = export name); deep relative imports, no barrels; didactic multi-paragraph module headers; WESL comments use single quotes (NO backticks), WESL imports use literal `package::` paths, meticulous WGSL (verify visually); wgpu-matrix (`vec3`/`mat4`) + `Vec2`/`Vec3` aliases never raw tuples; bake per-instance data into the vertex buffer, not a per-draw-mutated uniform (writeBuffer/submit ordering trap — Earth/the shell each draw once/frame, so a single uniform buffer is safe by construction); WebGPU `'auto'` layouts don't cross pipelines — share buffers, per-pipeline bind groups; raw-data paths via `rawDataPath('<key>')`; stage specific paths on commit (never `git add -A`). No TS file moves are expected in this plan.

---

## Task 1: `raySphereRoots` — analytic ray↔sphere intersection (TS, unit-tested)

**Files:**

- Create `src/utils/math/raySphereRoots.ts`
- Create `tests/utils/math/raySphereRoots.test.ts`

**Interfaces — Produces:**

```ts
// The two roots (tNear ≤ tFar) of |ro + t·rd − center|² = radius², or null on a miss.
// rd is assumed unit-length (caller renormalizes). Mirrors the WESL primitive
// `lib/util.wesl::raySphere` (util.wesl:134) — the analytic reference the cloud-shadow
// fragment's shadow ray and plan E's atmosphere march-bound both rely on.
export function raySphereRoots(
  ro: Readonly<Vec3>,
  rd: Readonly<Vec3>,
  center: Readonly<Vec3>,
  radius: number,
): Vec2 | null;
```

- Standard formulation (identical to `raySphere`, `util.wesl:125-142`): `m = ro − center`, `b = dot(m, rd)`, `c = dot(m,m) − r²`; `discr = b² − c`; roots `−b ± sqrt(discr)`. Return `null` when `discr < 0` (miss). An origin INSIDE the sphere yields `tNear < 0 < tFar` (the shadow ray's case — the surface point is inside the cloud shell); an origin OUTSIDE with the sphere behind yields both roots negative (still a "hit" mathematically — callers test the sign they need, as the WESL sentinel note documents). `Vec2`/`Vec3` are the wgpu-matrix aliases (`@types/math/Vec2`, `Vec3`).
- This is the **genuinely unit-testable** piece of plan D (the rest is GPU/visual). It is the CPU-checkable source of truth for the quadratic the WESL fragment mirrors; do NOT also add a runtime-type test for the WESL side.

**Steps (TDD):**

- [x] Write `tests/utils/math/raySphereRoots.test.ts` with **hand-computed** expectations:
  - [x] `hit from outside returns both crossings` — ray from `[−3,0,0]` along `+x` at unit sphere at origin ⇒ `[2, 4]`.
  - [x] `origin inside returns a straddling interval` — ray from origin along `+x`, radius `2` ⇒ `tNear = −2`, `tFar = 2` (the shadow-ray case: `tFar > 0` is the crossing toward the sun).
  - [x] `surface point along the sun hits the shell` — ro `[1,0,0]` (on the unit sphere), rd `+x`, sphere radius `1.01` ⇒ `tFar ≈ 0.01` (fails if the shell radius or the exit-root pick is wrong — the shadow's core geometry).
  - [x] `tangent returns a double root` — ray grazing the sphere (discr ≈ 0) ⇒ `tNear ≈ tFar` (fails if the discriminant sign handling drops the tangent case).
  - [x] `miss returns null` — ray pointing away from / past a sphere it never reaches ⇒ `null` (fails if `discr < 0` is not guarded).
- [x] Implement `raySphereRoots`; didactic header citing the WESL twin (`util.wesl:116-143`) and the accepted TS↔WESL mirror.
- [x] `npm test -- raySphereRoots` green; `npx tsc --noEmit` clean.
- [x] Commit.

---

## Task 2: `CloudShellUniforms` + `packCloudShellUniforms`; thread the shell radius through `EarthSurfaceUniforms`

**Files:**

- Modify `src/services/gpu/shaders/lib/sphere.wesl` (add `CloudShellUniforms`; rename `EarthSurfaceUniforms._pad0` → `cloudShellRadius`)
- Create `src/utils/gpu/packCloudShellUniforms.ts`
- Create `tests/utils/gpu/packCloudShellUniforms.test.ts`
- Modify `src/utils/gpu/packEarthSurfaceUniforms.ts` (+ 8th arg `cloudShellRadius`)
- Modify `tests/utils/gpu/packEarthSurfaceUniforms.test.ts`

**Interfaces — Consumes:** plan A's `packLitBodyUniforms` (80-byte lit prefix) + `EarthSurfaceUniforms` (112 B / 28 f32). **Produces:** `CloudShellUniforms` + its packer, and the `cloudShellRadius`-aware `packEarthSurfaceUniforms`.

```wgsl
// lib/sphere.wesl — sibling of RingUniforms / TexturedBodyUniforms, NOT an overload of LitBodyUniforms.
// A body-agnostic translucent shell lit by the same sunDirLocal, with a per-shell coverage-to-alpha
// opacity multiplier filling the vec3 tail (a REAL field, like RingUniforms.planetRadiusRatio) — the
// same "every sibling adds a real field beyond the lit prefix" pattern the other structs follow.
struct CloudShellUniforms {
  mvp: mat4x4<f32>,        // f32[0..15]  bytes  0..63
  sunDirLocal: vec3<f32>,  // f32[16..18] bytes 64..75
  cloudOpacity: f32,       // f32[19]     bytes 76..79  (fills the vec3 tail — real field)
};
```

```ts
// utils/gpu/packCloudShellUniforms.ts
export const CLOUD_SHELL_UNIFORM_FLOATS = 20; // 80 bytes
export function packCloudShellUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  cloudOpacity: number,
): Float32Array;
```

- **`CloudShellUniforms` = 80 bytes / 20 f32.** `packCloudShellUniforms` reuses `packLitBodyUniforms(mvp, sunDirLocal)` for the 80-byte prefix, then overwrites `out[19]` with `cloudOpacity` (the pad-slot-becomes-real-field trick, `packRingUniforms`'s `planetRadiusRatio` at `sphere.wesl:199`). `cloudOpacity` is sourced from `CLOUD_SHELL_PARAMS.opacity` (Task 4).
- **`EarthSurfaceUniforms[26]` `_pad0` → `cloudShellRadius`** (unit-sphere local radius of the cloud shell = `CLOUD_SHELL_PARAMS.radiusRatio`; the shadow fragment intersects this shell). Struct size UNCHANGED (112 B / 28 f32) — this claims the slot plan A reserved. `packEarthSurfaceUniforms` gains an **8th arg** `cloudShellRadius`, written to `out[26]`; `out[27]` (`_pad1`) stays 0 (remains free — plan C bakes its exaggeration offline and claims no slot). `EARTH_SURFACE_UNIFORM_FLOATS` stays `28`. Update plan A's byte-layout note in `sphere.wesl`.

**Steps (TDD):**

- [x] Add `CloudShellUniforms` to `lib/sphere.wesl` with a didactic byte-layout header (sibling-not-overload; the reused lit prefix; `cloudOpacity` filling the vec3 tail); rename `EarthSurfaceUniforms._pad0` → `cloudShellRadius` and update that struct's byte table + plan-A note.
- [x] Write `tests/utils/gpu/packCloudShellUniforms.test.ts` — byte-layout parity (WGSL↔TS, iOS-silent-drop guard): `out.length === CLOUD_SHELL_UNIFORM_FLOATS`; `out[0..15] === mvp`; `out[16..18] === sunDirLocal`; `out[19] === cloudOpacity` (fails if the packer leaves the lit pad zeroed).
- [x] Extend `tests/utils/gpu/packEarthSurfaceUniforms.test.ts`: add `out[26] === cloudShellRadius` (fails if the 8th arg is dropped); keep every existing assertion green.
- [x] Implement both packers.
- [x] `npm test -- packCloudShellUniforms packEarthSurfaceUniforms` green; `npx tsc --noEmit` clean.
- [x] Commit (`sphere.wesl`, both packers, both tests).

---

## Task 3: `cloudShellRenderer` + `cloudShell/*` shaders

**Files:**

- Create `src/services/gpu/renderers/bodies/cloudShellRenderer.ts`
- Create `src/@types/rendering/CloudShellRenderer.d.ts`
- Create `src/services/gpu/shaders/bodies/cloudShell/io.wesl`
- Create `src/services/gpu/shaders/bodies/cloudShell/vertex.wesl`
- Create `src/services/gpu/shaders/bodies/cloudShell/fragment.wesl`

**Interfaces — Consumes:** `CloudShellUniforms` + `packCloudShellUniforms` (Task 2), `litShade` (`lib/bodyLighting.wesl:36`), `clip_from_local` (`sphere.wesl:231`). **Produces:**

```ts
// @types/rendering/CloudShellRenderer.d.ts
export type CloudShellRenderer = Renderer & {
  setTexture(bitmap: ImageBitmap): void; // the cloud colour+alpha map (own copy)
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void; // length-20 CloudShellUniforms record
};

// cloudShellRenderer.ts
export function createCloudShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): CloudShellRenderer;
```

- **Model on `ringRenderer.ts` end-to-end** (uniform buffer, explicit BGL, `setTexture` swap + rebuild-bind-group, single-draw uniform write, `createShaderModuleWithDevLog`), with these differences:
  - Geometry: `uvSphereMesh(SEGMENTS, RINGS)` (a closed sphere, not the ring disc) — reuse `earthRenderer`'s mesh constants (`earthRenderer.ts:95-96`). Positions (slot 0, stride 12) + uvs (slot 1, stride 8), like `earthRenderer.ts:120-132`. The shell is body-agnostic; `uvSphereMesh` (not the cubesphere) is correct — poles sit under cloud/atmosphere and the shell is translucent.
  - Uniform buffer size `80` (`CLOUD_SHELL_UNIFORM_FLOATS × 4`).
  - Pipeline: straight-alpha OVER blend (copy `ringRenderer.ts:184-196`), `depthWriteEnabled:false` + `depthCompare:'less'` (`ringRenderer.ts:205-211`), but `frontFace:'ccw'` + `cullMode:'back'` (a closed sphere, NOT two-sided — contrast the ring's `cullMode:'none'`).
  - Placeholder: 1×1 **transparent** `rgba8unorm-srgb` `[0,0,0,0]` (`ringRenderer.ts:110-125`) so the shell draws nothing (alpha 0) until the map lands.
  - `setTexture`: fresh `rgba8unorm-srgb` sized to the bitmap, `copyExternalImageToTexture({ source, flipY: true }, …)` (clouds are equirectangular, same v-orientation as the surface — `earthRenderer.ts:309`), `generateMipChain`, rebuild bind group. Sampler: `repeat` u / `clamp-to-edge` v / trilinear (copy `earthRenderer.ts:160-167`).
  - Binding layout: 0 = `CloudShellUniforms` (VERTEX mvp + FRAGMENT sunDirLocal/opacity), 1 = sampler, 2 = cloud texture.
- **Shaders (contract, not bodies):**
  - `cloudShell/io.wesl` — `VSOut { @builtin(position) clip, @location(0) uv, @location(1) normalLocal }` (same shape as `earth/io.wesl`).
  - `cloudShell/vertex.wesl` — project the unit sphere via `CloudShellUniforms.mvp`; forward `uv` + `normalLocal = position` (unit sphere: local position IS the normal), like `earth/vertex.wesl`.
  - `cloudShell/fragment.wesl` — `let c = textureSample(cloudTexture, cloudSampler, in.uv);` (rgba, sRGB→linear on read; `.a` is the coverage); light by the shared term `let lit = litShade(normalize(in.normalLocal), u.sunDirLocal);` (clouds dark on the night side, ~AMBIENT); output **straight-alpha** `vec4<f32>(c.rgb * lit, c.a * u.cloudOpacity)`. Named shading consts (if any curve is added) local to the module.

**Steps:**

- [x] Write the type, renderer, and three shaders (didactic headers; single-quote WESL comments; the shell rides the host body's frame via the caller's `composeBodyMvp` — state the `blend:'over'`/no-depth-write/static-no-drift posture, and that the shell is the body-agnostic reusable renderer Venus/Titan opt into later).
- [x] `npx tsc --noEmit` clean; `npm run build` clean (the `?static` WESL imports link; watch the iOS-strict traps — valid struct/binding layout, no `texture_1d`; use `createShaderModuleWithDevLog` output if it fails).
- [x] No visual check yet (no layer/bootstrap wiring — Task 4). Commit (stage each path).

---

## Task 4: Wire `cloudShellRenderer` into bootstrap + `cloudShellLayer` `CONTENT_LAYERS` row

**Files:**

- Modify `src/@types/engine/handles/EngineGpuHandles.d.ts` (`cloudShellRenderer` handle)
- Modify `src/services/engine/phases/initGpu.ts` (construct it)
- Modify `src/services/engine/engine.ts` (null-init + destroy)
- Create `src/services/engine/frame/passes/cloudShellLayer.ts`
- Modify `src/services/engine/frame/passes/index.ts` (import/export + insert the row after `earthLayer`)
- Create `src/data/bodies/cloudShellParams.ts` (`CLOUD_SHELL_PARAMS`)

**Interfaces — Consumes:** `createCloudShellRenderer` (Task 3), `packCloudShellUniforms` (Task 2). **Produces:** the `cloudShellRenderer` engine handle + the `cloudShellLayer` row (plan E inserts `atmosphereShellLayer` AFTER it).

```ts
// src/data/bodies/cloudShellParams.ts — named tunables (spec §11), one home; shared by the shell scale
// (cloudShellLayer), the shell opacity uniform (cloudShellLayer → packCloudShellUniforms), and the
// surface shadow radius (earthLayer → packEarthSurfaceUniforms[26]).
export const CLOUD_SHELL_PARAMS: {
  readonly radiusRatio: number; // shell radius in unit-sphere local units (≈ 1 + cloudTopKm/earthRadiusKm)
  readonly opacity: number; // coverage-to-alpha multiplier into the shell's straight-alpha output
};
```

- **`EngineGpuHandles`:** add `cloudShellRenderer: CloudShellRenderer | null;` with a docblock modeled on `ringRenderer`'s (`EngineGpuHandles.d.ts:425`). Excluded from `isEngineReady`, null-checked at use.
- **`initGpu`:** `state.gpu.cloudShellRenderer = createCloudShellRenderer(device, 'rgba16float', 'depth32float');` next to the ring renderer (`initGpu.ts:552`).
- **`engine.ts`:** `cloudShellRenderer: null` in the initial gpu block (`engine.ts:323`) and `state.gpu.cloudShellRenderer?.destroy(); state.gpu.cloudShellRenderer = null;` in teardown (`engine.ts:778-779`).
- **`cloudShellLayer`** — model on `ringsLayer.ts` (a `foreground:0` / `NEAR0` / `blend:'over'` row for Earth). `enabled` gates on: the `cloudShellRenderer` handle (null pre-bootstrap), the seeded `bodies.earth` record, the shared `FOREGROUND_MAX_DISTANCE_MPC` + `SUB_PIXEL_BODY_CULL_PX` gates (copy `earthLayer.ts:71-98`), AND the clouds slot being resident — `state.assetSlots.bodyTextures.get(bodyTextureSlotKey('earth','clouds'))?.current() != null` (mirror `ringsLayer`'s residency gate, `ringsLayer.ts:86-90`) so a row that would draw a transparent shell leaves the pass plan. `enabled` and `draw` read ONE residency+cull derivation, per the `ringsLayer` invariant.
- **`draw`:** compose the shell MVP from the slab's f64 vp (the f64 seam — `view.slab.vp`), scaling by `earth.radiusKm * SCALE_UNITS.KM_TO_MPC * CLOUD_SHELL_PARAMS.radiusRatio` (the shell just above the surface), folding in `earth.orientation`; `sun = sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation)`; `renderer.draw(pass, packCloudShellUniforms(mvp, sun, CLOUD_SHELL_PARAMS.opacity))`. No `drawPick` (shells are non-pickable — spec §8.3; `bodyPickRenderer` unchanged).
- **`index.ts` insertion:** import + export `cloudShellLayer`, and place it in the `CONTENT_LAYERS` array **immediately after `earthLayer`** (`index.ts:276`) — the shell depth-tests against Earth's opaque surface, which `earthLayer` draws first; plan E's `atmosphereShellLayer` will land AFTER this row (drawn last). Add a one-line array comment stating the after-earth/before-atmosphere ordering. Update the module-header draw-order list (`index.ts:86-116`) with the new row.

**Steps:**

- [x] Add `CLOUD_SHELL_PARAMS`; the engine handle + init/destroy; `cloudShellLayer`; the `index.ts` import/export + insertion + header note.
- [x] `npx tsc --noEmit` clean; `npm run build` clean.
- [x] **Visual check (transparent placeholder, before Task 6/8 data):** ask the user to confirm on the already-running dev server (do not start/kill it) that Earth renders exactly as after plans A+B — no cloud shell visible yet (the placeholder is transparent), no crash, no z-fighting on the globe. Verify on iOS (the shell pipeline is now in the shared foreground encoder — a bad pipeline would silently blank the canvas).
- [x] Commit (stage each path).

---

## Task 5: Clouds data chain — registry, source, kind ceiling, alpha-PNG filename, `writeCloudTier`

**Files:**

- Modify `tools/utils/io/rawDataRegistry.ts` (NASA cloud-composite source row)
- Modify `tools/utils/io/textureSources.ts` (`earth.clouds` source row)
- Modify `src/data/bodies/bodyTextureRegistry.ts` (`earth.kinds.clouds`)
- Create `src/utils/scene/isAlphaTextureKind.ts` + `tests/utils/scene/isAlphaTextureKind.test.ts`
- Modify `src/utils/scene/bodyTextureFilename.ts` + `tests/utils/scene/bodyTextureFilename.test.ts`
- Create `tools/textures/writeCloudTier.ts` + `tests/tools/textures/writeCloudTier.test.ts`
- Modify `tools/textures/buildTextures.ts` (clouds build path — writer dispatch)
- Modify `tests/tools/textures/buildTextures.test.ts` (drift coverage of `(earth,'clouds')`)
- Modify `data/raw/textures/README.md` (provenance for the cloud composite)

**Interfaces — Consumes:** plan A's `isLinearTextureKind` (clouds → `false`), `bodyTextureFilename`, the `(body,kind)` fetch/build iteration + drift tests, the writer dispatch. **Produces:** the `(earth,'clouds')` source rows, `isAlphaTextureKind`, and the `writeCloudTier` build primitive.

```ts
// utils/scene/isAlphaTextureKind.ts — the ONE home for "does this kind carry an alpha channel
// (→ PNG file, not JPG)?" Read by bodyTextureFilename. Orthogonal to isLinearTextureKind
// (linear = data precision; alpha = channel count). clouds today; a future alpha kind adds here.
export function isAlphaTextureKind(kind: TextureKind): boolean; // clouds → true

// tools/textures/writeCloudTier.ts — sRGB-colour PNG tier with alpha DERIVED FROM LUMINANCE (spec §9.1).
// If the source has no alpha channel, alpha = luminance of the RGB (white cloud → opaque, black → clear);
// RGB kept as the cloud colour. Resize to widthPx, write PNG (alpha preserved, sRGB colour — NOT the
// gamma-stripped writeLinearTier path).
export function writeCloudTier(srcPath: string, widthPx: number, outPath: string): Promise<void>;
```

- **`rawDataRegistry` row:** add `'textures.earthClouds'` (`source:'gitignored'`, `upstream` = the verified NASA cloud-composite URL, `fetcher:'tools/fetch/fetchTextures.ts'`, `readme:'textures.readme'`), modeled on `textures.nasaBmng` (`rawDataRegistry.ts:582-592`). **Verify the exact URL + native dimensions before writing the row** — Task 8 confirms live. The `.sha256` sidecar + README are already covered by the committed globs (no `.gitignore` edit).
- **`TEXTURE_SOURCES.earth`:** add `clouds: { native: 'textures.earthClouds' }` (`textureSources.ts:68`). No `dev` variant (full-pull-only, like plan A's `material` / plan B's `night`). The `satisfies` check + plan A's drift tests now enforce fetch/build cover it.
- **`BODY_TEXTURE_REGISTRY.earth`:** add `clouds: 'large'` to `kinds` (`bodyTextureRegistry.ts:56`) — the **8K ceiling** (spec §9.2, colour map). One edit auto-mints the slot + `ASSET_WIRING` proximity row + fetcher URL via `ALL_BODY_TEXTURE_KEYS` (`bodyTextureKeys.ts:22-29`).
- **`bodyTextureFilename` (`bodyTextureFilename.ts:35-38`):** OR `isAlphaTextureKind(kind)` into the PNG condition so it reads "PNG for the ring, a linear kind, OR an alpha kind; else JPG" → `bodyTextureFilename('earth','clouds','large') === 'earth-clouds-8192.png'`. Clouds stay sRGB (`rgba8unorm-srgb`, colour-managed decode) — only the extension changes; do NOT add clouds to `isLinearTextureKind`.
- **build clouds path (writer dispatch):** in plan A's rewired `buildTextures` loop (`buildTextures.ts:208-228`), route the `clouds` kind to `writeCloudTier` (NOT `writeBodyTier`/`writeLinearTier` — clouds are sRGB PNG with alpha-from-luminance). If plan A's dispatch is `isLinearTextureKind(kind) ? writeLinearTier : writeBodyTier`, generalize it to a small kind dispatch: `clouds → writeCloudTier`, else `isLinear → writeLinearTier`, else `writeBodyTier` (a tagged dispatch, per `feedback_generalize_repeated_fixes` — this is the third writer). `emittedTiersForBody('earth','clouds')` caps at `large`.
- **`writeCloudTier`:** the alpha-from-luminance + sRGB-PNG primitive — contrast `writeRingTier` (`buildTextures.ts:195-201`, PNG but preserves an EXISTING alpha, no luminance derivation) and `writeBodyTier` (JPG). Use `sharp` `.ensureAlpha()` / a luminance→alpha composite.

**Steps (TDD):**

- [x] `isAlphaTextureKind` test: `clouds carries alpha`, `surface/night/material/normal do not` — a small structural predicate driving the filename ext.
- [x] Extend `bodyTextureFilename.test.ts`: `an alpha kind uses PNG` → `bodyTextureFilename('earth','clouds','large') === 'earth-clouds-8192.png'` (fails if clouds get a JPG name → the fetcher 404s the map). Keep the surface/ring/material/night cases green.
- [x] `writeCloudTier` test: `derives alpha from luminance when the source has none` — feed a tiny known no-alpha RGBA (a white cell + a black cell), write at same width, read the PNG back to raw, assert the white cell's alpha ≈ 255 and the black cell's ≈ 0, RGB preserved (fails if the luminance→alpha derivation is dropped or inverted — a real property, spec §9.1).
- [x] In `buildTextures.test.ts`: assert `textureBuildEntries` now contains `{ bodyId:'earth', kind:'clouds' }` (the plan-A drift-test set derives from `TEXTURE_SOURCES` — this pins the new source row is picked up by the already-rewired iteration; the required one-line assertion, NOT a re-fix of the landmine). If the writer dispatch is an explicit switch, assert `clouds` selects `writeCloudTier`.
- [x] Add the registry/source/kinds rows + the README provenance stub (URL, dimensions, fetch-date placeholder filled in Task 8); implement `isAlphaTextureKind`, `writeCloudTier`, the filename OR, and the build dispatch.
- [x] `npm test -- isAlphaTextureKind bodyTextureFilename writeCloudTier buildTextures fetchTextures textureSources` green; `npx tsc --noEmit` + `npx tsc --noEmit -p tsconfig.tools.json` clean.
- [x] Commit (stage each path).

---

## Task 6: Two-consumer commit fan-out — one `(earth,'clouds')` bitmap to shell + surface

**Files:**

- Modify `src/services/engine/wiring/bodyTextureSlotRegistry.ts`

**Interfaces — Consumes:** `cloudShellRenderer.setTexture` (Task 3, via the Task 4 handle), `earthRenderer.setMap('clouds', …)` (Task 7 adds the real binding — see below). **Produces:** the fan-out that hands ONE committed cloud bitmap to BOTH the shell and the surface pipelines.

- **This is the one real wiring-design task (spec §7.3).** The single `(earth,'clouds')` bitmap must reach two resident consumers WITHOUT forking the single-dispatch seam. The precedent is in the SAME file: the Saturn-ring commit fans one bitmap to two consumers (`bodyTextureSlotRegistry.ts:95-101` — `setRingTexture` + `ringRenderer.setTexture`). Mirror it exactly inside the existing `entry.bodyId === 'earth'` branch (`bodyTextureSlotRegistry.ts:86-91`):
  - Keep the existing `state.gpu.earthRenderer?.setMap(entry.kind, bitmap);` — it already routes EVERY Earth kind (surface/night/material/normal/clouds) to the surface renderer; for `clouds` this binds the surface-pipeline copy used by the shadow + occlusion samples (Task 7 implements that `setMap` case + binding).
  - ADD, guarded on the kind: `if (entry.kind === 'clouds') state.gpu.cloudShellRenderer?.setTexture(bitmap);` — the shell's own copy.
- **Before/after (the ONLY change to the seam):**

```ts
// bodyTextureSlotRegistry.ts, inside `if (entry.bodyId === 'earth') { … }`
  state.gpu.earthRenderer?.setMap(entry.kind, bitmap);
+ // Clouds fan to a SECOND resident consumer — the body-agnostic cloud shell — the same
+ // one-asset/two-consumers shape the ring commit below uses. Surface (setMap above) samples
+ // it for shadow + night-occlusion (spec §7.3); the shell renders it as the translucent layer.
+ if (entry.kind === 'clouds') state.gpu.cloudShellRenderer?.setTexture(bitmap);
```

The `(earth,'clouds')` key still flows through the ONE `commitBodyTexture` function; it fans to two consumers, exactly as the ring key already does — **no new dispatch structure, no fork.** Plans A + B's commit dispatch is otherwise unchanged; `releaseBodyTexture` needs no edit (the shell texture is a small non-evicted asset sharing Earth's lifecycle, like the ring strip — `bodyTextureSlotRegistry.ts:107-115` header). Update the module header's Earth-branch note (`bodyTextureSlotRegistry.ts:21-25`) to record clouds as the now-wired two-consumer fan-out.

**Steps:**

- [x] Add the guarded `cloudShellRenderer.setTexture` line + update the header note.
- [x] `npx tsc --noEmit` clean; `npm run build` clean.
- [x] Commit.

---

## Task 7: Ground shadow + night occlusion in the surface fragment

**Files:**

- Modify `src/services/gpu/renderers/bodies/earthRenderer.ts` (binding for the cloud map + `setMap('clouds', …)` case)
- Modify `src/services/gpu/shaders/bodies/earth/fragment.wesl` (shadow + occlusion)
- Modify `src/@types/rendering/EarthRenderer.d.ts` (doc `clouds` implemented; uniforms note)
- Modify `src/data/bodies/earthSurfaceParams.ts` (`cloudShadowStrength` → non-zero)
- Modify `src/services/engine/frame/passes/earthLayer.ts` (pass `cloudShellRadius` to the packer)

**Interfaces — Consumes:** `raySphereRoots` (Task 1, TS reference) mirrored by `lib/util.wesl::raySphere` (the WESL path), plan B's `nightLights(nightColour, NoL, cloudAlpha)` seam, `EarthSurfaceUniforms.cloudShadowStrength` [25] + `cloudShellRadius` [26] (Task 2), `CLOUD_SHELL_PARAMS.radiusRatio` (Task 4). **Produces:** the surface-side realism — a soft ground shadow + cloud-occluded city lights.

- **`earthRenderer` binding:** add a fragment **binding 6** cloud texture (`sampleType:'float'`) to the bind-group layout + `buildBindGroup` (per plan A's canonical binding table: A material=3, B night=4, C normal=5 — clouds take 6). Create a **1×1 transparent `rgba8unorm-srgb` placeholder** `[0,0,0,0]` at construction (so cloud alpha reads 0 → no shadow, no occlusion, before the map lands — branch-free). Reuse the existing `earthSampler` (binding 1).
- **`setMap('clouds', …)` case:** create a fresh `rgba8unorm-srgb` texture sized to the bitmap (SAME sRGB format + `flipY:true` upload + `generateMipChain` as the `surface`/`night` cases), rebuild the bind group. Clouds are sRGB colour — do NOT use the linear decode/format path. Keep `normal` inert (plan C). Update `EarthRenderer.d.ts` `setMap` doc to record `clouds` as implemented (surface-side shadow + occlusion sample).
- **`bodyTextureFetcher`:** clouds ride the DEFAULT colour-managed decode (they are sRGB, `isLinearTextureKind('clouds') === false`) — plan A's linear-decode branch already excludes them; **no fetcher edit**. Verify the decode path once (one-line check), no re-fix.
- **`earthSurfaceParams.ts`:** set `cloudShadowStrength` to a non-zero named tunable (plan A shipped `0`). Tune to taste in the Task 8 visual pass.
- **`earthLayer.draw`:** pass `CLOUD_SHELL_PARAMS.radiusRatio` as the 8th arg to `packEarthSurfaceUniforms(…, cloudShellRadius)` (plan A's call, now extended). Import `CLOUD_SHELL_PARAMS`.
- **fragment (`earth/fragment.wesl`) — composition (spec §7.2 + §6; contract, not a body):**
  - declare `@group(0) @binding(6) var cloudTexture: texture_2d<f32>;`
  - import the WESL primitive: `import package::lib::util::raySphere;` (its SECOND consumer).
  - **ground shadow** — the surface point `P = normalize(in.normalLocal)` is inside the shell; ray along the (unit) sun dir: `let roots = raySphere(P, u.sunDirLocal, vec3<f32>(0.0), u.cloudShellRadius);` take the exit root `roots.y` (always ≥ 0 here); `let crossing = P + roots.y * u.sunDirLocal;` map `normalize(crossing)` to equirect uv (u = `atan2(dir.y, dir.x)/(2π)` wrapped to [0,1], v = `asin(clamp(dir.z,-1,1))/π + 0.5` — the SAME convention `uvSphereMesh`/`cubeSphereMesh` bake, see `earth/fragment.wesl` u/v notes); `let shadowAlpha = textureSample(cloudTexture, earthSampler, crossUv).a;` then darken the DIRECT sun term: `direct = direct * (1.0 - shadowAlpha * u.cloudShadowStrength);` — applied to plan A's `direct` (the `pbrDirect` result) BEFORE the `* sunIrradiance + AMBIENT*albedo` combine, so it self-limits at the terminator (direct ≈ 0 there). **Renormalize any invModel-scaled vector** (house trap) — here `P` and `sunDirLocal` are already unit in the local frame (no invModel), so `raySphere`'s unit-`rd` precondition holds; keep the renormalize note in the header.
  - **night occlusion** — replace plan B's `nightLights(nightColour, NoL, 0.0)` (`earth/fragment.wesl`, the B line) with `nightLights(nightColour, NoL, textureSample(cloudTexture, earthSampler, in.uv).a)` — cloud alpha at the fragment's OWN uv (spec §6/§7.3). No `nightLights` signature change.
  - Update the bindings decl + the uniform note; comments single-quoted.
- **The direction→equirect-uv mapping** is a small pure geometry expression; keep it inline (or a local WESL helper). It is verified visually (Task 8) — do NOT add a runtime-type test for it (WESL). The analytic _intersection_ it feeds is what Task 1 tests.

**Steps:**

- [x] Wire the renderer (binding 6, transparent placeholder, `clouds` `setMap` case), the fragment (bind + two cloud samples, shadow-darken `direct`, fill B's `cloudAlpha`), `earthSurfaceParams.cloudShadowStrength`, and `earthLayer`'s `cloudShellRadius` arg + `EarthRenderer.d.ts` doc.
- [x] `npx tsc --noEmit` clean; `npm run build` clean (the WESL links; iOS-strict traps — valid binding layout, no `texture_1d`; `createShaderModuleWithDevLog` output if it fails).
- [x] **Visual check (transparent placeholder, before Task 8 data):** ask the user to confirm Earth still renders exactly as after plans A+B — day PBR + ocean glint + city lights intact, NO shadow and NO extra occlusion yet (cloud alpha is 0 everywhere), no crash. Verify on iOS.
- [x] Commit (stage each path).

---

## Task 8: Fetch + build the cloud composite, then verify the shell + shadow + occlusion

**Files:** none (data + verification). Produces `data/raw/textures/<cloud-composite>` (gitignored) and `public/data/images/textures/earth-clouds-{…,8192}.png` (gitignored build artefacts).

- [x] **Announce the download** (announce-big-downloads): tell the user the NASA cloud-composite source is ~10–20 MB, state the exact URL + size confirmed against `textures.earthClouds`, and **get explicit go-ahead before fetching**. Do not fetch otherwise. Fill the verified URL + native dimensions back into the `textures.earthClouds` registry row + the `data/raw/textures/README.md` provenance (fetch date, dimensions, licence/credit) if they differed from the Task 5 stub.
- [x] On go-ahead, fetch the cloud composite (`npm run fetch-textures -- --confirm`, or a targeted single-source fetch) — it lands via `downloadGetOnly` into `data/raw/textures/` and upserts its `textures.sha256` line.
- [x] Build the cloud tiers: `npm run build-textures` emits `earth-clouds-8192.png` (+ smaller tiers) into `public/data/images/textures/` via the Task 5 `writeCloudTier` path. Confirm the files exist, are PNG, and carry an alpha channel.
- [x] **Visual check (the acceptance win, spec §12 row D):** ask the user to fly close to Earth on the running dev server and confirm: (1) a **translucent cloud shell** wrapping the globe, lit by the sun (bright day-side clouds, dark night-side), the far hemisphere correctly hidden behind the globe; (2) **soft ground shadows** cast by the clouds onto the day-side surface, fading out at the terminator; (3) **city lights dimming under cloud** on the night side. Confirm the map loaded (network tab shows `earth-clouds-8192.png`, not a 404 to the placeholder). Tune `EARTH_SURFACE_PARAMS.cloudShadowStrength` + `CLOUD_SHELL_PARAMS.opacity` with the user if the shadow/opacity reads too strong or too faint.
- [x] No commit (all artefacts gitignored). Note for the merge: R2 sync of the new `earth-clouds-*.png` is a post-merge deploy step (spec §9.3 — the textures dir glob sweeps it automatically), not part of this PR.

---

## Task 9: entanglement-radar review pass

**Files:** none (review).

- [x] Run the `entanglement-radar` skill over the whole branch diff (house convention). Pay attention to:
  - the **accepted coupling** (spec §7.3) being the ONLY non-independence — the cloud map bound in both pipelines, two surface samples — and being Earth-specific + data-gated (Venus reuses the shell but `cloudShadowStrength = 0`), not a leak into the body-agnostic shell;
  - the **two-consumer commit fan-out** genuinely reusing the existing seam (mirrors the ring commit) — no forked dispatch, no `(earth,'clouds')`-special-cased slot;
  - the **TS↔WESL intersection mirror** (`raySphereRoots` ↔ `lib/util.wesl::raySphere`) named as an accepted parity (same posture as the uniform packers), with the graduate-to-`lib/raycast.wesl` option noted if it reads as a real knot;
  - the **PNG axis** split cleanly across two orthogonal predicates (`isLinearTextureKind` = precision, `isAlphaTextureKind` = channel count) — no third "is-clouds" special-case leaking into the filename or GPU-format logic;
  - the shell radius living in ONE home (`CLOUD_SHELL_PARAMS.radiusRatio`) feeding both the shell scale and the shadow uniform — not duplicated as a WESL const.
  - Name any knot precisely and fix or file it before the final review.
- [x] Address findings (or record why deferred); keep the suite green.

---

## Task 10: Final review + verification

**Files:** none.

- [x] Run `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [x] Request code review (`superpowers:requesting-code-review`) covering: the `CloudShellUniforms` byte-layout parity, the `raySphereRoots` intersection test, the shadow-darken + night-occlusion composition, the two-consumer commit fan-out, and the clouds data chain (registry/source/kinds/filename/`writeCloudTier`).
- [x] Confirm the DoD before marking the plan done (`/feature-done`), which sweeps the backlog + relocates spec/plan on merge.

---

## Interfaces produced for later plans

Plan E (atmosphere shell) is drafted against these exact shapes.

**`cloudShellRenderer`** (`src/services/gpu/renderers/bodies/cloudShellRenderer.ts`, type `@types/rendering/CloudShellRenderer.d.ts`):
`createCloudShellRenderer(device, targetFormat, depthFormat): CloudShellRenderer` where `CloudShellRenderer = Renderer & { setTexture(bitmap: ImageBitmap): void; draw(pass, uniforms: Float32Array): void }`. A body-agnostic translucent sphere (`uvSphereMesh`), `blend:'over'` straight-alpha, `depthCompare:'less'` + `depthWriteEnabled:false`, `frontFace:'ccw'`/`cullMode:'back'`, `foreground:0` (`rgba16float`/`depth32float`) formats — the shell pattern plan E's `atmosphereShellRenderer` mirrors. Transparent 1×1 placeholder until `setTexture` lands the map. Engine handle `state.gpu.cloudShellRenderer` (nulled + destroyed with the other renderers).

**`CloudShellUniforms`** (`lib/sphere.wesl`) — 80 bytes / 20 f32:

| f32 idx | bytes  | field                    | notes                                                               |
| ------- | ------ | ------------------------ | ------------------------------------------------------------------- |
| 0..15   | 0..63  | `mvp: mat4x4<f32>`       | column-major                                                        |
| 16..18  | 64..75 | `sunDirLocal: vec3<f32>` | body-local sun dir                                                  |
| 19      | 76..79 | `cloudOpacity: f32`      | fills the vec3 tail (real field); from `CLOUD_SHELL_PARAMS.opacity` |

Packer `packCloudShellUniforms(mvp, sunDirLocal, cloudOpacity) → Float32Array(20)`; `CLOUD_SHELL_UNIFORM_FLOATS = 20`. Reuses `packLitBodyUniforms` for the 80-byte lit prefix, then overwrites `out[19]`.

**`cloudShellLayer`** (`src/services/engine/frame/passes/cloudShellLayer.ts`): a `{ name:'cloud-shell', slab: NEAR0, target:'foreground:0', blend:'over' }` `CONTENT_LAYERS` row, inserted **immediately after `earthLayer`** (`passes/index.ts:276`). It depth-tests against Earth's opaque surface (drawn by the preceding `earthLayer`) and writes no depth. **Plan E inserts `atmosphereShellLayer` AFTER this row** (drawn last in the `foreground:0` group, spec §8.3). `enabled`/`draw` share one residency (`bodyTextureSlotKey('earth','clouds')`) + distance/sub-pixel-cull derivation; the shell is non-pickable (no `drawPick`).

**`EarthSurfaceUniforms` — extended by plan D (no reshape).** `[25] cloudShadowStrength` (plan A's reserved slot) is now sourced non-zero from `EARTH_SURFACE_PARAMS.cloudShadowStrength`; `[26] _pad0 → cloudShellRadius` (the cloud shell's unit-sphere local radius = `CLOUD_SHELL_PARAMS.radiusRatio`, threaded so the surface shadow fragment intersects the correct shell). `packEarthSurfaceUniforms` gains an 8th arg `cloudShellRadius` (writes `out[26]`); struct stays 112 B / 28 f32 (`EARTH_SURFACE_UNIFORM_FLOATS = 28`); `[27] _pad1` remains free (plan C bakes exaggeration offline, claims no slot). **`nightLights(nightColour, NoL, cloudAlpha)` is UNCHANGED** — D fills `cloudAlpha` with the own-uv cloud sample (argument value only, per plan B's seam).

**`raySphereRoots`** (`src/utils/math/raySphereRoots.ts`): `raySphereRoots(ro, rd, center, radius): Vec2 | null` — the tested analytic ray↔sphere intersection (both roots, `null` on miss), mirroring `lib/util.wesl::raySphere`. Plan E's atmosphere march-bound (spec §8.3, analytic ray–surface-sphere `[tNear,tFar]`) reuses this util (TS reference) + the same WESL `raySphere` primitive.

**Clouds `(earth,'clouds')` wiring** (the `(body,kind)` pattern, sRGB + **alpha**):

- `BODY_TEXTURE_REGISTRY.earth.kinds.clouds = 'large'` (8K) → auto-mints slot + `ASSET_WIRING` proximity row + fetcher URL.
- `TEXTURE_SOURCES.earth.clouds = { native: 'textures.earthClouds' }` (no `dev` variant).
- On-disk name `earth-clouds-<px>.png` via `bodyTextureFilename` — clouds are **NOT** linear (stay `rgba8unorm-srgb` + colour-managed decode) but **are** alpha, so `isAlphaTextureKind('clouds') === true` forces PNG. `writeCloudTier` derives alpha from luminance at build (spec §9.1).
- Commit fan-out (spec §7.3): `commitBodyTexture` routes `(earth,'clouds')` to BOTH `earthRenderer.setMap('clouds', …)` (surface-pipeline binding 6, for shadow + occlusion) AND `cloudShellRenderer.setTexture(…)` (the shell's own copy) — one asset, two consumers, at the existing seam (mirrors the Saturn-ring commit; not a fork).
- **Live-provider seam (spec §7.4) — designed, not built:** the same `setTexture`/`setMap('clouds', …)` async seam swaps the source (static R2 map now → future NASA GIBS WMTS EPSG:4326) with zero renderer rework.
