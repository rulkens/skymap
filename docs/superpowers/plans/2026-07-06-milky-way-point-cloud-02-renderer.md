# Milky Way point cloud 02 — in-world renderer, generation at init, impostor teardown

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking. **Load the `wesl-shaders` skill before any `.wesl` task.**

**Spec:** `docs/superpowers/specs/2026-07-06-milky-way-point-cloud-design.md`
**Series:** plan 02 of 2. Requires plan 01 complete (generation core under `src/services/gpu/galaxy/` + `src/services/gpu/shaders/galaxyGen/`, `MILKY_WAY_GALAXY_PARAMS` in `src/data/milkyWay/`). After this plan the app draws the generated Milky Way point cloud in-world through the existing pass/fade/settings seams, regenerates it on tier switch, and — once the manual visual gate passes — the impostor is deleted.

**Goal:** New `milkyWayCloudRenderer` (star + dust pipelines adapted from the tool's draw shaders), a one-time generation step in `initGpu` producing persistent `galaxy:mwStarVB` / `galaxy:mwDustVB` vertex buffers, per-tier star budgets riding the existing tier-change path, a calibration module holding every hand-tuned constant, and the impostor teardown gated on the user's visual sign-off (including iOS).

**Architecture:**

- **Generation is local-frame; placement is draw-side.** The compute passes run with `extra: null` (identity extra lanes); the world transform is one `model` mat4 uniform — `translate(MILKY_WAY_CENTER_WORLD) × R_localToWorld × uniformScale(k)` — built once CPU-side with wgpu-matrix. `R_localToWorld` is the transpose of the `worldToGalactic` rotation in `src/services/gpu/shaders/lib/util.wesl:161-178` COMPOSED with the tool's local-frame swizzle (`galacticToShader`, `util.wesl:180-196`): the generated galaxy's local frame has **y = disk normal**, the galactic frame has **Z = NGP**, so the rotation columns are (local x → `GAL_X_EQ`, local y → `GAL_Z_EQ`, local z → `GAL_Y_EQ`). This reproduces the impostor's frame exactly (same swizzle it used); a parity assertion scrapes the WESL constants so the CPU matrix can't drift from the shader that documents the frame.
- **Resources vs renderer, un-braided.** `milkyWayCloud` (a `src/services/gpu/galaxy/` factory) owns the generated buffers + regeneration (carve → create VBs → pack UBO → encode → submit); `milkyWayCloudRenderer` (a `src/services/gpu/renderers/` factory) owns pipelines + per-frame uniforms and takes `(buffers, model, fadeAlpha)`-shaped draw args — galaxy-agnostic so a future many-disks feature is a loop plus a rename, but nothing beyond the single MW instance is built.
- **The pass keeps its seams.** `milkyWayPass.ts` swaps its renderer dep; the `enabled` gate (settings toggle × fade tail × `milkyWayFadeAlpha` distance band) is byte-identical. Dust draws AFTER stars inside the same pass, and the pass keeps its last-in-HDR slot, so dust darkens both the MW's own stars and background content.
- **Uniform surface (spec + necessary additions).** The spec pins `CameraUniforms` prefix + `model` + `fadeAlpha`. The tool's draw shaders additionally need a camera billboard basis (`right`/`up` world vectors — the app's `CameraUniforms` has no view matrix) and the calibration scalars (exposure, star px clamp, model scale for world-size conversion). Those ride the same buffer after the spec-pinned fields — see the byte table in Task 5. The tool's flux-conserving-LOD and cull-bright knobs are dropped: the tool ships them defaulted OFF (`createGalaxyEngine.ts:479-481`, `lodApparent: 0, cullBright: 0`), so omitting them is behaviour-preserving, and dead uniforms are exactly the drift the pass conventions forbid.
- **Regeneration rides the tier path.** `makeRunTierTransition` already reaches `state.gpu.*` + the device for the hi-res famous rebuild; the MW cloud regenerate call lands beside it. Records are population-ordered, so drawing a prefix of a max-tier buffer would drop whole populations — regeneration (sub-millisecond, fixed seed) is the correct mechanism, not prefix draws.
- **No new render-wake sources.** The MW is static; tier-switch regeneration rides the wake the tier change already causes.

**Tech Stack:** TypeScript, WebGPU (render + compute), WESL (`?static`), wgpu-matrix (dst arg last + optional; `mat4.create()` returns ZEROS not identity — build matrices with `mat4.identity()`/`mat4.translation()` starts), Vitest with per-test mock `GPUDevice` fixtures (pattern: `tests/services/gpu/renderers/filamentRenderer.test.ts:15`).

## Global Constraints

- Worktree `.claude/worktrees/better-galaxy-renderer`; absolute paths in every dispatch; gates at every task boundary: `npm test` + `npm run typecheck` green.
- **Exact contract values** (from the spec — tests pin them):
  - `MILKY_WAY_STARS_PER_TIER = { small: 100_000, medium: 200_000, large: 400_000 }` — medium equals `MILKY_WAY_GALAXY_PARAMS.starCount`; small/medium/large relate ×0.5 / ×1 / ×2. Dust follows the carve's dust fraction (no separate dust knob).
  - Star pipeline blend: `color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }`, alpha likewise (additive — HDR pass convention and the tool's).
  - Dust pipeline blend: `color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' }`, `alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' }` (the tool's exact transmittance blend, `createGalaxyEngine.ts:277-283`).
  - Dust draws AFTER stars; no depth state on either pipeline; both target `rgba16float`.
  - Buffer labels `galaxy:mwStarVB` / `galaxy:mwDustVB`; usage `VERTEX | STORAGE`; size `capacity × GEN_RECORD_BYTES` (capacity from the carve fns — the only capacity authority).
  - Instance `arrayStride: GEN_RECORD_BYTES` on both pipelines; attribute layouts verbatim from the tool (`createGalaxyEngine.ts:224-231` stars, `:261-268` dust).
  - Fade semantics: stars multiply emission by `fadeAlpha`; dust outputs `mix(vec3(1.0), transmittance, fadeAlpha)`.
  - `MILKY_WAY_RADIUS_MPC = 0.030` (the impostor's value — `shaders/milkyWay/fragment.wesl:94` — kept so apparent size is continuous across the swap); `k = MILKY_WAY_RADIUS_MPC / outerRadiusOf(MILKY_WAY_GALAXY_PARAMS)` (= 0.030 / 10.5 for radius 1.05).
- Untouched surfaces (spec table): `milkyWayPickRenderer.ts` + `shaders/milkyWayPick/*`, SOURCE_REGISTRY MilkyWay row, `settings.milkyWay.enabled`, fade key `'milkyWay'`, `milkyWayFadeAlpha`, `MILKY_WAY_CENTER_WORLD`, framing constants.
- TS house rules: `type` never `interface`; **one exported type per file in `src/@types/`** (goes in every `@types/`-touching dispatch), new type files as plain `.ts`; one symbol per file in `utils/`; deep relative imports, no barrels; `Vec2`/`Vec3` aliases never raw tuples; typed `vi.fn<() => void>()`; didactic timeless comments; sagas (if any touched — none expected) use `while (true)`.
- WESL rules (load `wesl-shaders` before any `.wesl` task): no backticks in comments; imports one identifier per line at the top; literal `package::` prefix; every `switch` has `default:`; modules via `createShaderModuleWithDevLog`; GPU resources labeled with the `galaxy:` prefix (renderer-side resources may follow the renderer's `milkyWayCloud-` label style — buffers from the generation step MUST use the two pinned `galaxy:` labels).
- Standing WebGPU rules: `layout: 'auto'` bind groups are pipeline-specific — one bind group per pipeline even for a shared uniform buffer; never interleave `writeBuffer` racing a `submit` on shared mutable buffers.
- Search before writing helpers (preflight-grep `src/utils`); never `git add -A`; prettier only touched files.
- **Preserve the spec's un-braided choices**: generation local-frame vs draw-side placement; resources vs renderer; calibration constants in ONE module. Do not fold the cloud resources into the renderer or scatter tuned constants into shaders.

---

## Task 1 — calibration module

**Files:** create `src/services/gpu/galaxy/milkyWayCalibration.ts`, `tests/services/gpu/galaxy/milkyWayCalibration.test.ts`.

**Interfaces** (one data-style module for every hand-tuned constant — the single tuning surface for the visual gate):

```ts
import type { Tier } from '../../../@types/data/Tier';

/** Disk radius in Mpc — the impostor's value (fragment.wesl carried 0.030
 *  as a shader const; that file dies in Task 8, this is the new home). */
export const MILKY_WAY_RADIUS_MPC = 0.03;

/** Per-tier star budgets; medium IS the preset's starCount. */
export const MILKY_WAY_STARS_PER_TIER: Record<Tier, number> = {
  small: 100_000,
  medium: 200_000,
  large: 400_000,
};

/** Local-galaxy-units -> Mpc: MILKY_WAY_RADIUS_MPC / outerRadiusOf(preset). */
export const MILKY_WAY_MODEL_SCALE: number;

/** Star sprite screen-size clamp, px. Initial values are starting points —
 *  tuned at the visual gate (the px floor is the first anti-sparkle lever). */
export const MILKY_WAY_STAR_PX_MIN = 1.0;
export const MILKY_WAY_STAR_PX_MAX = 64.0;

/** Emission factor into the app's HDR -> tonemap chain. Initial value is the
 *  tool's tuned starIntensity (createGalaxyEngine.ts:478); expect a tuning
 *  loop at the visual gate (the app's post chain differs from the tool's). */
export const MILKY_WAY_EXPOSURE = 0.11;
```

- [x] Failing tests: `medium tier budget equals the preset starCount` (assert `MILKY_WAY_STARS_PER_TIER.medium === MILKY_WAY_GALAXY_PARAMS.starCount`); `small and large derive by x0.5 and x2 from medium`; `model scale maps the preset outer radius onto MILKY_WAY_RADIUS_MPC` (assert `MILKY_WAY_MODEL_SCALE * outerRadiusOf(MILKY_WAY_GALAXY_PARAMS)` ≈ `MILKY_WAY_RADIUS_MPC`); `px clamp is a non-empty positive band` (0 < min < max).
- [x] Implement. `npm test -- milkyWayCalibration` → green. Full gates. Commit.

---

## Task 2 — model matrix: `milkyWayModelMatrix`

**Files:** create `src/services/gpu/galaxy/milkyWayModelMatrix.ts`, `tests/services/gpu/galaxy/milkyWayModelMatrix.test.ts`.

**Interfaces**

```ts
/** local generated-galaxy frame -> world (equatorial J2000, Mpc).
 *  translate(MILKY_WAY_CENTER_WORLD) x R_localToWorld x uniformScale(MILKY_WAY_MODEL_SCALE).
 *  Column-major Float32Array(16), built ONCE (module consumers cache it). */
export function milkyWayModelMatrix(): Float32Array;
```

**Rotation contract** — columns of `R_localToWorld` (unit equatorial vectors, values from `util.wesl:166-168`):

| local axis                | world direction  | value                               |
| ------------------------- | ---------------- | ----------------------------------- |
| x (in-disk, toward GC)    | `GAL_X_EQ`       | `(-0.054876, -0.873437, -0.483835)` |
| y (disk normal)           | `GAL_Z_EQ` (NGP) | `(-0.867666, -0.198076, 0.455984)`  |
| z (in-disk, rotation dir) | `GAL_Y_EQ`       | `(0.494109, -0.444830, 0.746982)`   |

This is `worldToGalactic` transposed + the `galacticToShader` swizzle folded in — the exact frame the impostor rendered in. wgpu-matrix gotchas apply: `mat4.create()` is ZEROS; compose explicitly (e.g. start from `mat4.translation`, multiply the hand-built rotation columns, then `mat4.scale`) with dst args last.

- [x] Failing tests: `rotation columns are the WESL galactic basis, swizzled` — scrape `GAL_X_EQ`/`GAL_Y_EQ`/`GAL_Z_EQ` literals from `src/services/gpu/shaders/lib/util.wesl` via `readFileSync` + regex (the `constants.parity.test.ts` pattern) and assert matrix columns 0/1/2 equal (GAL_X_EQ, GAL_Z_EQ, GAL_Y_EQ) × `MILKY_WAY_MODEL_SCALE`; `translation lanes are MILKY_WAY_CENTER_WORLD` (elements 12..14); `a local +y unit vector lands on the NGP direction scaled by k, offset by the centre` (end-to-end transform of `[0,1,0]`); `bottom row is 0,0,0,1`.
- [x] Implement. Full gates. Commit.

---

## Task 3 — camera billboard basis helper

**Files:** create `src/utils/camera/cameraBillboardBasis.ts`, `tests/utils/camera/cameraBillboardBasis.test.ts`.

**Preflight:** grep `src/utils` for an existing camera-basis/cross helper first; if one exists, reuse it and skip this task (note it in the summary).

**Interfaces**

```ts
/** World-space right/up axes of the camera's image plane — the billboard
 *  basis the cloud shaders expand sprites along. Derived from the same
 *  eye/target/roll inputs computeViewProj.ts uses for its view matrix
 *  (right = normalize(forward x up_rolled), up = right x forward). */
export function cameraBillboardBasis(cam: OrbitCamera): { right: Vec3; up: Vec3 };
```

- [x] Failing tests: `identity pose gives world-aligned axes` (camera on +Z looking at origin → right ≈ +X, up ≈ +Y); `axes are unit length and mutually orthogonal` (also orthogonal to forward); `roll rotates the basis about the view direction` (roll π/2 swaps right/up up to sign — mirror `computeViewProj.ts`'s Rodrigues handling, cited there at the roll block).
- [x] Implement (one symbol, one file). Full gates. Commit.

---

## Task 4 — `milkyWayCloud` resources: generate at init, regenerate on tier

**Files:** create `src/services/gpu/galaxy/milkyWayCloud.ts`, `src/@types/galaxy/MilkyWayCloud.ts`, `src/@types/galaxy/MilkyWayCloudBuffers.ts` (one type per file), `tests/services/gpu/galaxy/milkyWayCloud.test.ts`.

**Interfaces**

```ts
export type MilkyWayCloudBuffers = {
  readonly starBuf: GPUBuffer;
  readonly starCount: number; // = star layout capacity (dead slots draw zero-area quads)
  readonly dustBuf: GPUBuffer | null;
  readonly dustCount: number;
};

export type MilkyWayCloud = {
  readonly buffers: () => MilkyWayCloudBuffers;
  /** carve -> destroy old VBs -> create new -> pack UBO -> encode both compute passes -> submit. */
  readonly regenerate: (tier: Tier) => void;
  readonly destroy: () => void;
};

/** Generates immediately for `tier`. Params are the fixed preset with the
 *  tier's starCount folded in: { ...MILKY_WAY_GALAXY_PARAMS, starCount:
 *  MILKY_WAY_STARS_PER_TIER[tier] }. extra = null (local frame; placement
 *  is the draw-side model matrix). */
export function createMilkyWayCloud(device: GPUDevice, tier: Tier): MilkyWayCloud;
```

Behaviour contract: buffers `label: 'galaxy:mwStarVB'` / `'galaxy:mwDustVB'`, `usage: VERTEX | STORAGE`, `size: capacity * GEN_RECORD_BYTES` (star size clamped to ≥ 1 record like `createGalaxyEngine.ts:540-544`); UBO `galaxy:mwGenUbo`, `GENERATION_UBO.byteLength`, `UNIFORM | COPY_DST`, written THEN encoded THEN submitted (the queue-ordering guarantee — cite `createGalaxyEngine.ts` `setParams` docblock); dispatch via the moved `createGenerationPipelines` + `encodeGeneration` (pipelines built once at factory time, reused by regenerate). Deterministic: fixed preset, fixed seed — tier is the only variable.

- [x] Failing tests (mock `GPUDevice` capturing `createBuffer`/`writeBuffer`/`createCommandEncoder`/`queue.submit` args): `creates star and dust VBs with the pinned labels, VERTEX|STORAGE usage, and capacity x GEN_RECORD_BYTES sizes` (compute expected sizes from `carveStarLayout`/`carveDustLayout` on the medium-tier params — the carve fns stay the only capacity authority, the test derives from them rather than hardcoding); `medium tier packs the preset starCount and large packs x2` (inspect the packed UBO's derived fields or the carve inputs); `regenerate destroys the old buffers and submits a new generation`; `destroy releases buffers and UBO`.
- [x] Implement. Full gates. Commit.

---

## Task 5 — cloud draw shaders: `milkyWayCloud/{io,stars,dust}.wesl`

**Load the `wesl-shaders` skill first.**

**Files:** create `src/services/gpu/shaders/milkyWayCloud/io.wesl`, `.../stars.wesl`, `.../dust.wesl`.

Adapted from the tool's `star.wesl` / `dust.wesl` (read both in full — the soft-glow fragment math, screen-size clamp shape, and transmittance fragment port verbatim), consuming the app's conventions: `io.wesl` declares the shared `Uniforms` struct (embedding `CameraUniforms` from `package::lib::camera`, per the points/milkyWay io pattern) + the `@group(0) @binding(0)` uniform; `stars.wesl` / `dust.wesl` each hold their own `vs`+`fs` (one module per pipeline — disjoint sources sidestep the auto-layout trap).

**Uniform byte table** (the offset authority for Task 6's packer + test; every field 16-byte-aligned groups):

| offset   | f32 idx | field                                                        |
| -------- | ------- | ------------------------------------------------------------ |
| 0..63    | 0..15   | `cam.viewProj : mat4x4<f32>`                                 |
| 64..71   | 16..17  | `cam.viewportPx : vec2<f32>`                                 |
| 72..79   | 18..19  | `cam._pad0/_pad1`                                            |
| 80..143  | 20..35  | `model : mat4x4<f32>`                                        |
| 144..159 | 36..39  | `camRight : vec4<f32>` (xyz + 0)                             |
| 160..175 | 40..43  | `camUp : vec4<f32>` (xyz + 0)                                |
| 176..191 | 44..47  | `params0 : vec4<f32>` = (fadeAlpha, exposure, modelScale, 0) |
| 192..207 | 48..51  | `params1 : vec4<f32>` = (starPxMin, starPxMax, 0, 0)         |

Total **208 bytes** (`MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE`).

Vertex contract (both): `center = (model * vec4(inPos, 1)).xyz`; billboard corner expands along `camRight`/`camUp` by `worldHalfExtent = inSize * modelScale`; project via `cam.viewProj`. Stars: clamp the projected half-extent to `[starPxMin, starPxMax]` pixels via `cam.viewportPx` (replaces the tool's 0.11-NDC cap — the px floor is the anti-sparkle lever, the cap bounds close flythroughs). Dust: keep the tool's 0.16-NDC clamp verbatim (no calibration knob — the spec's px clamp is stars-only). Dead records (size 0) collapse to zero-area quads — no branch needed. The tool's LOD/cull-bright blocks are omitted (defaulted off in the tool; see Architecture).

Fragment contract: stars — the tool's `core + glow` radial falloff with `a = ... * exposure`, final colour `color * bright * a * fadeAlpha` (fade multiplies EMISSION); dust — the tool's per-channel transmittance `T`, output `vec4(mix(vec3(1.0), T, fadeAlpha), 1.0)` so a faded-out Milky Way stops darkening the scene (fadeAlpha 0 → T = 1 → multiplicative identity).

- [x] Load `wesl-shaders`. Write the three files (didactic headers: what changed vs the tool source and why — model-matrix placement, px clamp, fade semantics; no backticks in comments).
- [x] `npm run typecheck` (guards TS damage; first link proof is Task 6). Commit.

---

## Task 6 — `milkyWayCloudRenderer`

**Files:** create `src/services/gpu/renderers/milkyWayCloudRenderer.ts`, `src/@types/rendering/MilkyWayCloudRenderer.ts`, `tests/services/gpu/renderers/milkyWayCloudRenderer.test.ts`.

**Interfaces**

```ts
export type MilkyWayCloudDrawArgs = {
  readonly vp: Float32Array; // ctx.vp
  readonly viewportPx: Vec2; // [canvasSize.width, canvasSize.height]
  readonly camRight: Vec3; // cameraBillboardBasis(ctx.cam)
  readonly camUp: Vec3;
  readonly model: Float32Array; // milkyWayModelMatrix() (pass-cached)
  readonly fadeAlpha: number; // distance fade x toggle opacity (pass composes, as today)
  readonly buffers: MilkyWayCloudBuffers;
};

export const MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE = 208;

export type MilkyWayCloudRenderer = {
  readonly label: string; // 'milkyWayCloudRenderer'
  readonly draw: (pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs) => void;
  readonly destroy: () => void;
};

export function createMilkyWayCloudRenderer(init: {
  device: GPUDevice;
  format: GPUTextureFormat; // 'rgba16float' at the initGpu call site
}): MilkyWayCloudRenderer; // satisfies Renderer (label + destroy contract)
```

Pipeline contract: two `layout: 'auto'` render pipelines from two modules (`stars.wesl?static`, `dust.wesl?static` via `createShaderModuleWithDevLog`); vertex buffers = slot 0 the shared 6-vertex corner quad (stride 8, float32x2 — the tool's `galaxy:quad` shape) + slot 1 instance buffer `arrayStride: GEN_RECORD_BYTES` with the tool's exact attribute layouts (stars: float32x3 @0, float32x3 @12, float32x2 @24; dust: float32x3 @0, float32 @12, float32x3 @16, float32 @28); blend states per Global Constraints; no depth state; ONE uniform buffer, TWO bind groups (one per pipeline — auto layouts never cross). `draw` packs the Task-5 byte table (exposure/pxMin/pxMax/modelScale from the calibration module), writes once, then: star pipeline draw(6, starCount) → dust pipeline draw(6, dustCount) — **stars first, dust after**, skipping dust when `dustBuf === null`.

- [x] Failing tests (mock device; assert on `createRenderPipeline` mock call args): `star pipeline blends one/one additive on color and alpha`; `dust pipeline blends srcFactor dst / dstFactor zero on color and zero/one on alpha` (the load-bearing multiply — silent if wrong); `both pipelines take the instance buffer at arrayStride GEN_RECORD_BYTES`; `neither pipeline declares depthStencil`; `draw records stars before dust and skips dust when dustBuf is null` (capture setPipeline/draw order on a mock pass encoder); `uniform pack puts model at f32 20..35, camRight at 36..39, fadeAlpha at 44, exposure at 45, modelScale at 46, px clamp at 48..49` (inspect the `writeBuffer` payload); `uniform buffer is 208 bytes`.
- [x] Implement. This links the new WESL for the first time — fix compile fallout here. Full gates. Commit.

---

## Task 7 — wiring: initGpu construction, pass swap, tier regeneration

**Files:** modify `src/services/engine/phases/initGpu.ts`, `src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/engine.ts` (state literal + destroy), `src/services/engine/phases/startLoop.ts`, `src/services/engine/frame/runFrame.ts`, `src/services/engine/frame/renderFrame.ts`, `src/@types/engine/frame/PassDeps.d.ts`, `src/@types/engine/frame/RunFrameDeps.d.ts` + `RenderFrameInput.d.ts` (whichever thread the dep), `src/services/engine/frame/passes/milkyWayPass.ts`, `src/services/engine/wiring/makeRunTierTransition.ts`; matching test updates.

Contract:

- `initGpu`: after renderer construction, `state.gpu.milkyWayCloud = createMilkyWayCloud(device, state.tier)` and `state.gpu.milkyWayCloudRenderer = createMilkyWayCloudRenderer({ device, format: 'rgba16float' })`. The impostor's `createMilkyWayRenderer` call REMAINS until Task 9 (constructed, no longer drawn — teardown is gated on the visual checkpoint).
- `EngineGpuHandles`: add `milkyWayCloud: MilkyWayCloud | null` and `milkyWayCloudRenderer: MilkyWayCloudRenderer | null`; seed `null` in the engine state literal; `engine.ts` destroy tears both down beside the existing `milkyWayRenderer` teardown (`engine.ts:666-668` block). Do NOT add either to `isEngineReady` (standing lifecycle invariant — see initGpu's comment block).
- `milkyWayPass.ts`: `enabled` unchanged byte-for-byte. `draw` swaps the impostor call for `deps.milkyWayCloudRenderer.draw(pass, { vp, viewportPx: [canvasSize.width, canvasSize.height], camRight, camUp, model, fadeAlpha, buffers: state.gpu.milkyWayCloud.buffers() })` with `camRight/camUp` from `cameraBillboardBasis(ctx.cam)` and `model` a module-level cached `milkyWayModelMatrix()`. fadeAlpha composition (distance fade × toggle opacity) stays as-is.
- `PassDeps`: `milkyWayRenderer: MilkyWayRenderer` → `milkyWayCloudRenderer: MilkyWayCloudRenderer`; thread through `startLoop.ts:78-107` (null-gate list included), `runFrame.ts:381`, `renderFrame.ts:99/120`.
- `makeRunTierTransition`: beside the hi-res famous rebuild, `state.gpu.milkyWayCloud?.regenerate(nextTier)` (same lazy-device pattern is unnecessary — the handle itself is null pre-bootstrap, which is the guard).
- Test updates: `tests/services/engine/frame/passes/passes.test.ts`, `renderFrame.test.ts` + `.timing`, `runFrame.test.ts`, `startLoop.test.ts`, `initGpu.destroyReachability.test.ts` (new handles must be reachable by destroy), `tests/@types/engineState.test.ts`, `tests/services/engine/wiring/makeRunTierTransition.test.ts` (new assertion: `regenerates the Milky Way cloud for the new tier`), `tests/visual/renderFrameSplitBaseline.test.ts` if it stubs PassDeps.

- [ ] Extend the fixtures/tests first (failing): pass-deps shape, destroy reachability, tier-regenerate assertion.
- [ ] Implement the wiring. Full `npm test` + `npm run typecheck` → green.
- [ ] Commit.

---

## Task 8 — CHECKPOINT: manual visual gate (user)

**No code.** Dev server up (`npm run dev` is already running — do not restart it); ask the user to verify, tuning ONLY `milkyWayCalibration.ts` constants (+ at most the WESL falloff constants, flagged loudly if touched) between looks:

- [ ] **Close flythrough (≤ 0.15 Mpc):** arms, bar, bulge, dust lanes read correctly; no popping against the 0.01 Mpc near plane.
- [ ] **Mid range (1–10 Mpc):** coherent galaxy, no sparkle/aliasing storm (levers in order: `MILKY_WAY_STAR_PX_MIN`, then `MILKY_WAY_EXPOSURE`; if both fail the spec's documented fallback is a near/far crossfade to a RETAINED impostor — STOP and escalate before building that).
- [ ] **Fade region (10–50 Mpc):** smooth fade; dust darkening disappears with it (toggle `settings.milkyWay.enabled` too — the ~100 ms fade tail must behave).
- [ ] **iOS device check** (SKYMAP_HTTPS=1 LAN flow in `vite.config.ts:9-29`): navigation still presents frames — WebKit's stricter Tint must accept the new WESL (an invalid pipeline silently drops whole frames; see CLAUDE.md).
- [ ] Record the user's sign-off (and final tuned constants) in this plan next to this task. **Task 9 must not start without it.**

---

## Task 9 — impostor teardown (GATED on Task 8 sign-off)

**Files:** delete `src/services/gpu/renderers/milkyWayRenderer.ts`, `src/services/gpu/shaders/milkyWay/fragment.wesl`, `.../vertex.wesl`, `.../io.wesl` (the directory), `src/@types/rendering/MilkyWayRenderer.d.ts`; modify `initGpu.ts` (drop the construction + `state.gpu.milkyWayRenderer` store), `engine.ts` (state literal + destroy lines), `EngineGpuHandles.d.ts`.

**Explicitly NOT deleted:** `milkyWayPickRenderer.ts`, `shaders/milkyWayPick/*` (pick is a separate disk-shaped target), `milkyWayFadeAlpha.ts`, `galacticCenter.ts`, the `worldToGalactic`/`galacticToShader` helpers in `lib/util.wesl` (Task 2's parity scrape + the pick shaders read that frame).

- [ ] Confirm the Task 8 sign-off line exists in this plan. If not: STOP.
- [ ] Delete the four files + type; sweep every reference: `grep -rn "milkyWayRenderer\|MilkyWayRenderer\|MILKY_WAY_UNIFORM_BUFFER_SIZE\|shaders/milkyWay/" src tests` — expect hits only in `milkyWayPick*` (keep) and comments in `defaults.ts:109-111` / `milkyWayPickHalfExtentPx.ts:22` (update those comments to cite `milkyWayCloudRenderer` / `milkyWayCalibration.MILKY_WAY_RADIUS_MPC` instead — comments stay timeless, no "used to be" narration).
- [ ] Update `milkyWayPass.ts`'s module header (it describes the impostor) to describe the cloud pass.
- [ ] Full `npm test` + `npm run typecheck` + `npm run build`. Commit.

---

## Task 10 — entanglement radar over the series diff

Run the `entanglement-radar` skill over the combined plan-01 + plan-02 diff (`git diff main...HEAD`), verifying specifically:

- [ ] `GENERATION_UBO` is still the ONLY offset authority (no new literal offsets in the packer, the cloud resources, or tests — Task 6's uniform test reads its own byte table, which is the CLOUD renderer's authority, distinct from the generation UBO's).
- [ ] Zero WESL duplication: the generation shaders exist once under `src/services/gpu/shaders/galaxyGen/`; the parity test guards them from `tests/services/gpu/galaxy/`; the cloud draw shaders share nothing textually with the tool's `star.wesl`/`dust.wesl` beyond the ported math (adapted, not copied-with-tweaks — if a helper is identical, note whether it belongs in a shared lib).
- [ ] The carve fns are the only capacity authority (no hardcoded capacities in `milkyWayCloud.ts` or its tests).
- [ ] Single-source preset: the tool's `referenceGalaxies.ts` imports `MILKY_WAY_GALAXY_PARAMS`; no second copy of the params object exists (`grep -rn "armWinding: 0.32" --include="*.ts"` → exactly one hit).
- [ ] Impostor fully gone except pick: `find src -path "*shaders/milkyWay/*"` → empty; `milkyWayPick` intact.
- [ ] File any knots found as backlog items (or fix trivially in-line); note the radar verdict in the task summary.

## Definition of Done

- [ ] App draws the generated Milky Way at the correct position (Sgr A\* offset), orientation (galactic frame), and scale (0.030 Mpc disk radius) through the existing pass, fade, and settings seams.
- [ ] Star budgets 100k/200k/400k per tier; tier switch regenerates via the existing tier-change path; no other regeneration path exists.
- [ ] Blend states, buffer labels/usages, stride, and fade semantics match the Global Constraints exactly (asserted by tests, not just eyeballed).
- [ ] Visual gate signed off by the user, including the iOS device check, recorded in Task 8.
- [ ] Impostor deleted (renderer + three shaders + uniform-size const + type), pick surfaces untouched — or the crossfade fallback consciously adopted and documented instead (escalation path in Task 8).
- [ ] Entanglement-radar task run and recorded.
- [ ] Full suite + both typechecks + `npm run build` + tool `npx vite build --config tools/galaxy-renderer/vite.config.ts` green; every commit staged specific paths.
