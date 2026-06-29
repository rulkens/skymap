# Zoom to Earth — Plan 01: Precision slice (kept if green)

> **For agentic workers:** this plan is **contract code yes, implementation code no**
> (`docs/superpowers/conventions/plan-style.md`). Code blocks below pin type
> signatures + test assertions; you write the bodies from the current files, the
> spec, and the test names. Cite `path:line`, don't trust pasted snippets.
> The **canonical cross-plan contract** is the locked source of truth for every
> symbol name / path / signature — Plans 02 and 03 consume what this plan
> produces under the same names. Do not rename or "improve" them. If current code
> makes a contract item impossible, the task says **STOP and report** rather than
> diverging silently.

**Spec:** `docs/superpowers/specs/2026-06-29-zoom-to-earth-true-scale-design.md` — scope is **§10 Phase 1**.
**Cross-plan contract:** the locked interface doc shared by Plans 01/02/03 (precision math seams + sphere mesh + foreground pass sections).
**Plan style (OVERRIDES upstream writing-plans):** `docs/superpowers/conventions/plan-style.md`.

## Goal

Prove the hard part of true-scale zoom **in skymap's real renderer**: f64 CPU
matrix truth narrowed to f32 only at the GPU boundary, an opaque depth-tested
foreground pass composited OVER the additive galaxy backdrop, and a min-distance
clamp lowered enough to reach Earth-surface scale. The visible payoff is a plain
**debug sphere** seeded at Earth's true size and position that you can fly down
to from the galaxy view with no jitter, the galaxy backdrop intact behind it.

This is the de-risk slice. **It stays if green** — Plan 02 (Earth + anchors) and
Plan 03 (LOD + polish) build directly on every seam created here.

## Architecture

- **f64 truth on the CPU, f32 only at the GPU boundary.** The foreground
  view-projection is composed in f64 via wgpu-matrix's `mat4d` namespace
  (relative to a `renderOrigin` fixed at the Sun), and each body's full
  `proj·view·model` is composed in f64 **before** narrowing to f32. Composing
  before narrowing is what dodges the catastrophic cancellation that would
  otherwise lose an Earth radius at 1 AU (spec §9).
- **An opaque foreground pass.** The main scene is depthless/additive
  (`postProcess.ts:48-62`), so opaque self-occluding solids can't live in the
  HDR mega-pass. We add a new full-res offscreen target (color + its own depth)
  rendered before composite, then blend it **OVER** the HDR target — mirroring
  the `volumeOffscreen` → `volumeUpsample` template, except OVER instead of
  additive. It slots into `renderFrame.ts` AFTER the HDR mega-pass and BEFORE
  `postProcess.draw`, so the foreground stays inside the HDR/tonemap pipeline
  (spec §12).
- **Unit conversions in one file** (`SCALE_UNITS`); a unit sphere mesh scaled by
  `radiusMpc` in f64 (one position unit — Mpc — across all bodies, no per-kind
  unit braid).

## Tech Stack

TS + Vitest for the pure-math + mesh seams; raw WebGPU + WESL (`?static` linker)
for the foreground pass / sphere lib / debug-sphere renderer. f64 matrix math via
wgpu-matrix `mat4d`/`vec3d` (already a dependency since PR #382; verified present:
`mat4d`, `vec3d` both export). No new deps.

## Global Constraints

House rules (CLAUDE.md / the contract) — these OVERRIDE defaults:

- **One symbol per file** in `src/utils/` and `src/@types/` (filename = the
  exported symbol's name). New: `narrowMat4`, `computeForegroundViewProj`,
  `composeBodyMvp`, `uvSphereMesh`, `UvSphereMesh`. `scaleUnits.ts` and
  `renderOrigin.ts` live under `src/data/` (data definitions, not utils — they
  export a single const each, matching the `sources.ts`-area style).
- **`type` aliases, never `interface`.**
- **`Vec3`/`Vec2` aliases** (`src/@types/math/Vec3.d.ts`, `Vec2.d.ts`) — never
  raw `[number, number, number]` tuples.
- **No barrels; deep relative imports.**
- **Didactic, timeless comments** — explain *why* and *what the alternative was*;
  no dates / PR refs / "pre-X" history in comments. Match the multi-paragraph
  module-header style of the files you cite.
- **WESL** (`wesl-shaders` skill): no backticks in comments, literal `package::`
  prefix, `?static` TS-side import.
- **Suite stays green.** Each task ends with its named tests passing; the final
  task gates on `npm run typecheck` (both tsconfigs) + `npm test` (full suite).
- **VISUAL gate.** Acceptance §10.1 — *stable, jitter-free zoom from the galaxy
  view down to the sphere, backdrop intact* — is a VISUAL property, user-verified
  on the dev server. Automated tests cover the math + mesh + composite plumbing
  only. The final task explicitly calls out what needs on-screen confirmation; an
  unattended executor must STOP and report rather than claim visual success.

### Contract conflicts flagged for the implementer

- **`encodeForegroundPass` deps param.** The contract types it `deps: RenderDeps`
  "to match the encodeHdr* siblings." The real sibling type is **`PassDeps`**
  (`src/@types/engine/frame/PassDeps.d.ts`, threaded as `deps` through
  `encodeHdrSingle`/`encodeHdrSplit` and built in `renderFrame.ts:115`). There is
  no `RenderDeps` type. **Use `PassDeps`** (or, if no renderer ref is needed, the
  narrower set actually read). Task 9 covers this; do not invent a `RenderDeps`.
- **Composite invocation site.** The composite is NOT an `HDR_PASSES` entry
  (those target the HDR view with additive blend; see `renderFrame.ts:54-62` on
  why tone-map / overlay outliers stay inline). The foreground pass is invoked
  **inline from `renderFrame.ts`** between the HDR mega-pass and
  `postProcess.draw`, like tone-map and `encodeUiOverlay`. Task 9 wires it there.
- **`ReadyFrameContext` is built via `as unknown as` casts in existing tests**
  (per the contract note). Those keep compiling when fields are added. New
  foreground tests populate the four new fields for real.

---

## Task 1 — `SCALE_UNITS` + `RENDER_ORIGIN_MPC`

**Files:** `src/data/scaleUnits.ts` (create), `src/data/renderOrigin.ts` (create),
`tests/data/scaleUnits.test.ts` (create), `tests/data/renderOrigin.test.ts` (create).

**Interfaces:**
- _Consumes:_ `PC_TO_LY` from `src/utils/math/constants.ts:82` (single source of
  truth — do NOT redefine it); `Vec3` from `src/@types/math/Vec3`.
- _Produces:_
  ```ts
  // src/data/scaleUnits.ts
  export const SCALE_UNITS: {
    readonly KM_TO_MPC: number;
    readonly AU_TO_MPC: number;
    readonly PC_TO_MPC: number;   // 1e-6 (exact)
    readonly KPC_TO_MPC: number;  // 1e-3
    readonly MPC_TO_MPC: number;  // 1
    readonly GPC_TO_MPC: number;  // 1e3
    readonly LY_TO_MPC: number;   // copy/labels only
  };
  // src/data/renderOrigin.ts
  export const RENDER_ORIGIN_MPC: Readonly<Vec3>; // = [0, 0, 0] (Sun)
  ```

Derivation (named locals, no inlined magic numbers): `PC_IN_KM = 3.0856775814913673e13`,
`AU_IN_KM = 1.495978707e8`; `PC_TO_MPC = 1e-6`; `KPC_TO_MPC = 1e-3`; `MPC_TO_MPC = 1`;
`GPC_TO_MPC = 1e3`; `KM_TO_MPC = PC_TO_MPC / PC_IN_KM`; `AU_TO_MPC = AU_IN_KM * KM_TO_MPC`;
`LY_TO_MPC = PC_TO_MPC / PC_TO_LY`.

`renderOrigin.ts` carries a didactic docblock: the single Mpc point per-object
matrix math is expressed relative to; fixed at the Sun for this feature; the named
extension point where a future moving origin plugs in. Do NOT build
threshold-rebasing (YAGNI — spec §3).

- [ ] Add `scaleUnits.ts` with named-local derivation + a didactic docblock
  (native-units-per-body rationale, spec §3 / §8).
- [ ] Add `renderOrigin.ts` (`[0,0,0]`, `Readonly<Vec3>`, extension-point docblock).
- [ ] Test (`scaleUnits.test.ts`): each constant snapshots to its computed value
  with tight tolerance — `expect(SCALE_UNITS.PC_TO_MPC).toBe(1e-6)`,
  `KPC_TO_MPC` `toBe(1e-3)`, `MPC_TO_MPC` `toBe(1)`, `GPC_TO_MPC` `toBe(1e3)`;
  `KM_TO_MPC` and `AU_TO_MPC` `toBeCloseTo` their computed values;
  `LY_TO_MPC` `toBeCloseTo(1e-6 / 3.26156)`.
- [ ] Test internal consistency: `KPC_TO_MPC / PC_TO_MPC` `toBeCloseTo(1000)`;
  `GPC_TO_MPC / MPC_TO_MPC` `toBe(1000)`; `AU_TO_MPC / KM_TO_MPC` `toBeCloseTo(AU_IN_KM)`
  (where `AU_IN_KM` is asserted as `1.495978707e8`).
- [ ] Test (`renderOrigin.test.ts`): `RENDER_ORIGIN_MPC` equals `[0, 0, 0]`.
- [ ] `npm test -- scaleUnits renderOrigin` → green. Commit.

## Task 2 — `narrowMat4`

**Files:** `src/utils/math/narrowMat4.ts` (create), `tests/utils/math/narrowMat4.test.ts` (create).

**Interfaces:**
- _Produces:_ `export function narrowMat4(m: Float64Array): Float32Array;`
  (`new Float32Array(m)`, length 16 — the f64→f32 GPU-upload boundary).

- [ ] Add `narrowMat4.ts` — single function, didactic docblock (why narrow only
  at the boundary; the f64 compose itself uses `mat4d`).
- [ ] Test `narrows a known f64 matrix element-wise to f32`: build a
  `Float64Array(16)` of known values, assert the result is a `Float32Array`,
  `length === 16`, and each element `toBeCloseTo` the f64 input (f32 precision).
- [ ] Test `preserves a value that is exactly representable in f32` (e.g. `0.5`,
  `2`) — `toBe`, not `toBeCloseTo`.
- [ ] `npm test -- narrowMat4` → green. Commit.

## Task 3 — `computeForegroundViewProj`

**Files:** `src/utils/camera/computeForegroundViewProj.ts` (create),
`tests/utils/camera/computeForegroundViewProj.test.ts` (create).

**Interfaces:**
- _Consumes:_ `mat4d` from `'wgpu-matrix'`; `narrowMat4` (Task 2) — in the test
  only, to bridge to the f32 path; `Vec3`; `computeViewProj`
  (`src/utils/camera/computeViewProj.ts`) and `createOrbitCamera`
  (`src/utils/camera/createOrbitCamera.ts`) in the test.
- _Produces:_
  ```ts
  export function computeForegroundViewProj(input: {
    readonly eyeMpc: Readonly<Vec3>;
    readonly targetMpc: Readonly<Vec3>;
    readonly up: Readonly<Vec3>;
    readonly renderOrigin: Readonly<Vec3>;
    readonly fovYRad: number;
    readonly aspect: number;
    readonly near: number;   // foreground frustum, Mpc
    readonly far: number;    // foreground frustum, Mpc
  }): Float64Array;          // f64 proj·view, RELATIVE to renderOrigin
  ```

Body (f64 via `mat4d`): `view = mat4d.lookAt(eye − origin, target − origin, up)`;
`proj = mat4d.perspective(fovYRad, aspect, near, far)` (ZO by default — matches
`computeViewProj`, see `computeViewProj.ts:124-126`); return `mat4d.multiply(proj, view)`.
Subtract `renderOrigin` from `eye`/`target` in f64 before `lookAt`.

- [ ] Add `computeForegroundViewProj.ts` — didactic docblock paralleling
  `computeViewProj.ts`'s `proj * view` / ZO-depth explanation, but for the f64
  `mat4d` path and the renderOrigin-relative subtraction.
- [ ] Test `with renderOrigin=[0,0,0] the narrowed result ≈ computeViewProj`:
  build a camera via `createOrbitCamera` (matching `orbitCamera.test.ts:9-18`
  fields); call `computeForegroundViewProj` with that camera's `eye`/`target`/`up`
  (= `[0,1,0]`)/`fovYRad`/`aspect`/`near`/`far` and `renderOrigin=[0,0,0]`; narrow
  via `narrowMat4`; assert every element `toBeCloseTo` `computeViewProj(cam)`'s
  element (f32 tolerance). This is the sanity bridge to the existing f32 path.
- [ ] Test `eye/target far from origin but origin near them yields a finite,
  well-conditioned matrix`: place eye/target ~`1 * SCALE_UNITS.AU_TO_MPC` from the
  world origin with `renderOrigin` set to a nearby point (so eye−origin is small);
  assert every result element `Number.isFinite` and the matrix is non-degenerate
  (e.g. a known surface point projects to finite NDC after divide).
- [ ] `npm test -- computeForegroundViewProj` → green. Commit.

## Task 4 — `composeBodyMvp` + catastrophic-cancellation guard (the headline de-risk)

**Files:** `src/utils/camera/composeBodyMvp.ts` (create),
`tests/utils/camera/composeBodyMvp.test.ts` (create).

**Interfaces:**
- _Consumes:_ `mat4d` from `'wgpu-matrix'`; `narrowMat4` (Task 2);
  `computeForegroundViewProj` (Task 3) and `SCALE_UNITS` (Task 1) in the test;
  `mat4`/`vec4` from `'wgpu-matrix'` in the test for the negative-case comparison.
- _Produces:_
  ```ts
  export function composeBodyMvp(
    foregroundVp: Float64Array,        // from computeForegroundViewProj
    bodyPosMpc: Readonly<Vec3>,        // absolute heliocentric Mpc (f64-valued)
    renderOrigin: Readonly<Vec3>,
    radiusMpc: number,                 // radiusKm * SCALE_UNITS.KM_TO_MPC
  ): Float32Array;                     // narrowed proj·view·model for GPU upload
  ```

Body (f64 via `mat4d`): `model = translate(bodyPosMpc − renderOrigin) · scale([r,r,r])`
applied to a UNIT sphere; `mvp64 = mat4d.multiply(foregroundVp, model)`; return
`narrowMat4(mvp64)`. Composing the full proj·view·model in f64 BEFORE narrowing is
the cancellation dodge; geometry is a unit sphere scaled by `radiusMpc` in f64, so
one unit (Mpc) across all bodies — no per-kind native-unit braid. Didactic docblock
must state this (spec §3 / §9).

- [ ] Add `composeBodyMvp.ts` with the docblock above.
- [ ] **Guard test (positive case)** `an Earth-radius body at 1 AU survives
  compose-then-narrow with sub-metre error`: radius `6371 * SCALE_UNITS.KM_TO_MPC`,
  body at `[1 * SCALE_UNITS.AU_TO_MPC, 0, 0]`, `renderOrigin = RENDER_ORIGIN_MPC`;
  build `foregroundVp` via `computeForegroundViewProj` with a camera ~2 Earth-radii
  from the body looking at it (adaptive near/far chosen so the body fills the
  frustum — e.g. `near = radiusMpc * 0.1`, `far = radiusMpc * 100`); transform the
  unit-sphere surface vertex `[1,0,0]` (in body-local space, i.e. multiply the MVP
  by `[1,0,0,1]`) and assert the on-screen / clip-space position is correct to
  **sub-metre** — i.e. the positional error is well under `radiusMpc`
  (`1e-3 km * KM_TO_MPC` as the tolerance budget). Compute the error against the
  same point composed in **pure f64** (no narrow) as ground truth.
- [ ] **Guard test (negative case)** `narrowing view and model separately blows
  past a whole Earth radius`: narrow `foregroundVp` to f32 AND narrow the model
  matrix to f32 SEPARATELY, multiply in f32 (`mat4.multiply`), transform the same
  `[1,0,0,1]`; assert the positional error vs the f64 ground truth **exceeds one
  Earth radius** (`> radiusMpc`). This proves the guard actually guards — if this
  assertion ever fails, the cancellation isn't being triggered and the positive
  test is vacuous.
- [ ] `npm test -- composeBodyMvp` → green. Commit.

## Task 5 — `uvSphereMesh`

**Files:** `src/@types/math/UvSphereMesh.d.ts` (create),
`src/utils/math/uvSphereMesh.ts` (create),
`tests/utils/math/uvSphereMesh.test.ts` (create).

**Interfaces:**
- _Produces:_
  ```ts
  // src/@types/math/UvSphereMesh.d.ts
  export type UvSphereMesh = {
    readonly positions: Float32Array; // 3 per vertex, UNIT radius, centred at origin
    readonly uvs: Float32Array;       // 2 per vertex, equirectangular (u=lon/2π, v=lat)
    readonly indices: Uint16Array;    // triangle list, CCW = outward-facing
  };
  // src/utils/math/uvSphereMesh.ts
  export function uvSphereMesh(segments: number, rings: number): UvSphereMesh;
  ```
  (One type per `@types` file — `UvSphereMesh` gets its own file; `uvSphereMesh`
  the function gets its own util file.)

- [ ] Add `UvSphereMesh.d.ts` (type only) and `uvSphereMesh.ts` (function only),
  each with a didactic docblock (why a UV sphere, equirectangular uv mapping so
  Plan 02's Blue Marble texture maps cleanly, CCW = outward winding).
- [ ] Test `vertex count is (segments+1)*(rings+1)` (assert `positions.length / 3`).
- [ ] Test `every position is unit length` — for each vertex `Math.hypot(x,y,z)`
  `toBeCloseTo(1)`.
- [ ] Test `index count is segments*rings*6` (triangle-list).
- [ ] Test `winding is outward-facing` — spot-check one triangle: its geometric
  normal (cross of two edges) dotted with the triangle centroid is `> 0` (normal
  points away from origin).
- [ ] Test `uv ranges are within [0,1]` — every `u` and `v` `toBeGreaterThanOrEqual(0)`
  and `toBeLessThanOrEqual(1)`.
- [ ] `npm test -- uvSphereMesh` → green. Commit.

## Task 6 — Foreground offscreen target + composite pass

> GPU-resource files: not unit-testable headless. The "test" here is
> `npm run typecheck` clean + a structural assertion where feasible (factory
> returns the contracted shape) + the visual gate at Task 12. Say so; do NOT
> invent fake WebGPU unit tests.

**Files:** `src/@types/rendering/ForegroundOffscreen.d.ts` (create),
`src/@types/rendering/ForegroundComposite.d.ts` (create),
`src/services/gpu/passes/foregroundOffscreen.ts` (create),
`src/services/gpu/passes/foregroundComposite.ts` (create),
`src/services/gpu/shaders/foregroundComposite/{vertex,fragment}.wesl` (create).

**Interfaces:**
- _Consumes:_ `Size` from `src/@types/rendering/Size` (cite — `volumeOffscreen.ts:47`
  imports it the same way); `createShaderModuleWithDevLog`
  (`src/services/gpu/shaderCompileLogger.ts`); `?static` WESL imports.
- _Produces:_
  ```ts
  // ForegroundOffscreen.d.ts
  export type ForegroundOffscreen = {
    readonly colorView: GPUTextureView; // rgba16float (matches HDR)
    readonly depthView: GPUTextureView; // depth32float (wide adaptive near/far)
    resize(size: Size): void;
    destroy(): void;
  };
  // foregroundOffscreen.ts
  export function createForegroundOffscreen(device: GPUDevice, size: Size): ForegroundOffscreen;
  // ForegroundComposite.d.ts
  export type ForegroundComposite = {
    draw(pass: GPURenderPassEncoder, src: GPUTextureView): void; // composites src OVER current target
    destroy(): void;
  };
  // foregroundComposite.ts
  export function createForegroundComposite(device: GPUDevice, hdrFormat: GPUTextureFormat): ForegroundComposite;
  ```

`foregroundOffscreen` mirrors `volumeOffscreen.ts:60-93`'s allocate/resize/destroy
shape but at **FULL res** (no `VOLUME_RENDER_SCALE_DIVISOR`) and allocates BOTH a
`rgba16float` color texture (`RENDER_ATTACHMENT | TEXTURE_BINDING`) and a
`depth32float` depth texture (`RENDER_ATTACHMENT`). Depth32float is the spec §12
choice (precision across the adaptive near/far spread).

`foregroundComposite` mirrors `volumeUpsample.ts:45-119`'s factory/bind-group/draw
shape (fullscreen triangle sampling `src`, blending into the HDR target) **except
the blend is OVER, not additive**: color `{ srcFactor: 'src-alpha', dstFactor:
'one-minus-src-alpha', operation: 'add' }`, alpha standard over. The module
docblock MUST call out the blend difference vs `volumeUpsample` explicitly (cite
`volumeUpsample.ts:80-88`). The fragment shader samples the foreground color and
returns it premultiplied-or-straight per the chosen blend (document which).

- [ ] Add the two `@types` files (one type each) + factories + the two WESL files,
  each with didactic docblocks. WESL: follow `wesl-shaders` conventions (no
  backticks, `?static`); the composite shaders mirror `volumeUpsample/{vertex,
  fragment}.wesl` structurally.
- [ ] Structural assertion (the closest to a headless test): no WebGPU unit test;
  rely on `npm run typecheck` proving the factory return shapes satisfy the
  contracted types. Note the visual gate covers correctness.
- [ ] `npm run typecheck` → clean. Commit.

## Task 7 — Sphere WESL lib + debug-sphere shaders

> Shader files — typecheck + visual gate, no headless unit test.

**Files:** `src/services/gpu/shaders/lib/sphere.wesl` (create),
`src/services/gpu/shaders/debugSphere/vertex.wesl` (create),
`src/services/gpu/shaders/debugSphere/fragment.wesl` (create).

**Interfaces:**
- _Consumes:_ WESL `package::` lib pattern — cite `lib/camera.wesl` (the
  `CameraUniforms` prefix + `worldToClip` helper precedent, `camera.wesl:77-103`)
  and how `pointRenderer.ts:44-46` imports `?static` and `shaders/points/*.wesl`
  imports `package::lib::*`.
- _Produces (WESL):_
  ```wesl
  // lib/sphere.wesl
  struct SphereUniforms { mvp: mat4x4<f32> };
  fn clip_from_local(mvp: mat4x4<f32>, localPos: vec3<f32>) -> vec4<f32>; // mvp * vec4(localPos, 1.0)
  ```
  (Pass `mvp` as a parameter, not a captured binding — WESL has no global state;
  cite `camera.wesl:84-103` `worldToClip` for the same "pass cam, don't capture"
  rationale.)

The `SphereUniforms` struct is `{ mvp: mat4x4<f32> }` (one 64-byte matrix — the
output of `composeBodyMvp`). `debugSphere/vertex.wesl` reads the unit-sphere
position attribute + the per-draw `mvp` uniform and calls `clip_from_local`.
`debugSphere/fragment.wesl` is a plain flat-shaded / lat-long-gridded sphere — just
enough to eyeball roundness + jitter (a simple normal-based shade or uv-grid is
fine). No backticks in comments; literal `package::` prefix; reference identifiers
with single quotes in comments.

- [ ] Add `lib/sphere.wesl` (struct + `clip_from_local` helper, didactic header in
  the `lib/camera.wesl` voice).
- [ ] Add `debugSphere/vertex.wesl` + `debugSphere/fragment.wesl`.
- [ ] `npm run typecheck` → clean (the `?static` linker resolves the imports at
  build/typecheck time). Commit.

## Task 8 — `DebugSphereRenderer`

> GPU-resource renderer — typecheck + structural assertion + visual gate.

**Files:** `src/@types/rendering/DebugSphereRenderer.d.ts` (create),
`src/services/gpu/renderers/debugSphereRenderer.ts` (create).

**Interfaces:**
- _Consumes:_ `Renderer` (`src/@types/rendering/Renderer.d.ts` — `label` + `destroy`);
  `uvSphereMesh` (Task 5); `lib/sphere.wesl` + `debugSphere/*.wesl` via `?static`
  (Task 7); `createShaderModuleWithDevLog`; the `pointRenderer.ts` factory
  convention (cite `pointRenderer.ts:1-55` for the factory + `?static` shape).
- _Produces:_
  ```ts
  // DebugSphereRenderer.d.ts
  export type DebugSphereRenderer = Renderer & {
    draw(pass: GPURenderPassEncoder, mvp: Float32Array): void;
  };
  // debugSphereRenderer.ts
  export function createDebugSphereRenderer(
    device: GPUDevice, colorFormat: GPUTextureFormat, depthFormat: GPUTextureFormat,
  ): DebugSphereRenderer;
  ```

`satisfies Renderer` (has `label` + `destroy`). Uploads `uvSphereMesh` once
(positions VBO + index IBO); the pipeline declares `depthStencil` against
`depthFormat` (`depthWriteEnabled: true`, `depthCompare: 'less'`) and the color
target against `colorFormat`. Per draw, writes the f32 `mvp` into a
`SphereUniforms` uniform buffer and draws indexed. Plan 02 decides whether to
retire this once `earthRenderer` exists (call it out there, not here).

- [ ] Add `DebugSphereRenderer.d.ts` + `debugSphereRenderer.ts` with a didactic
  docblock (what it's for: eyeball roundness + jitter at Earth scale; the shared
  `lib/sphere.wesl`; the foreground pass owns the depth attachment).
- [ ] Structural note: no headless WebGPU test; `npm run typecheck` proves
  `createDebugSphereRenderer`'s return `satisfies DebugSphereRenderer` and the
  `Renderer` contract. Visual gate covers correctness.
- [ ] `npm run typecheck` → clean. Commit.

## Task 9 — `ReadyFrameContext` + `frameContext` foreground fields

**Files:** `src/@types/engine/frame/ReadyFrameContext.d.ts` (modify),
`src/services/engine/frame/frameContext.ts` (modify),
`tests/services/engine/frame/frameContext.test.ts` (modify or add — check whether
one exists first).

**Interfaces:**
- _Consumes:_ `computeForegroundViewProj` (Task 3), `RENDER_ORIGIN_MPC` (Task 1),
  `Vec3`.
- _Produces:_ four new readonly fields on `ReadyFrameContext`, populated in
  `deriveFrameContext` (`frameContext.ts:163-178` return literal):
  ```ts
  readonly foregroundVp: Float64Array;     // computeForegroundViewProj output
  readonly foregroundNear: number;         // Mpc — Plan 01: simple heuristic; Plan 03: adaptive
  readonly foregroundFar: number;          // Mpc
  readonly renderOrigin: Readonly<Vec3>;   // RENDER_ORIGIN_MPC for now
  ```

**Plan 01 uses a simple FIXED/heuristic near/far** — e.g. constants chosen wide
enough to contain Earth-at-true-scale through the descent, or a coarse function of
`cam` distance. **Plan 03 makes them adaptive** (`foregroundFrustum.ts`); say so in
the docblock so Plan 03 has a named seam to replace. `deriveFrameContext` calls
`computeForegroundViewProj` once (using `cam` eye/target/up + `fovYRad`/`aspect` +
the chosen near/far + `RENDER_ORIGIN_MPC`) and stores the result on `ctx`.

NOTE (contract): existing tests build `ReadyFrameContext` via
`as unknown as ReadyFrameContext` casts (e.g. `produceStructureMarkers.test.ts`,
`labelDirectorSubsystem.test.ts`) — those keep compiling. Only `frameContext`'s own
test (if present) populates the new fields for real.

- [ ] Add the four fields to `ReadyFrameContext.d.ts` with per-field didactic
  comments (matching the file's existing field-comment style; note the Plan 03
  adaptive seam on `foregroundNear`/`foregroundFar`).
- [ ] Populate them in `deriveFrameContext`'s return literal; add the
  `computeForegroundViewProj` call alongside the existing `computeViewProj(cam)`
  (`frameContext.ts:142`).
- [ ] Test (frameContext's test): `deriveFrameContext populates the foreground
  fields when ready` — drive `deriveFrameContext` with a ready state + a known
  pose/projection; assert `ctx.foregroundVp` is a `Float64Array` length 16,
  `ctx.renderOrigin` equals `RENDER_ORIGIN_MPC`, and `foregroundNear < foregroundFar`,
  both `> 0`. If no frameContext test exists, add a minimal one mirroring the
  ready-state setup other engine/frame tests use (check the harness first).
- [ ] `npm test -- frameContext` → green; `npm run typecheck` → clean. Commit.

## Task 10 — `encodeForegroundPass` + `renderFrame` slot

> Encoder-plumbing — typecheck + the visual gate. A structural test of the slot
> ordering is feasible only by reading; assert via typecheck + a code-read note.

**Files:** `src/services/engine/frame/encodeForegroundPass.ts` (create),
`src/services/engine/frame/renderFrame.ts` (modify).

**Interfaces:**
- _Consumes:_ `ReadyFrameContext` (Task 9 fields), `EngineState`, `PassDeps`
  (the real sibling type — see the Contract-conflicts note; cite
  `encodeHdrSingle.ts:43-48` for the sibling param shape), `composeBodyMvp`
  (Task 4), the `debugSphereRenderer` / `foregroundOffscreen` / `foregroundComposite`
  handles off `state.gpu.*` (Task 11), and the seeded debug body (Task 12 /
  `state.data.bodies` — for Plan 01 a single hard-seeded Earth-scale sphere is
  enough; the full bodies store is Plan 02). For Plan 01 the body position/radius
  may come from a small seed const introduced in Task 12.
- _Produces:_
  ```ts
  export function encodeForegroundPass(
    encoder: GPUCommandEncoder,
    ctx: ReadyFrameContext,
    state: EngineState,
    deps: PassDeps,   // NOT RenderDeps — see Contract conflicts
  ): void;
  ```

Two steps on the SHARED encoder (cite `volumeOffscreen`/`volumeUpsample` as the
two-step template):
1. Begin a render pass into `foregroundOffscreen` — color load `clear` to
   `(0,0,0,0)`, depth load `clear` to `1`, `depthWriteEnabled: true`,
   `depthCompare: 'less'`. Draw every foreground body renderer (Plan 01: the
   debug sphere) with per-body MVP from `composeBodyMvp(ctx.foregroundVp,
   bodyPosMpc, ctx.renderOrigin, radiusMpc)`. End the pass.
2. Begin a pass into the HDR target (`ctx.postProcess.view`) and run
   `foregroundComposite.draw(pass, foregroundOffscreen.colorView)`. End.

Self-gate on the nullable handles (`debugSphereRenderer` / `foregroundOffscreen` /
`foregroundComposite` non-null), mirroring how other passes null-check.

**renderFrame slot:** insert `encodeForegroundPass(encoder, ctx, state, deps)`
AFTER the HDR mega-pass and BEFORE `postProcess.draw` in BOTH branches of
`renderFrame.ts` — the timing branch (`renderFrame.ts:153-171`, after
`encodeHdrSplit`, before `ctx.postProcess.draw`) and the production branch
(`renderFrame.ts:172-176`, after `encodeHdrSingle`, before `ctx.postProcess.draw`).
This keeps Earth inside the HDR/tonemap pipeline (spec §12). It is NOT an
`HDR_PASSES` entry (see Contract conflicts + `renderFrame.ts:54-62`).

- [ ] Add `encodeForegroundPass.ts` with a didactic docblock (two-step offscreen
  → OVER-composite; why its own depth; why between HDR and tone-map).
- [ ] Insert the call in both `renderFrame` branches at the cited insertion points.
- [ ] `npm run typecheck` → clean; run the existing `renderFrame`/engine-frame
  tests if any (`npm test -- renderFrame`) to confirm nothing regressed. Commit.

## Task 11 — `EngineGpuHandles` slots + `initGpu` construction + teardown

**Files:** `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify),
`src/services/engine/phases/initGpu.ts` (modify),
the engine `destroy()` path (find it — likely `engine.ts` or a `teardown`/`destroy`
helper; grep for where `state.gpu.volumeUpsample` / `postProcess` are released).

**Interfaces:**
- _Consumes:_ `ForegroundOffscreen` (Task 6), `ForegroundComposite` (Task 6),
  `DebugSphereRenderer` (Task 8); the factories `createForegroundOffscreen` /
  `createForegroundComposite` / `createDebugSphereRenderer`.
- _Produces:_ three new nullable slots on `EngineGpuHandles` (per the existing
  null-until-`initGpu` lifecycle rule, `EngineGpuHandles.d.ts:11-40`):
  ```ts
  foregroundOffscreen: ForegroundOffscreen | null;     // Plan 01
  foregroundComposite: ForegroundComposite | null;     // Plan 01
  debugSphereRenderer: DebugSphereRenderer | null;     // Plan 01
  ```
  (Plan 02 adds `earthRenderer`/`planetRenderer`/`starRenderer`/`starPointRenderer`
  — do NOT add those here.)

`initGpu` constructs all three after the existing renderer block (cite
`initGpu.ts:144-160` for the `createVolumeOffscreen` + `createPointRenderer`
construction precedent, and `initGpu.ts:329-346` for the
`volumeFieldRenderer`/`volumeUpsample` precedent). `foregroundOffscreen` takes
`{ width: canvas.width, height: canvas.height }`; the renderers take
`'rgba16float'` (color) + `'depth32float'` (depth) / the swap format as their
factories require. **Resize:** wire `foregroundOffscreen.resize(...)` into the same
resize branch that resizes `postProcess` / `volumeOffscreen` (find it — grep for
`volumeOffscreen.resize` or `postProcess.resize`). **Teardown:** add all three to
the `destroy()` chain so they're released and re-nulled (cite the existing
`destroy()` site that nulls `volumeUpsample`/`postProcess`).

- [ ] Add the three nullable slots to `EngineGpuHandles.d.ts` with per-field
  didactic comments matching the file's style (Plan 01 tag; nullable lifecycle).
- [ ] Construct all three in `initGpu.ts` after the existing renderer block;
  assign to `state.gpu.*`.
- [ ] Wire `foregroundOffscreen.resize` into the resize branch alongside the other
  offscreen targets.
- [ ] Add all three to the `destroy()` chain (release + re-null).
- [ ] `npm run typecheck` → clean; `npm test` (the engine bootstrap / handles
  tests, if any) → green. Commit.

## Task 12 — Lower `MIN_DISTANCE_MPC` + seed the debug sphere

**Files:** `src/utils/camera/clampDistance.ts` (modify),
`tests/utils/camera/clampDistance.test.ts` (modify or add — check first),
plus a small Plan-01 seed for the debug body (a const near `encodeForegroundPass`,
OR `src/data/bodies/sceneBodies.ts` if you prefer to introduce the seed file early
— but Plan 02 owns the full `BodyStore`; keep Plan 01's seed minimal and clearly
marked as a Plan-01 stand-in so Plan 02 can replace it).

**Interfaces:**
- _Consumes:_ `SCALE_UNITS` (Task 1) to express the new floor + the seed in human
  units.
- _Produces:_ a lowered `MIN_DISTANCE_MPC` (spec §7: new floor ~`1e-17` Mpc ≈ a
  few hundred km, so the camera can reach Earth-surface scale). Keep `clampDistance`
  + the docblock rationale; UPDATE the docblock for the new floor and note the
  focus-tween interaction (the old 0.05 floor sat below the focus-on tween's end
  distance — `clampDistance.ts:12-26`; the new far-lower floor must NOT ratchet the
  focus tween, so confirm the focus-on end distance still clamps to itself and
  document it).

The debug sphere is seeded at **Earth's true size and position** so the slice has
something to fly to: radius `6371 * SCALE_UNITS.KM_TO_MPC`, at a plausible fixed
Earth position (e.g. `[1 * SCALE_UNITS.AU_TO_MPC, 0, 0]` — 1 AU from the Sun at the
render origin). `encodeForegroundPass` reads this seed for its single draw.

- [ ] Lower `MIN_DISTANCE_MPC` to the spec §7 floor; rewrite the docblock for the
  new value (timeless — describe the current floor + the focus-tween interaction,
  no "was 0.05" history).
- [ ] Test (`clampDistance.test.ts`): `clampDistance floors at MIN_DISTANCE_MPC`
  asserting a sub-floor input returns the new `MIN_DISTANCE_MPC`; `clampDistance
  caps at MAX_DISTANCE_MPC` (port/keep existing); `the focus-on end distance is not
  ratcheted` — assert `clampDistance(galaxyFocusDistance)` returns that distance
  unchanged (read `galaxyFocusDistance.ts` for the value; cite it).
- [ ] Add the minimal Earth-scale debug-body seed (clearly marked Plan-01
  stand-in) consumed by `encodeForegroundPass`.
- [ ] `npm test -- clampDistance` → green. Commit.

## Task 13 — Final gate (typecheck + test + VISUAL confirmation)

**Files:** none (verification only).

- [ ] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] `npm test` (full suite) → green. (Per CLAUDE.md, 590+ tests; keep green.)
- [ ] **VISUAL gate — STOP and report, do not claim success unattended.** The
  spec §10.1 acceptance is a VISUAL property: on the dev server, zoom continuously
  from the galaxy view down to the debug sphere and confirm:
  - the descent is **stable and jitter-free** across the full zoom range (no
    swim / snap / clipping as `f32` would have produced),
  - the sphere resolves as a **clean round solid** at Earth's true relative size,
  - the **galaxy backdrop stays intact** behind it (additive cloud unaffected; the
    OVER composite doesn't wash it out).
  Ask the user to look (dev server stays running per CLAUDE.md — do not kill it),
  or describe exactly what they should see.
- [ ] Note in the commit/PR body that the jitter-free-zoom acceptance is
  user-verified visually, not by automated tests.
- [ ] Commit.

---

## Self-review (done before finalising this plan)

### Spec §10 Phase-1 bullet → task coverage

| Phase-1 bullet (spec §10.1 / contract Plan-01 scope) | Task |
| --- | --- |
| `scaleUnits` (`SCALE_UNITS`) + `renderOrigin` (`RENDER_ORIGIN_MPC`) | T1 |
| `narrowMat4` | T2 |
| f64 compose via `mat4d` — `computeForegroundViewProj` | T3 |
| `composeBodyMvp` + catastrophic-cancellation guard (the de-risk) | T4 |
| `uvSphereMesh` + `UvSphereMesh` | T5 |
| Foreground offscreen (rgba16float + depth32float) + OVER composite | T6 |
| Sphere `lib/sphere.wesl` + `debugSphere/{vertex,fragment}.wesl` | T7 |
| `debugSphereRenderer` | T8 |
| ReadyFrameContext + frameContext foreground fields | T9 |
| `encodeForegroundPass` + `renderFrame` slot | T10 |
| `EngineGpuHandles` slots + `initGpu` construct + teardown + resize | T11 |
| Lower `MIN_DISTANCE_MPC` (Plan 01 owns this) + seed Earth-scale debug sphere | T12 |
| Final typecheck + test + VISUAL gate | T13 |

Every Phase-1 bullet maps to exactly one task; tasks are ordered so each builds on
the last (constants → narrow → f64 vp → body MVP+guard → mesh → passes → shaders →
renderer → ctx fields → encode+slot → wiring → clamp+seed → gate).

### Placeholder scan

None. No TODO/TBD/`???` left in any task. The only deliberately-deferred items are
named with their owning plan: adaptive near/far → Plan 03 (`foregroundFrustum.ts`),
full `BodyStore` + `earth/planet/star` renderer slots → Plan 02, debug-sphere
retirement decision → Plan 02.

### Type-name consistency check vs the contract

`SCALE_UNITS`, `RENDER_ORIGIN_MPC`, `narrowMat4`, `computeForegroundViewProj`,
`composeBodyMvp`, `UvSphereMesh`, `uvSphereMesh`, `ForegroundOffscreen`,
`createForegroundOffscreen`, `ForegroundComposite`, `createForegroundComposite`,
`DebugSphereRenderer`, `createDebugSphereRenderer`, `encodeForegroundPass`,
`foregroundVp`/`foregroundNear`/`foregroundFar`/`renderOrigin` (ctx fields),
`foregroundOffscreen`/`foregroundComposite`/`debugSphereRenderer` (gpu slots),
`SphereUniforms`/`clip_from_local` (WESL) — all spelled identically to the contract.

### Contract conflicts surfaced (for cross-plan reconciliation)

1. **`encodeForegroundPass` deps type.** Contract says `deps: RenderDeps`; the real
   sibling type is `PassDeps` (`src/@types/engine/frame/PassDeps.d.ts`, threaded
   through `encodeHdrSingle`/`encodeHdrSplit`/`renderFrame.ts:115`). No `RenderDeps`
   type exists. Plan instructs `PassDeps`. **Reconcile the contract to `PassDeps`.**
2. **Composite invocation.** Contract says the foreground "slots into renderFrame
   after the additive HDR passes and before postProcess.draw." Confirmed correct —
   but it is NOT an `HDR_PASSES` entry (those are additive-into-HDR-view); it is an
   inline call in `renderFrame.ts` like tone-map / `encodeUiOverlay`
   (`renderFrame.ts:54-62`). No conflict, just made explicit.
3. **`@types/engine/handles/EngineGpuHandles.d.ts` path.** Contract cites
   `src/@types/engine/handles/EngineGpuHandles.d.ts`; the spec §11 file inventory
   cites `src/@types/engine/EngineGpuHandles.d.ts`. The real path is the
   `handles/` one (verified). Plan uses `handles/`. **Reconcile spec §11.**
4. **`src/data/scaleUnits.ts` vs one-symbol-per-file in `utils/`.** `SCALE_UNITS`
   and `RENDER_ORIGIN_MPC` live under `src/data/` (data definitions), not
   `src/utils/`, so the one-FUNCTION-per-file `utils/` rule does not bind them — but
   each still exports a single const, consistent with the contract's stated paths.
   No conflict; noted so a reviewer doesn't flag it.
