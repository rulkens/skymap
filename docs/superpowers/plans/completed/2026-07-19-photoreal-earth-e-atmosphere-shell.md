# Photoreal Earth E — Atmosphere Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give Earth a physically-based **atmosphere shell** (Bruneton/Hillaire precomputed scattering, LUTs baked on-device at startup) so close approach shows a **blue limb** and a **reddened sunset ring**. The shell is a body-agnostic renderer parameterized by per-body `AtmosphereParams` data — Earth now, Mars/Venus/Titan later by coefficient rows.

**Architecture:** A new `atmosphereShellRenderer` (`src/services/gpu/renderers/atmosphere/`) draws the atmosphere-top proxy sphere's **back faces** into the depth-bearing `foreground:0` target, `blend:'over'`, depth-test on / depth-write off, **drawn LAST** in the `(foreground:0, NEAR0)` group — the exact profile `ringRenderer`/`ringsLayer` established (`renderers/bodies/ringRenderer.ts:161-235`, `passes/ringsLayer.ts:116-159`). The march bound is an **analytic ray–sphere intersection** with Earth's surface + atmosphere-top spheres (NOT a depth read — the `foreground:0` depth texture stays `RENDER_ATTACHMENT`-only, `renderTargets.ts:76`); occlusion by other opaque bodies rides the ordinary depth-test. Two 2D LUTs (transmittance, multi-scatter) bake **once at startup** via an on-device compute pass (precedent: `galaxy/createGenerationPipelines.ts` + `flow/compute.wesl`); a third **per-frame sky-view LUT** regenerates each frame through a pre-render compute step modeled on `encodeFlowCompute` (`frame/encodeFlowCompute.ts:45-50`), dispatched via a new row in the `COMPUTE` name→fn table (`frame/executeFrame.ts:78-83`) that a `{ kind:'compute', name:'atmosphereSkyView' }` step in `frameProgram` (`frame/frameProgram.ts:60`) names — the same two-seam shape the `flow` compute step uses. The shell carries its **own** uniform struct (`AtmosphereUniforms`, sibling of `LitBodyUniforms`/`RingUniforms` in `lib/sphere.wesl`) — it does NOT overload any existing body uniform.

**Tech Stack:** TypeScript + Vite + React shell, raw WebGPU + WESL shaders (`?static` linker), Vitest.

**Spec:** docs/superpowers/specs/2026-07-18-photoreal-earth-design.md (§8 in full, §10 "shells carry their own uniforms", §11 performance/tunables, §12 row E)

**Depends on:** plan A (the `CONTENT_LAYERS` row pattern, the sibling-uniform-struct pattern `packLitBodyUniforms`-prefix + own-struct, the `camPosLocal` util at `utils/camera/camPosLocal.ts`, the NEAR0 slab + `foreground:0` conventions) **and plan D** (its `raySphereRoots` util at `src/utils/math/raySphereRoots.ts` — the atmosphere march-bound `atmosphereShellBound` COMPOSES over it rather than re-solving the quadratic; D executes before E, so the util is present). **Otherwise independent of plans B/C** — the shell is body-agnostic and touches neither the cubesphere, `EarthSurfaceUniforms`, night lights, nor normal maps. It only INSERTS a row after plan D's `cloud-shell` layer (draws LAST regardless).

### Header notes — resolved decisions (do not re-litigate)

- **Froxel / aerial-perspective 3D LUT is OUT of scope (spec §1, §8.2 NON-GOAL).** Ship only the two baked 2D LUTs + the per-frame sky-view 2D LUT + the analytic-intersection march bound. The 32³ view-dependent froxel — and the aerial-perspective haze _over the planet disc_ it would render — is deferred to the terrain/descent phase. What ships is the **limb ring** (background behind the limb is space) + the **sky dome when inside**; atmosphere over the opaque disc is the deferred froxel, and the back-face+depth-test design (below) yields exactly that split for free.
- **LUTs bake ON-DEVICE at startup — no R2 / data-pipeline change.** The bakeable LUTs are tiny (~136 KB) and 2D; shipping them would only add a pipeline dependency and kill the tune-a-coefficient-see-it-live loop (spec §8.2). This plan fetches **nothing**.
- **Depth stays `RENDER_ATTACHMENT`-only (spec §8.3).** The analytic surface-sphere bound is _why_ — the shell never samples depth. The `TEXTURE_BINDING` upgrade is a deferred terrain-phase item; do NOT touch `renderTargets.ts` usage flags here.
- **Back-face draw + depth-test 'less-equal' is load-bearing, not a quirk.** Culling FRONT faces (`cullMode:'front'`) draws the atmosphere-top sphere's far wall. Depth-testing that far-wall fragment against the already-stamped opaque planet means: the **limb ring** (space behind → far depth → passes) renders; **over the disc** (planet behind → fails) does NOT (= the deferred froxel); a **Moon in front** (nearer depth → fails) occludes the shell. One pipeline profile delivers all three — this is essential geometry, not a special case to teach around.
- **Composite is premultiplied-OVER with a scalar background-opacity in v1.** The spec formula is `out = inScatter + dst·(1 − opacity)`, `opacity = 1 − transmittance` (spec §8.3). Per-channel `transmittance` needs dual-source blending (feature-gated, iOS-risky). v1 emits premultiplied `src.rgb = inScatter` + a **scalar** `src.a = opacity` (luminance of `1 − transmittance`) under straight `blend:'over'` — the visible **sunset reddening lives in `inScatter`** (per-channel, LUT-baked), and the background behind the limb is space (`dst ≈ 0`), so a scalar background-attenuation is invisible in v1. Per-channel/dual-source is a noted upgrade path, not built. See Global Constraints.
- **Gas-giant limb darkening (spec §8.4) is NOT this plan.** Bruneton is geometrically meaningless without a solid surface; gas giants get `lib/limbDarkening.wesl` composed in the _surface_ fragment (a `texturedBodyRenderer` follow-on). That is why the shell stays terrestrial-only and Earth is the sole `ATMOSPHERE_PARAMS` row today. Do not plan the gas-giant path.
- **One baked LUT set in v1 (one atmosphere in the scene).** Earth is the only atmosphere body, so the renderer bakes ONE transmittance+multi-scatter pair from the `AtmosphereParams` handed to its factory. A second atmosphere body (Venus/Titan/Mars) adds a per-params LUT cache — a clean data-gated growth, deferred.

## Global Constraints

Binding values copied from the spec; every task inherits them.

- **LUTs (spec §8.2, §11) — named tunable constants, NO adaptive machinery:**
  | LUT | Dims | View-dependent? | Lifecycle |
  |---|---|---|---|
  | Transmittance | **256×64** 2D | No | baked **once at startup** (compute) |
  | Multi-scatter | **32×32** 2D | No | baked **once at startup** (compute; samples transmittance) |
  | Sky-view | **~192×108** 2D | Yes | **per-frame** compute (samples transmittance + multi-scatter) |
  | Aerial-perspective froxel | 32³ 3D | Yes | **DEFERRED (§1/§8.2)** — not built |
  Dimensions live as named consts (`TRANSMITTANCE_LUT_SIZE`, `MULTI_SCATTER_LUT_SIZE`, `SKY_VIEW_LUT_SIZE`); lowering one is the only "quality knob" (spec §11). LUT textures are `rgba16float` with `STORAGE_BINDING | TEXTURE_BINDING` (write in the bake, sample in the consumer). **Caveat — no proven storage-texture precedent in this repo:** the cited compute precedents (`galaxy/createGenerationPipelines.ts` + `flow/compute.wesl`) write storage **BUFFERS** (`var<storage, read_write>`), NOT storage textures — there is currently **no `texture_storage_2d<…, write>` anywhere in the codebase**. So the `rgba16float` storage-texture write path is NEW here and unverified on WebKit. If `texture_storage_2d` write is rejected on iOS, the **fullscreen fragment render-to-texture bake is the proven fallback** (same one-shot-at-startup contract, using the ordinary `rgba16float` RENDER_ATTACHMENT path this repo already uses everywhere) — keep this fallback ready, not an afterthought.
- **Compositing (spec §8.3):** `out = inScatter + dst·(1 − opacity)`, `opacity = 1 − transmittance`. v1: premultiplied `vec4(inScatter, opacityScalar)` under `blend:'over'` (`srcFactor:'one'`, `dstFactor:'one-minus-src-alpha'`), `opacityScalar = 1 − luminance(transmittance)` (per-channel reddening carried by `inScatter`; per-channel/dual-source deferred).
- **March bound (spec §8.3):** analytic ray–sphere intersection with Earth's **surface** sphere + the atmosphere-top sphere — NOT a depth-buffer read (keeps `foreground:0` depth `RENDER_ATTACHMENT`-only, `renderTargets.ts:76`). Draw the proxy's **back faces** (`cullMode:'front'`); `[tNear,tFar]` with **`tNear→0` clamp when the camera is inside** the shell. Occlusion by other opaque bodies via the ordinary depth-test. After transforming the view ray by `invModel`, **renormalize** the direction (house trap: `feedback_renormalize_ray_after_invmodel`).
- **Layer (spec §8.3):** `atmosphereShellLayer` is a `{ target:'foreground:0', slab:NEAR0, blend:'over' }` row, depth-test on / **depth-write off**, **drawn LAST** in the `foreground:0` group (after plan D's `cloud-shell` row). Shell writes NO depth (zero new z-fighting, reuses the exact `depth32float` NEAR0 profile). **Non-pickable** — `bodyPickRenderer` unchanged, the row declares no `drawPick`.
- **Uniforms (spec §10):** the shell carries its OWN `AtmosphereUniforms` struct (sibling of `LitBodyUniforms`/`RingUniforms` in `lib/sphere.wesl`), reusing the 80-byte lit prefix via `packLitBodyUniforms`. Do NOT overload any existing body uniform.
- **Per-body params (spec §8.1):** `AtmosphereParams` is **data, not code** — a per-body registry row (Earth now). Adding Mars/Venus/Titan is a new row, never a new branch.
- **Performance (spec §11):** target **60 fps desktop / 30–60 fps iOS**. Per-pixel cost = a couple of LUT samples + the analytic intersection (no per-pixel march). Cubesphere/proxy stays a single fixed subdivision.
- **iOS safety (house trap):** an invalid shader/pipeline silently drops the WHOLE frame on WebKit (all HDR passes share one encoder). Every shell + LUT-bake shader module goes through `createShaderModuleWithDevLog` (`shaderCompileLogger.ts`); each GPU task ends with a real iOS/WebKit verification. If `texture_storage_2d` write proves unusable on WebKit, the fallback is a fullscreen fragment render-to-texture bake (same one-shot-at-startup contract) — the compute path is primary per spec §8.2.
- **Downloads:** NONE. Plan E bakes on-device; no `fetch-*`, no R2 sync.
- **Conventions:** `type` aliases never `interface`; one symbol per file in `src/utils/` + `src/@types/` (filename = export name) — the intersection helper + `AtmosphereParams` type each own their file; deep relative imports, no barrels; didactic multi-paragraph module headers; WESL comments single-quoted (NO backticks), WESL imports literal `package::`, be meticulous (`feedback_wgsl_meticulous`); WebGPU explicit bind-group layouts, never `'auto'` shared across pipelines (`feedback_webgpu_auto_layout_trap`); wgpu-matrix + `Vec3`/`Mat3` aliases never raw tuples; `SCALE_UNITS.KM_TO_MPC` + `RENDER_ORIGIN_MPC` for frame maths; stage specific paths on commit (never `git add -A`).

---

## Task 1: `AtmosphereParams` type + `ATMOSPHERE_PARAMS` Earth registry row

**Files:**

- Create `src/@types/scene/AtmosphereParams.d.ts`
- Create `src/data/bodies/atmosphereParams.ts`

**Interfaces — Produces:**

```ts
// @types/scene/AtmosphereParams.d.ts — per-body scattering constants (spec §8.1). Data, not code.
export type AtmosphereParams = {
  readonly planetRadiusKm: number; // ground sphere (Earth 6371, matching SCENE_EARTH.radiusKm)
  readonly atmosphereTopKm: number; // top-of-atmosphere radius (planetRadiusKm + visible-atmosphere thickness)
  readonly rayleighScatter: Vec3; // per-channel Rayleigh scattering coefficient, 1/km
  readonly rayleighScaleHeightKm: number; // exponential density falloff
  readonly mieScatter: number; // grey Mie scattering coefficient, 1/km
  readonly mieAbsorption: number; // grey Mie absorption coefficient, 1/km
  readonly mieScaleHeightKm: number;
  readonly miePhaseG: number; // Henyey-Greenstein asymmetry g (Earth ≈ 0.8)
  readonly ozoneAbsorption: Vec3; // per-channel ozone absorption, 1/km
  readonly ozoneCenterKm: number; // tent-profile centre altitude
  readonly ozoneWidthKm: number; // tent-profile half-width
  readonly groundAlbedo: Vec3; // isotropic ground bounce for the multi-scatter LUT
};
```

```ts
// src/data/bodies/atmosphereParams.ts — keyed by body id (Earth today). Model on sceneRings.ts:32.
export const ATMOSPHERE_PARAMS: Readonly<Record<string, AtmosphereParams>>;
```

- Registry keyed by body id, like `SCENE_RINGS` (`sceneRings.ts:32`) is a per-body table — `ATMOSPHERE_PARAMS['earth']` is the single row today. A body absent from the table has no atmosphere shell (Moon, gas giants), which is exactly the data-gate spec §3 wants.
- Earth values are the standard **Bruneton/Hillaire Earth** constants (documented in the module header with the reference): Rayleigh `≈ (5.8, 13.6, 33.1)e-3` 1/km, `rayleighScaleHeightKm ≈ 8`, `mieScatter ≈ 3.9e-3`, `mieScaleHeightKm ≈ 1.2`, `miePhaseG ≈ 0.8`, ozone tent centred ~25 km, `atmosphereTopKm = planetRadiusKm + 100`. These are **tunable data** — do NOT unit-test the numeric values (constant restatement; forbidden by testing.md). `planetRadiusKm` MUST equal `SCENE_EARTH.radiusKm` (6371) so the proxy is concentric with the drawn Earth.
- No lookup helper — the layer indexes `ATMOSPHERE_PARAMS` directly (a bare record read, like `SCENE_RINGS.find`). If a second reader appears, extract a `getAtmosphereParams` then, not now.

**Steps:**

- [x] Add the `AtmosphereParams` type (one type per file, `Vec3` alias imports) with a didactic header describing each field + its unit + the Bruneton reference.
- [x] Add `ATMOSPHERE_PARAMS` with the Earth row + a header explaining "data, not code — Mars/Venus/Titan later by rows (spec §8.1)" and the `planetRadiusKm == SCENE_EARTH.radiusKm` concentricity requirement.
- [x] `npx tsc --noEmit` clean. (No test — pure data.)
- [x] Commit (`AtmosphereParams.d.ts`, `atmosphereParams.ts`).

---

## Task 2: `AtmosphereUniforms` struct + `packAtmosphereUniforms` + `bottomRadius` derivation

**Files:**

- Modify `src/services/gpu/shaders/lib/sphere.wesl`
- Create `src/utils/gpu/packAtmosphereUniforms.ts`
- Create `tests/utils/gpu/packAtmosphereUniforms.test.ts`

**Interfaces — Consumes:** `packLitBodyUniforms` (existing), `camPosLocal` (plan A). **Produces:**

```wgsl
// lib/sphere.wesl — sibling of RingUniforms (sphere.wesl:207-215), NOT an overload of LitBodyUniforms.
// The proxy sphere is scaled by composeBodyMvp to the ATMOSPHERE-TOP radius, so in the mesh's local
// frame the atmosphere top is the UNIT sphere and the ground sphere has radius bottomRadius ∈ (0,1) —
// the exact planetRadiusRatio trick RingUniforms uses (sphere.wesl:183-190).
struct AtmosphereUniforms {
  mvp: mat4x4<f32>,        // f32[0..15]   bytes  0..63   proxy (atmosphere-top) MVP
  sunDirLocal: vec3<f32>,  // f32[16..18]  bytes 64..75   sun dir in body local frame
  bottomRadius: f32,       // f32[19]      bytes 76..79   ground/atmosphere-top ratio (fills vec3 tail — REAL field)
  camPosLocal: vec3<f32>,  // f32[20..22]  bytes 80..91   camera in atmosphere-top-radius units, sphere centre at origin
  sunIrradiance: f32,      // f32[23]      bytes 92..95   sun brightness scale into HDR (fills vec3 tail)
  exposure: f32,           // f32[24]      bytes 96..99   in-scatter intensity scale
  _pad0: f32,              // f32[25]      bytes 100..103
  _pad1: f32,              // f32[26]      bytes 104..107
  _pad2: f32,              // f32[27]      bytes 108..111 (rounds struct to 112 / 16-byte alignment)
};
```

```ts
// utils/gpu/packAtmosphereUniforms.ts
export const ATMOSPHERE_UNIFORM_FLOATS = 28; // 112 bytes
export function packAtmosphereUniforms(
  mvp: Float32Array,
  sunDirLocal: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  bottomRadius: number, // = planetRadiusKm / atmosphereTopKm
  sunIrradiance: number,
  exposure: number,
): Float32Array;
```

- **Byte layout:** total **112 bytes / 28 f32**, table above. Reuse `packLitBodyUniforms(mvp, sunDirLocal)` for the 80-byte lit prefix, then **overwrite `out[19]`** with `bottomRadius` (the lit packer leaves it a zeroed pad; here it is the real field filling the vec3 tail — same trick `packRingUniforms` uses for `planetRadiusRatio`). Then `out[20..22]=camPosLocal`, `out[23]=sunIrradiance`, `out[24]=exposure`, `out[25..27]=0`.
- `topRadius` is implicitly `1.0` in the atmosphere-top mesh frame — no field (document in the struct header). The shell fragment maps its local altitude to the LUT radial axis via `bottomRadius` alone: normalized altitude `h = (r_local − bottomRadius) / (1 − bottomRadius)`.
- `bottomRadius` is the one testable derivation: `planetRadiusKm / atmosphereTopKm` (in `(0,1)`). It is computed at the draw site (Task 6) from `ATMOSPHERE_PARAMS` and passed in; the packer just places it.

**Steps (TDD):**

- [x] Add the `AtmosphereUniforms` struct to `lib/sphere.wesl` with a didactic single-quoted header: sibling-not-overload, the reused lit prefix, `bottomRadius` filling the vec3 tail (cite RingUniforms), the atmosphere-top-unit-sphere convention, `topRadius=1` implicit.
- [x] Write `tests/utils/gpu/packAtmosphereUniforms.test.ts` — a **uniform byte-layout parity** test (a keep-rule category: WGSL↔TS parity, the iOS-silent-drop guard). Pack distinct hand-placed values and assert:
  - [x] `out.length === ATMOSPHERE_UNIFORM_FLOATS`.
  - [x] `out[0..15]` equals the mvp; `out[16..18]` equals `sunDirLocal`.
  - [x] `out[19] === bottomRadius` (the pad-slot override — fails if the packer leaves the lit pad zeroed).
  - [x] `out[20..22] === camPosLocal`, `out[23] === sunIrradiance`, `out[24] === exposure`, `out[25..27] === 0`.
- [x] Implement `packAtmosphereUniforms`.
- [x] `npm test -- packAtmosphereUniforms` green; `npx tsc --noEmit` clean.
- [x] Commit (`sphere.wesl`, `packAtmosphereUniforms.ts`, its test).

---

## Task 3: `atmosphereShellBound` — analytic ray–sphere march bound (the unit-testable core)

**Files:**

- Create `src/utils/math/atmosphereShellBound.ts`
- Create `tests/utils/math/atmosphereShellBound.test.ts`

**Interfaces — Consumes:** `raySphereRoots` (plan D, `src/utils/math/raySphereRoots.ts`) — the shared analytic ray↔sphere quadratic solver. `atmosphereShellBound` is a thin COMPOSITION over it (two calls + clamp logic), NOT a second solver. **Produces:**

```ts
// utils/math/atmosphereShellBound.ts
// The [tNear, tFar] segment of a unit-direction view ray that lies INSIDE the atmosphere shell:
// bounded above by the atmosphere-top sphere (radius topRadius), and clipped where the ray first
// hits the ground sphere (radius bottomRadius) — the surface occludes the far atmosphere. tNear is
// clamped to 0 when the ray origin is inside the shell (spec §8.3 inside/outside robustness). Returns
// null when the ray never enters the atmosphere (misses the top sphere, or the whole shell is behind
// the origin). Sphere centre is the origin; both radii in the same units as rayOriginLocal.
export function atmosphereShellBound(
  rayOriginLocal: Readonly<Vec3>,
  rayDirLocal: Readonly<Vec3>, // MUST be unit length (caller renormalizes after invModel — house trap)
  bottomRadius: number,
  topRadius: number,
): { tNear: number; tFar: number } | null;
```

- This is the **CPU-canonical specification** of the march bound's clamp/occlusion logic; the shell fragment (Task 5) re-expresses the identical logic in WESL (reusing the SAME `lib/util.wesl::raySphere` quadratic, `shaders/lib/util.wesl:134`, that D's `raySphereRoots` mirrors) and is verified visually. The TS home exists because the inside/outside/miss/clamp logic is subtle and a silent bug there = an invisible-or-wrong limb with no other guard — the same justification the `pack*Uniforms` byte-layout tests carry (WGSL↔TS parity, a keep-rule category). The underlying quadratic is NOT duplicated: `atmosphereShellBound` calls D's `raySphereRoots`, and the WESL fragment calls `lib/util.wesl::raySphere` — the composition (clamp) is the only new logic, tested here.
- **Compose over `raySphereRoots` (plan D) — do NOT re-solve the quadratic** (E is its second consumer, the reason it is a shared util). Call `raySphereRoots(rayOriginLocal, rayDirLocal, ORIGIN, topRadius)` for the atmosphere-top sphere and `raySphereRoots(rayOriginLocal, rayDirLocal, ORIGIN, bottomRadius)` for the ground sphere (both centred at the origin). If the top call returns `null` or both its roots are `< 0`, return `null`. Otherwise `tNear = max(0, topNear)`, `tFar = topFar`; then from the ground call, if the ray enters the ground at `tGround > tNear`, clamp `tFar = min(tFar, tGround)` (surface occlusion). Model the WESL-side clamp on `horizonShell/fragment.wesl:37-54`; the quadratic itself lives in `lib/util.wesl:134-143` (WESL) / `raySphereRoots` (TS).

**Steps (TDD):** Write `tests/utils/math/atmosphereShellBound.test.ts` with **hand-computed** expectations (independent of the implementation), using `topRadius=1`, `bottomRadius=0.5`, all rays down the ±z axis for clean numbers:

- [x] `misses the shell entirely` — origin `[0,0,3]`, dir `[0,1,0]` (tangent-away) ⇒ `null`.
- [x] `outside, looking through the planet` — origin `[0,0,3]`, dir `[0,0,-1]` ⇒ `{ tNear: 2, tFar: 2.5 }` (enters top at r=1 → t=2; hits ground at r=0.5 → t=2.5; far clamped to the ground hit, NOT the top far exit at 4).
- [x] `outside, grazing the limb (misses ground)` — origin `[0,0,3]`, dir toward a point on the top sphere that clears the ground (e.g. aimed at `[0.75,0,0]`), asserting `tFar` is the **top-sphere far exit** (no ground clamp) and `tNear` the top-sphere entry — hand-derived.
- [x] `inside the shell, looking up` — origin `[0,0,0.75]` (between ground and top), dir `[0,0,1]` ⇒ `tNear === 0` (clamped) and `tFar === 0.25` (top exit at r=1).
- [x] `shell entirely behind the origin` — origin `[0,0,3]`, dir `[0,0,1]` ⇒ `null` (both top roots negative).
- [x] Implement `atmosphereShellBound` as a composition over `raySphereRoots` (plan D) — two calls (top + ground sphere) + the clamp logic, no fresh quadratic; didactic header explaining the two-sphere bound, the ground-occlusion clamp, the `tNear→0` inside clamp, and the WESL-mirror relationship (the WESL fragment mirrors the clamp; the quadratic is `lib/util.wesl::raySphere` on the GPU side, `raySphereRoots` on the CPU side).
- [x] `npm test -- atmosphereShellBound` green; `npx tsc --noEmit` clean.
- [x] Commit.

---

## Task 4: Atmosphere scattering WESL lib + LUT-bake + sky-view + shell shaders (author + link)

**Files:**

- Create `src/services/gpu/shaders/atmosphere/scattering.wesl` (shared lib: density profiles, Rayleigh + Henyey-Greenstein phase, single-scatter integrand, `raySphere` re-export/use)
- Create `src/services/gpu/shaders/atmosphere/transmittanceLut.wesl` (compute bake)
- Create `src/services/gpu/shaders/atmosphere/multiScatterLut.wesl` (compute bake; samples transmittance)
- Create `src/services/gpu/shaders/atmosphere/skyViewLut.wesl` (compute; per-frame; samples transmittance + multi-scatter)
- Create `src/services/gpu/shaders/atmosphere/shell/vertex.wesl` (proxy sphere; forwards local position)
- Create `src/services/gpu/shaders/atmosphere/shell/fragment.wesl` (analytic bound, LUT lookup, premultiplied-OVER out)

**Interfaces — Produces (WESL, `package::atmosphere::*`):** the six modules above. Contract points only — NO full bodies (the implementer writes them from the Bruneton/Hillaire reference + the constraints):

- `scattering.wesl`: `rayleighPhase(cosTheta) -> f32`; `miePhase(cosTheta, g) -> f32` (Henyey-Greenstein); `densityRayleigh(altitudeKm, scaleHeightKm) -> f32`; `densityMie(...)`; `densityOzone(altitudeKm, centerKm, widthKm) -> f32`. Coefficients arrive via a `ScatteringParams` uniform (the `AtmosphereParams` fields, packed into the bake bind group). Comments single-quoted, literal `package::` imports; reuse `package::lib::util::raySphere` for intersections.
- `transmittanceLut.wesl`: `@compute` writing `texture_storage_2d<rgba16float, write>` at **256×64**; each texel = `(altitude r, view-zenith mu)` → optical-depth-integrated transmittance rgb along the ray to the atmosphere top. View-independent.
- `multiScatterLut.wesl`: `@compute` writing **32×32**; samples the transmittance LUT + ground albedo → isotropic multi-scatter estimate. View-independent.
- `skyViewLut.wesl`: `@compute` writing **~192×108**; parametrized by `(view-zenith, view-azimuth-relative-to-sun)` at the camera's current altitude + sun direction; samples transmittance + multi-scatter LUTs → in-scattered sky radiance. View-dependent (rebaked per frame).
- `shell/vertex.wesl`: binds `AtmosphereUniforms`, applies `clip_from_local(u.mvp, localPos)` (`lib/sphere.wesl:231`), forwards the unit-atmosphere-top **local position** to the fragment.
- `shell/fragment.wesl`: reconstruct the view ray `dir = normalize(localPos − u.camPosLocal)` (**renormalize** — house trap), call the analytic bound (WESL mirror of `atmosphereShellBound`, Task 3: top radius `1.0`, ground radius `u.bottomRadius`, `tNear→0` clamp, miss→`discard`), map the view ray to the sky-view LUT `(zenith, azimuth)` for `inScatter`, and the transmittance LUT for `opacity = 1 − luminance(transmittance)` along the bound. Emit `vec4(inScatter * u.exposure, opacity)` premultiplied for `blend:'over'`. Model the analytic block on `horizonShell/fragment.wesl:26-54`.

- These modules **link but have no consumer yet** — same posture as plan A's `lib/pbr.wesl` authored before its fragment. They compile in Task 5 when the renderer imports them. NOT unit-testable (GPU) — correctness is the Task 6 visual acceptance.

**Steps:**

- [x] Author the six modules with didactic single-quoted headers (the Bruneton/Hillaire model, the LUT parametrizations, why 2D-only for iOS, the premultiplied-OVER contract).
- [x] `npm run build` clean — the `?static` linker resolves every `package::atmosphere::*` + `package::lib::util::raySphere` import. Watch the iOS-strict traps (no `texture_1d`; valid struct layout; storage-texture format legality). If any module fails to link, read `createShaderModuleWithDevLog`'s `getCompilationInfo()` dump.
- [x] Commit (all six WESL files).

---

## Task 5: `atmosphereShellRenderer` — bake LUTs at construction, per-frame sky-view, draw

**Files:**

- Create `src/@types/rendering/AtmosphereShellRenderer.d.ts`
- Create `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`

**Interfaces — Consumes:** the Task 4 shaders, `packAtmosphereUniforms` (Task 2), `AtmosphereParams` (Task 1). **Produces:**

```ts
// @types/rendering/AtmosphereShellRenderer.d.ts
export type AtmosphereShellRenderer = Renderer & {
  // Regenerate the per-frame view-dependent sky-view LUT into this renderer's own texture,
  // via a compute pass recorded into the SAME frame encoder (before the foreground render pass).
  // Modeled on flowFieldRenderer.encodeCompute (flowFieldRenderer.ts:300, encodeFlowCompute.ts:46).
  encodeSkyView(encoder: GPUCommandEncoder, skyViewUniforms: Float32Array): void;
  // Draw the atmosphere-top proxy sphere's back faces into the open foreground:0 pass.
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void; // uniforms = packAtmosphereUniforms(...)
};

// factory
export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' (foreground:0)
  depthFormat: GPUTextureFormat, // 'depth32float' (foreground:0)
  params: AtmosphereParams, // Earth today — bakes ITS transmittance+multi-scatter set
): AtmosphereShellRenderer;
```

- **At construction:** build the three LUT textures (`rgba16float`, `STORAGE_BINDING | TEXTURE_BINDING`, dims from the named consts) + the compute pipelines (explicit bind-group layouts, never `'auto'` — `feedback_webgpu_auto_layout_trap`) + the proxy sphere VBO/IBO (`uvSphereMesh` — the shell is body-agnostic + low-frequency, so pole-pinch is invisible and the cubesphere is unnecessary) + the sampler + the shell render pipeline. Then **bake transmittance, then multi-scatter, ONCE**: record both compute passes into a construction-time encoder and `device.queue.submit` — the multi-scatter pass barriers after transmittance in the same encoder (the interleaving-order lesson `flow/compute.wesl`'s two-pass encoder documents). This is the on-device startup bake (spec §8.2). One-shot, like flow's `seed`.
- **Shell pipeline profile (the `ringRenderer` model with two deltas):** colour = `targetFormat` with straight `blend:'over'` (`srcFactor:'one'`, `dstFactor:'one-minus-src-alpha'`, premultiplied — `ringRenderer.ts:184-197`); depth = `depthFormat`, `depthWriteEnabled:false`, `depthCompare:'less-equal'`; **`cullMode:'front'`** (draw BACK faces — the delta vs the ring's `'none'`), `frontFace:'ccw'`. Shell bind group: `AtmosphereUniforms` (VERTEX+FRAGMENT) + sampler + the three LUT texture views.
- **`encodeSkyView`:** dispatch the sky-view compute into this renderer's sky-view texture, writing `skyViewUniforms` (camera altitude in local units + sun direction + `bottomRadius`) to an internal uniform buffer first. Per-frame. The sky-view bind group samples transmittance + multi-scatter and writes the storage sky-view texture.
- **`draw`:** `queue.writeBuffer` the shell uniform, set pipeline + bind group + proxy VBO/IBO, `drawIndexed`. The single-draw-per-frame `writeBuffer`/`submit` race caveat (`earthRenderer.ts:16-22`) applies — Earth is the sole atmosphere body, so this holds by construction.
- The sky-view internal uniform is packed inline in the renderer (like `horizonShellRenderer.ts:129-183`'s inline f32 writes) — no separate exported packer/test (verified visually).

**Steps:**

- [x] Write `AtmosphereShellRenderer.d.ts` (extends `Renderer`) + the factory. Didactic header: the three-LUT structure, the on-device startup bake (cite `createGenerationPipelines.ts` + `flow/compute.wesl`), the back-face+depth-test rationale, the one-baked-set-in-v1 note, the explicit-BGL trap.
- [x] `npx tsc --noEmit` clean; `npm run build` clean (the shell + bake modules link).
- [x] **iOS/WebKit compile check:** confirm every module built here loads without a `getCompilationInfo` error via `createShaderModuleWithDevLog`; if a storage-texture write is rejected on WebKit, fall back to the fragment render-to-texture bake (Global Constraints iOS note). No visual yet — the layer wires it in Task 6.
- [x] Commit (`AtmosphereShellRenderer.d.ts`, `atmosphereShellRenderer.ts`).

---

## Task 6: `atmosphereShellLayer` row + bootstrap wiring + per-frame sky-view step → visual acceptance

**Files:**

- Create `src/services/engine/frame/passes/atmosphereShellLayer.ts`
- Modify `src/services/engine/frame/passes/index.ts` (register + re-export, LAST in the foreground group)
- Create `src/services/engine/frame/encodeAtmosphereSkyView.ts`
- Modify `src/services/engine/frame/executeFrame.ts` (add a `COMPUTE`-table row)
- Modify `src/services/engine/frame/frameProgram.ts` (add the `{ kind:'compute', name:'atmosphereSkyView' }` step)
- Modify `src/services/engine/phases/initGpu.ts` (construct the renderer)
- Modify `src/@types/engine/handles/EngineGpuHandles.d.ts` (add the handle)

**Interfaces — Consumes:** `atmosphereShellRenderer` (Task 5), `packAtmosphereUniforms` (Task 2), `camPosLocal` (plan A), `ATMOSPHERE_PARAMS` (Task 1), `sunDirLocal` + `composeBodyMvp` (existing). **Produces:** the `atmosphereShellLayer` row + the `encodeAtmosphereSkyView` frame step + the `state.gpu.atmosphereShellRenderer` handle.

- **`atmosphereShellLayer`** — model on `ringsLayer.ts:116-159`:
  - `{ name:'atmosphere-shell', slab:NEAR0, target:'foreground:0', blend:'over' }`; **no `drawPick`** (non-pickable, spec §8.3).
  - `enabled`: handle-first (`state.gpu.atmosphereShellRenderer === null` → false), then `ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC` → false, then `state.data.bodies.earth === null` → false, then `ATMOSPHERE_PARAMS[earth.id] === undefined` → false. (Reuse the `earthLayer.ts:71-98` gate shape; the sub-pixel cull may be reused or the limb kept visible slightly longer — a tunable, note it.)
  - `draw`: compose the proxy MVP scaled to the **atmosphere-top** radius — `composeBodyMvp(view.slab.vp, earth.positionMpc, RENDER_ORIGIN_MPC, params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC, earth.orientation)` (the ring uses `outerRadiusKm` the same way, `ringsLayer.ts:140-147`); `sun = sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation)`; `camLocal = camPosLocal(view.camPos, earth.positionMpc, params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC, earth.orientation)` (camera in atmosphere-top units); `bottomRadius = params.planetRadiusKm / params.atmosphereTopKm`; call `renderer.draw(pass, packAtmosphereUniforms(mvp, sun, camLocal, bottomRadius, sunIrradiance, exposure))`. `sunIrradiance`/`exposure` are named tunables (co-locate with `ATMOSPHERE_PARAMS` or a small `ATMOSPHERE_SHELL_PARAMS` const object, spec §11).
- **`index.ts`:** import + insert `atmosphereShellLayer` as the **LAST** entry in `CONTENT_LAYERS` (after `ringsLayer` and after plan D's `cloud-shell` row — plan E draws last regardless), and add the matching `export`. Extend the module-header draw-order list with row 28 (spec §8.3: drawn last, OVER, no depth write, non-pickable).
- **`encodeAtmosphereSkyView.ts`:** model exactly on `encodeFlowCompute.ts:34-49` — read `state.gpu.atmosphereShellRenderer` + `state.data.bodies.earth` + `ATMOSPHERE_PARAMS`; gate identically to the layer's `enabled`; pack the sky-view uniform (camera altitude in local units + `sunDirLocal` + `bottomRadius`) and call `renderer.encodeSkyView(encoder, skyViewUniforms)`. Runs BEFORE the foreground render pass so the shell samples this frame's LUT.
- **`executeFrame.ts`:** add a row `atmosphereSkyView: (encoder, _ctx, state) => encodeAtmosphereSkyView(encoder, state)` to the **`COMPUTE`** name→fn table (the real map — `executeFrame.ts:78-83`; the `flow` row it mirrors is at `:82`). A `'compute'` step dispatches through this table by name.
- **`frameProgram.ts`:** the `COMPUTE` row only runs if a `'compute'` step names it. Add `{ kind: 'compute', name: 'atmosphereSkyView' }` to the returned `FrameStep[]` (`frameProgram.ts:59-90`) in the compute prelude alongside the existing `{ kind: 'compute', name: 'flow' }` (`:60`). Compute steps run at the FRONT of the program — well before the `foreground:0` render step (`:87`) — so this frame's sky-view LUT is baked before the shell samples it. (`'compute'` steps contribute no timing slot, so `TIMED_SLOTS` is unaffected.)
- **`initGpu.ts`:** construct `state.gpu.atmosphereShellRenderer = createAtmosphereShellRenderer(device, 'rgba16float', 'depth32float', ATMOSPHERE_PARAMS['earth'])` next to the ring renderer (`initGpu.ts:544-552`), matching the `foreground:0` format invariant. Do NOT add it to `isEngineReady` (optional renderer, null-checked at use — the `filamentRenderer`/`horizonShellRenderer` posture, `initGpu.ts:316-325`).
- **`EngineGpuHandles.d.ts`:** add `atmosphereShellRenderer: AtmosphereShellRenderer | null;` + its import, near `ringRenderer` (`EngineGpuHandles.d.ts:425`).

**Steps:**

- [x] Wire the handle + import in `EngineGpuHandles.d.ts`; construct in `initGpu.ts`.
- [x] Add `encodeAtmosphereSkyView.ts` + the `executeFrame.ts` step.
- [x] Add `atmosphereShellLayer.ts`; register LAST + re-export in `index.ts`; extend the draw-order header.
- [x] `npx tsc --noEmit` clean; `npm run build` clean (the WESL links — watch the iOS-strict traps + the shared-encoder frame-drop failure mode).
- [x] **Visual check (the acceptance win, spec §12 row E):** ask the user to fly close to Earth on the already-running dev server (do NOT start/kill it) and confirm: a **blue limb** haloing the day side, a **reddened ring** along the terminator/sunset arc, the atmosphere correctly **occluded by the planet disc** (froxel-over-disc absent = expected), no z-fighting, no whole-frame drop. Explicitly confirm on **iOS/WebKit** (the silent-frame-drop trap): navigation + the limb both render there.
- [x] Commit (stage each path explicitly).

---

## Task 7: entanglement-radar review pass

**Files:** none (review).

- [x] Run the `entanglement-radar` skill over the whole branch diff (house convention). Pay attention to:
  - `atmosphereShellBound` genuinely COMPOSING over plan D's `raySphereRoots` (two calls + clamp) rather than re-solving the quadratic — confirm NO second CPU intersection solver crept in (the quadratic has exactly one CPU home, D's `raySphereRoots`, and one WESL home, `lib/util.wesl::raySphere`; E adds only the clamp/occlusion logic, tested once);
  - `ATMOSPHERE_PARAMS` staying pure data with no per-body branch in the renderer/layer (a new atmosphere body must be a row, not a code path — spec §8.1);
  - the back-face + depth-test profile being expressed once (the renderer pipeline), not re-derived in the layer;
  - the sky-view compute step mirroring `encodeFlowCompute` rather than inventing a parallel frame-hook shape;
  - the `bottomRadius`/atmosphere-top-unit convention being the single home for the radial mapping (not duplicated km-vs-ratio maths across CPU and shader).
- [x] Address findings (or record why deferred); keep the suite green.

---

## Task 8: Final review + verification

**Files:** none.

- [x] Run `npm test` (full suite green), `npm run typecheck` (both tsconfigs), `npm run build`.
- [x] Request code review (`superpowers:requesting-code-review`) covering: the `AtmosphereUniforms` ↔ `packAtmosphereUniforms` byte-layout parity, the `atmosphereShellBound` inside/outside/miss/clamp cases, the on-device bake ordering (transmittance before multi-scatter in one encoder), and the back-face+depth-test+premultiplied-OVER pipeline profile.
- [x] Confirm the DoD before marking the plan done (`/feature-done`), which — as the LAST photoreal-Earth plan — sweeps the backlog + relocates the spec + all A–E plans on merge.

---

## Interfaces produced

Plan E is self-contained (no downstream plan). These are the public shapes it lands.

**`AtmosphereParams`** (`@types/scene/AtmosphereParams.d.ts`) — per-body scattering constants (spec §8.1): `{ planetRadiusKm, atmosphereTopKm, rayleighScatter:Vec3, rayleighScaleHeightKm, mieScatter, mieAbsorption, mieScaleHeightKm, miePhaseG, ozoneAbsorption:Vec3, ozoneCenterKm, ozoneWidthKm, groundAlbedo:Vec3 }`. Registry `ATMOSPHERE_PARAMS: Record<string, AtmosphereParams>` keyed by body id (Earth row today; `planetRadiusKm === SCENE_EARTH.radiusKm`). Mars/Venus/Titan = new rows.

**`AtmosphereUniforms`** (`lib/sphere.wesl`) — 112 bytes / 28 f32:

| f32 idx | bytes    | field                    | notes                                                         |
| ------- | -------- | ------------------------ | ------------------------------------------------------------- |
| 0..15   | 0..63    | `mvp: mat4x4<f32>`       | proxy (atmosphere-top) MVP, column-major                      |
| 16..18  | 64..75   | `sunDirLocal: vec3<f32>` | body-local sun dir                                            |
| 19      | 76..79   | `bottomRadius: f32`      | ground/atmosphere-top ratio; fills the vec3 tail (real field) |
| 20..22  | 80..91   | `camPosLocal: vec3<f32>` | camera in atmosphere-top-radius units                         |
| 23      | 92..95   | `sunIrradiance: f32`     | sun brightness scale (fills vec3 tail)                        |
| 24      | 96..99   | `exposure: f32`          | in-scatter intensity scale                                    |
| 25..27  | 100..111 | `_pad0/1/2: f32`         | rounds to 112 / 16-byte                                       |

Packer: `packAtmosphereUniforms(mvp, sunDirLocal, camPosLocal, bottomRadius, sunIrradiance, exposure) → Float32Array(28)`; `ATMOSPHERE_UNIFORM_FLOATS = 28`. Reuses `packLitBodyUniforms` for the 80-byte lit prefix, overwrites `out[19]` with `bottomRadius`. `topRadius` is implicitly `1.0` (atmosphere-top mesh frame).

**`atmosphereShellBound`** (`utils/math/atmosphereShellBound.ts`) — `atmosphereShellBound(rayOriginLocal: Vec3, rayDirLocal: Vec3, bottomRadius: number, topRadius: number): { tNear, tFar } | null`. Analytic two-sphere march bound: top-sphere `[tNear,tFar]`, ground-hit far clamp, `tNear→0` inside clamp, `null` on miss/behind. **Composes over plan D's `raySphereRoots`** (one call per sphere) — the clamp/occlusion logic is the only new code and the sole thing tested here; the quadratic is D's shared util. The shell fragment re-expresses the same clamp in WESL over `lib/util.wesl::raySphere` (verified visually).

**`AtmosphereShellRenderer`** (`@types/rendering/AtmosphereShellRenderer.d.ts`) — `Renderer & { encodeSkyView(encoder, skyViewUniforms): void; draw(pass, uniforms): void }`. Factory `createAtmosphereShellRenderer(device, targetFormat, depthFormat, params)` bakes transmittance (256×64) + multi-scatter (32×32) once at construction; `encodeSkyView` rebuilds the ~192×108 sky-view LUT per frame; `draw` renders the atmosphere-top proxy back faces (`cullMode:'front'`, depth-test/no-write, premultiplied `blend:'over'`) into `foreground:0`.

**`atmosphereShellLayer`** (`passes/atmosphereShellLayer.ts`) — `{ name:'atmosphere-shell', slab:NEAR0, target:'foreground:0', blend:'over' }`, registered **LAST** in `CONTENT_LAYERS`, depth-test on / write off, **no `drawPick`** (non-pickable). Paired with `encodeAtmosphereSkyView` (the per-frame sky-view compute step: a row in `executeFrame`'s pre-render `COMPUTE` table named by a `{ kind:'compute', name:'atmosphereSkyView' }` step in `frameProgram`, modeled on `encodeFlowCompute`).
