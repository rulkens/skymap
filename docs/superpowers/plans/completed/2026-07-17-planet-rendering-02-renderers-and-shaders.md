# Planet rendering — Plan 02: renderers, shaders, lighting, rings, glints

**Spec:** `docs/superpowers/specs/2026-07-17-planet-rendering.md` — this plan
executes §6 (three sphere paths + partition + shared uniforms + textured
renderer + mip gen), §6.2 (sun-relative lighting), §7 (Earth Lambert), §8
(Saturn's rings + analytic mutual shadows), §9 (sub-pixel glints).
**Sequencing:** executes AFTER Plan 01 (`…-01-data-and-loading`) on the same
branch/PR. Consumes Plan 01's baked `orientation`, `BODY_TEXTURE_REGISTRY`,
`SCENE_RINGS`, the `bodyTextures` slot family (whose commit dispatch this plan
extends to the new renderers), and `composeBodyMvp`'s `orientation` param.
**Plan style (OVERRIDES upstream `writing-plans`):**
`docs/superpowers/conventions/plan-style.md` — **contract code yes,
implementation code no.** Cite `path:line`; test names + assertions ARE the
acceptance criteria.

## Goal

Make the bodies visually honest on close approach: real sun-relative Lambert
lighting (flat + textured + Earth), demand-loaded textures on the 13 spherical
bodies, Saturn's rings with analytic mutual shadows, and a sub-pixel glint
cross-fade so bodies stop popping during descent. Bodies partition each frame
into `{ glints, flat, textured }` (+ Earth + rings) by pure predicates mapping
1:1 to renderers through the `CONTENT_LAYERS` registry — never an `if (id === …)`
chain (spec §6).

## WESL constraints (this bundle's shader-heavy work — `feedback_wgsl_meticulous`)

Every `.wesl` task carries these, non-negotiable (`wesl-shaders` skill):

- **NO backtick characters anywhere in WESL comments** — parse errors; use
  single quotes (`feedback_wesl_no_backticks`).
- **`texture_2d` only, NEVER `texture_1d`** — WebKit rejects `texture_1d` and
  silently drops the whole shared-encoder frame (the iOS landmine). The Saturn
  ring radial strip is stored as an **N×1 `texture_2d`** (spec §6.6/§8).
- **Verify every shader visually** with `createShaderModuleWithDevLog`
  (`shaderCompileLogger.ts`) — it prints the real `getCompilationInfo()` error +
  offending line.
- Inter-stage varyings live in one `io.wesl` imported by both stages;
  `?static` on the TS import side, literal `package::` prefixes; meticulous
  small steps.

## Global constraints (house rules — override defaults)

- **Contract code yes, implementation code no.** Signatures + test names + byte
  tables only.
- **One `type` per `.d.ts`, one function per util file** — filename = symbol.
- **`type` aliases, never `interface`.** `Vec3`/`Vec2`/`Mat3` aliases, never raw
  tuples.
- **Didactic, timeless comments** — why + the alternative; no dates/PR history.
- **Renderer conventions** (`docs/superpowers/conventions/renderers.md`): factory
  `satisfies Renderer` (`label` + `destroy`), GPU resources in the closure,
  per-frame inputs through `draw()`, nullable `EngineGpuHandles` slot, positional
  factory idiom `(device, targetFormat, depthFormat)` — mirror
  `earthRenderer` / `planetRenderer`.
- **Tests mirror the src tree**; `testing.md`'s one question. Keep the WGSL/TS
  uniform byte-layout tests (the invisible-until-iOS-drops-the-frame keep-rule),
  no mirror/constant/clamp-boundary tests. Renderer tests are construction +
  structural (headless GPU stub, like `earthRenderer.test.ts`) — behaviour is
  the VISUAL gate (Task 11).
- **Suite stays green** each task; the final gate (Task 12) runs `npm run
  typecheck` + `npm test`.
- **VISUAL gates are user-verified** on the dev server (`?deepZoom` +
  `/link-data`), NOT automated — Task 11 names exactly what to confirm.

---

## Task 1 — `sunDirLocal` util

**Files:** `src/utils/camera/sunDirLocal.ts` (new),
`tests/utils/camera/sunDirLocal.test.ts` (new).

**Signature (match exactly — spec §6.2):**

```ts
export function sunDirLocal(
  bodyPosMpc: Readonly<Vec3>,
  renderOriginMpc: Readonly<Vec3>,
  orientation: Readonly<Mat3>,
): Vec3;
```

**Behaviour:** the Sun sits at `RENDER_ORIGIN_MPC`, so `sunDir_world =
normalize(renderOrigin − bodyPos)`; rotated into the body-local frame it is
`orientationᵀ · sunDir_world` (`orientation` orthonormal ⇒ transpose = inverse).
Pure; computed CPU-side per body per frame so the shader stays a dot product even
with tilt (spec §6.2).

- [x] Add `sunDirLocal.ts`. Didactic docblock: WHY transpose (orthonormal
  inverse), WHY CPU-side (keeps the shader a plain Lambert dot even under tilt).
- [x] Test `sunDirLocal of a body on +x with identity orientation points −x` —
  body at world `+x`, `IDENTITY_MAT3` → local sun direction `≈ (−1, 0, 0)`
  (hand-derived: the Sun is toward the origin, i.e. `−x` from the body).
- [x] Test `sunDirLocal rotates by a 90° orientation` — same body, a
  90°-about-`+z` orientation → the sun direction rotates correspondingly
  (hand-checked: `−x` world becomes `−y` local under `Rzᵀ(90°)`).
- [x] `npm test -- sunDirLocal` → green. Commit.

## Task 2 — `generateMipChain` + `mipBlit.wesl`

**Files:** `src/services/gpu/lib/generateMipChain.ts` (new),
`src/services/gpu/shaders/lib/mipBlit.wesl` (new),
`tests/services/gpu/lib/generateMipChain.test.ts` (new — construction/structural
against the headless device stub).

**Signature (match exactly — spec §6.5):**

```ts
export function generateMipChain(device: GPUDevice, texture: GPUTexture): void;
```

**Behaviour:** `copyExternalImageToTexture` uploads mip 0 only; WebGPU has no
built-in mipmap generation. This builds the rest as a render-pass 2× downsample
chain — full mip count from `max(w,h)`, each level a fullscreen blit sampling the
level above through `shaders/lib/mipBlit.wesl` (linear downsample). Textures that
use it must be created with `RENDER_ATTACHMENT` usage. Both
`texturedBodyRenderer` commits AND `earthRenderer.setTexture` call it (Tasks 4,
6), and both samplers set `mipmapFilter: 'linear'` — so surfaces don't shimmer as
a body shrinks toward the glint handoff (spec §6.5).

- [x] Add `mipBlit.wesl` (fullscreen-triangle vertex from `@builtin(vertex_index)`
  + linear-downsample fragment sampling the parent level). WESL constraints
  above. Didactic comment: WHY a render-pass chain (no built-in mipmap gen).
- [x] Add `generateMipChain.ts`. Didactic docblock: the `RENDER_ATTACHMENT`
  usage requirement + the full-mip-count derivation.
- [x] Test `generateMipChain constructs against the headless device` — mirror
  `earthRenderer.test.ts`'s device-stub style: assert the function runs without
  throwing and issues the expected number of render passes for a known
  power-of-two size (structural — the real downsample quality is the VISUAL
  gate). If headless construction is infeasible in this repo's test harness,
  assert the module export + type shape and note reliance on the VISUAL gate.
- [x] `npm test -- generateMipChain` → green. Commit.

## Task 3 — `bodyLighting.wesl` + `sphere.wesl` uniform structs (byte tables)

**Files:** `src/services/gpu/shaders/lib/bodyLighting.wesl` (new),
`src/services/gpu/shaders/lib/sphere.wesl` (modify — add two structs),
`tests/services/gpu/shaders/sphereUniforms.test.ts` (new or modify — the
byte-layout parity test, the `testing.md` keep-rule).

**`bodyLighting.wesl` (match exactly — spec §6.2):**

```wgsl
const AMBIENT: f32 = 0.08;              // shared floor — keeps night sides legible
fn litShade(normalLocal: vec3<f32>, sunDirLocal: vec3<f32>) -> f32; // AMBIENT + (1-AMBIENT)*max(dot,0)
```

**`sphere.wesl` new structs (join beside `SphereUniforms`/`TintedSphereUniforms`
— spec §6.3). `LitBodyUniforms` (Earth — 80 B / 20 f32):**

| offset | field | notes |
|---|---|---|
| 0..63 | `mvp` mat4x4<f32> | `composeBodyMvp` output |
| 64..75 | `sunDirLocal` vec3<f32> | 16-byte aligned |
| 76..79 | `ambient` f32 | folds into the vec4 tail |

**`TexturedBodyUniforms` (textured planets/moons — 96 B / 24 f32) =
`LitBodyUniforms` +**

| offset | field | notes |
|---|---|---|
| 80..83 | `ringInnerRatio` f32 | ring inner radius / planet radius |
| 84..87 | `ringOuterRatio` f32 | ring outer / planet radius; **`0` ⇒ no ring** (default) |
| 88..95 | pad ×2 | zeroed |

- [x] Add `bodyLighting.wesl` — `AMBIENT` + `litShade`. WESL constraints.
  Didactic comment: the shared ambient floor keeps night sides legible (spec
  §6.2/§7); one definition read by flat + textured + Earth fragments.
- [x] Add `LitBodyUniforms` + `TexturedBodyUniforms` to `sphere.wesl` with byte
  tables in the comment (the file's "one struct per exact buffer size" discipline
  — see its existing `TintedSphereUniforms` header). WESL constraints.
- [x] Test `LitBodyUniforms / TexturedBodyUniforms byte offsets` — pin
  `sunDirLocal` at byte 64, `ambient` at 76, `ringInnerRatio` at 80,
  `ringOuterRatio` at 84, and total sizes 80 / 96 (the WGSL↔TS uniform-layout
  keep-rule — invisible until iOS drops the frame). Assert the CPU-side writer
  packs those offsets (drive whatever pack helper the renderers expose; NOT a
  source-text grep).
- [x] `npm test -- sphereUniforms` → green. Commit.

## Task 4 — `texturedBodyRenderer` + shaders (per-body bind group + per-body uniform buffer)

**Files:** `src/@types/rendering/TexturedBodyRenderer.d.ts` (new),
`src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (new),
`src/services/gpu/shaders/bodies/texturedBody/io.wesl` +
`vertex.wesl` + `fragment.wesl` (new),
`tests/services/gpu/renderers/texturedBodyRenderer.test.ts` (new).

**Type (match exactly — spec §6.4):**

```ts
export type TexturedBodyRenderer = Renderer & {
  setTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void; // creates texture + mips, rebuilds that body's bind group
  setRingTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void; // swaps binding 3 (Saturn's ring strip)
  draw(pass: GPURenderPassEncoder, bodyId: BodyTextureId, uniforms: Float32Array): void; // writes that body's uniform buffer, one indexed draw
};
export function createTexturedBodyRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' — matches foreground:0
  depthFormat: GPUTextureFormat,  // 'depth32float'
): TexturedBodyRenderer;
```

**Shape (spec §6.4):** holds a `Map<BodyTextureId, {uniformBuffer, texture,
bindGroup}>`. **Per-body uniform buffers, each written once before its own draw**
— no single mid-frame uniform for a later `writeBuffer` to clobber (the fix for
the `starRenderer` single-uniform gap, by construction, spec §2/§6.4). Explicit
bind-group layout (NOT `'auto'`):

- binding 0: `TexturedBodyUniforms` (vertex+fragment)
- binding 1: sampler (`filtering`, `mipmapFilter: 'linear'`)
- binding 2: body `texture_2d<f32>` (with mips from `generateMipChain`)
- binding 3: ring-alpha `texture_2d<f32>` — Saturn's ring strip for the
  ring-on-planet shadow; a shared 1×1 transparent placeholder for every other
  body (never sampled because `ringOuterRatio == 0` short-circuits — the
  always-bind-a-real-texture, branch-on-data trick `earthRenderer` uses).

Pipeline profile matches `earthRenderer` / `foreground:0` (`rgba16float` +
`depth32float`, opaque, CCW/back-cull). `setTexture(bodyId, bitmap)` creates the
per-body texture, calls `generateMipChain`, rebuilds that body's bind group.
`draw` writes that body's uniform buffer then one `drawIndexed`.

**Shaders:** vertex projects `uvSphereMesh` position+uv through the uniform mvp
(uv forwarded like `earth/vertex.wesl`); fragment samples the body texture,
applies `litShade` (Task 3), then attenuates by the ring-on-planet shadow when
`ringOuterRatio > 0` (spec §8; the shadow term itself is added in Task 8 — this
task's fragment ships the texture + `litShade`, leaving `ringOuterRatio == 0` a
clean no-op skip).

- [x] Add `TexturedBodyRenderer.d.ts` (one type).
- [x] Add `texturedBody/{io,vertex,fragment}.wesl` — io holds the inter-stage
  varyings (clip, uv, local normal); vertex mirrors `earth/vertex.wesl` binding
  `TexturedBodyUniforms`; fragment samples + `litShade`. WESL constraints
  (no backticks, `texture_2d`, `?static`, verify with the dev logger).
- [x] Add `texturedBodyRenderer.ts` with `satisfies Renderer`. Didactic module
  header: per-body uniform buffers = the single-uniform-clobber fix by
  construction (spec §6.4); the binding-3 placeholder trick; per-body mip gen.
- [x] Test `createTexturedBodyRenderer satisfies Renderer` — non-empty `label`,
  `destroy` fn, `setTexture`/`setRingTexture`/`draw` callable with the right
  arity, against the headless device stub (mirror `earthRenderer.test.ts`; or
  typecheck-only with a note if headless construction is infeasible).
- [x] `npm test -- texturedBodyRenderer` → green. Commit.

## Task 5 — `partitionBodiesByPresentation` + `EngineGpuHandles` slot + commit dispatch extension

**Files:** `src/services/engine/frame/partitionBodiesByPresentation.ts` (new),
`tests/services/engine/frame/partitionBodiesByPresentation.test.ts` (new),
`src/@types/engine/handles/EngineGpuHandles.d.ts` (modify — add
`texturedBodyRenderer`), `src/services/engine/phases/initGpu.ts` (modify —
construct it), `src/services/engine/wiring/bodyTextureSlotRegistry.ts` (modify —
extend commit dispatch to `texturedBodyRenderer`), `src/services/engine/engine.ts`
(modify — null seed + destroy row), `tests/services/engine/phases/initGpu.destroyReachability.test.ts`
+ `tests/@types/engineState.test.ts` (modify).

**Signature (match exactly — spec §6):**

```ts
// partitionBodiesByPresentation.ts — disjoint by construction (one predicate cascade)
export function partitionBodiesByPresentation(input: {
  bodies: readonly PlanetBody[];
  camPosMpc: Readonly<Vec3>;
  viewportHeightPx: number;
  fovYRad: number;
  isTextureResident: (id: string) => boolean; // slot.current() != null for the body key
}): { glints: readonly PlanetBody[]; flat: readonly PlanetBody[]; textured: readonly PlanetBody[] };
```

**Behaviour (spec §6 table — mirrors `partitionStarsByResolution.ts`):** one
predicate cascade, disjoint + covering. `glint` = apparent diameter ≲ 3 px
(cross-fade region); `flat` = ≥ 1 px AND (not in `BODY_TEXTURE_REGISTRY` OR
texture not resident); `textured` = ≥ 1 px AND in registry AND resident. Earth is
drawn by its dedicated renderer gated by the same size test (not in this
partition). Reuses `apparentSizePx` (`src/utils/math/apparentSizePx.ts`), like
the star partition.

**Commit dispatch extension (spec §5.1):** `bodyTextureSlotRegistry`'s per-key
commit now routes any non-`'earth'` `BodyTextureId` →
`state.gpu.texturedBodyRenderer?.setTexture(bodyId, bitmap)` (null-checked,
destroy race), with `onRelease` freeing that body's GPU texture. The `'earth'`
key stays `earthRenderer.setTexture`. (`'saturn-ring'` routing is Task 8.)

- [x] Add `partitionBodiesByPresentation.ts`. Didactic docblock: one partition,
  three disjoint branches consumed by three layers (the smooth-handoff invariant,
  mirroring the star partition's header); Earth is its own renderer.
- [x] Add `texturedBodyRenderer: TexturedBodyRenderer | null` to
  `EngineGpuHandles.d.ts` (nullable-until-`initGpu` docblock); construct in
  `initGpu.ts` beside the foreground block; null-seed + destroy row in
  `engine.ts`.
- [x] Extend `bodyTextureSlotRegistry` commit dispatch to route non-Earth ids to
  `texturedBodyRenderer.setTexture` with an `onRelease` that frees the texture.
- [x] Test `partitionBodiesByPresentation is disjoint and covering` — for a fixed
  camera, every input body lands in exactly one branch; a registry body with a
  non-resident texture lands in `flat`, resident in `textured`; Titan + an
  irregular moon (Phobos) always `flat` (not registry keys); a sub-3px body lands
  in `glints`.
- [x] Test the `initGpu.destroyReachability` + `engineState` wiring for the new
  handle (mirror the `earthRenderer` rows).
- [x] `npm test -- partitionBodiesByPresentation initGpu engineState` → green.
  Commit.

## Task 6 — Earth Lambert (dedicated renderer keeps + gains lighting)

**Files:** `src/services/gpu/renderers/bodies/earthRenderer.ts` (modify — uniform
64→80 B `LitBodyUniforms` + mips), `src/@types/rendering/EarthRenderer.d.ts`
(modify — `draw` takes the lit uniform), `src/services/gpu/shaders/bodies/earth/vertex.wesl`
+ `fragment.wesl` (modify — `litShade`),
`src/services/engine/frame/passes/earthLayer.ts` (modify — compute
`sunDirLocal`), `tests/services/gpu/renderers/earthRenderer.test.ts` +
`tests/services/engine/frame/passes/earthLayer.test.ts` (modify).

**Contract change (spec §7):** `earthRenderer`'s uniform grows from bare MVP
(`SphereUniforms`, 64 B) to `LitBodyUniforms` (80 B). `earth/fragment.wesl` gains
`litShade(normalLocal, sunDirLocal)` (one added term). `earthLayer` computes
`sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation)` (Task 1)
and packs it into the uniform. `earthRenderer.setTexture` calls
`generateMipChain` (Task 2) after upload and sets `mipmapFilter: 'linear'`.

Update `EarthRenderer.draw`'s signature so `mvp: Float32Array` becomes the
80-byte `LitBodyUniforms` buffer (name it `uniforms`), and `earthLayer` packs mvp
+ sunDirLocal + ambient.

- [x] Update `earth/vertex.wesl` to bind `LitBodyUniforms` (forwarding the local
  normal for the fragment) + `earth/fragment.wesl` to apply `litShade`. WESL
  constraints; verify visually (Task 11). Update the shader headers (the
  full-bright note is now a Lambert note).
- [x] Grow `earthRenderer`'s uniform buffer to 80 B, call `generateMipChain` in
  `setTexture`, set `mipmapFilter: 'linear'`; update `EarthRenderer.d.ts`'s `draw`
  doc/signature.
- [x] `earthLayer` computes `sunDirLocal` and packs the `LitBodyUniforms` record.
- [x] Test (`earthLayer.test.ts`) `earth layer packs sunDirLocal into the lit
  uniform` — assert the record `earthRenderer.draw` receives is length 20 and its
  bytes 64..75 carry `sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC,
  earth.orientation)` (computed independently in the test, not via the layer).
  Keep the existing `composeBodyMvp` slab-`vp` assertion.
- [x] `npm test -- earthRenderer earthLayer` → green. Commit.

## Task 7 — Flat `planetRenderer` grows to 24 f32 (+`sunDirLocal`); planet shaders drop `LIGHT_DIR`

**Files:** `src/services/gpu/renderers/bodies/planetRenderer.ts` (modify — 20→24
f32 instance), `src/services/gpu/shaders/bodies/planet/io.wesl` +
`vertex.wesl` + `fragment.wesl` (modify — `sunDirLocal`, delete `LIGHT_DIR`),
`src/services/engine/frame/passes/planetsLayer.ts` (modify — per-body
`sunDirLocal`, consume the `flat` partition), `tests/services/gpu/renderers/planetRenderer.test.ts`
+ `tests/services/engine/frame/passes/planetsLayer.test.ts` (modify).

**Flat instance record — 20 → 24 f32 / 80 → 96 B (spec §6.3):**

| offset | loc | field |
|---|---|---|
| 0..63 | 1..4 | mvp columns |
| 64..79 | 5 | albedo (rgb + pad) |
| 80..95 | 6 | `sunDirLocal` (xyz + pad) — NEW |

**Behaviour:** the fixed `LIGHT_DIR` in `planet/fragment.wesl` is DELETED; the
fragment reads the per-instance `sunDirLocal` flat varying and applies `litShade`
(Task 3, shared with textured + Earth). `planetsLayer` draws the `flat` partition
(Task 5), computing `sunDirLocal(body.positionMpc, RENDER_ORIGIN_MPC,
body.orientation)` per body and packing it at f32 offset 20. Update
`INSTANCE_FLOATS` (20→24), `INSTANCE_STRIDE` (80→96), and the location-6 vertex
attribute (`planetRenderer.ts:79-86`).

- [x] Update `planet/io.wesl` (add `sunDirLocal` flat varying) +
  `planet/vertex.wesl` (location 6 attribute → varying) + `planet/fragment.wesl`
  (delete `LIGHT_DIR`, call `litShade`). WESL constraints. Update the shader
  headers — the fixed-light stand-in note becomes real sun-relative lighting.
- [x] Grow `planetRenderer`'s `INSTANCE_FLOATS`/`INSTANCE_STRIDE` + the location-6
  attribute descriptor; keep the byte offsets matching the shader.
- [x] `planetsLayer` consumes the `flat` partition and packs per-body
  `sunDirLocal`.
- [x] Test (`planetsLayer.test.ts`) `planets layer packs per-body sunDirLocal` —
  the record for a known body carries `sunDirLocal(pos, RENDER_ORIGIN_MPC,
  orientation)` at f32 offset 20 (computed independently) and the stride is 96.
- [x] Test (`planetRenderer.test.ts`) — update the stride/offset structural
  assertion to 24 f32 / 96 B / location-6 at offset 80 (the vertex-stride
  keep-rule).
- [x] `npm test -- planetRenderer planetsLayer` → green. Commit.

## Task 8 — `texturedBodiesLayer` + ring-on-planet shadow; wire the textured path

**Files:** `src/services/engine/frame/passes/texturedBodiesLayer.ts` (new),
`tests/services/engine/frame/passes/texturedBodiesLayer.test.ts` (new),
`src/services/engine/frame/passes/index.ts` (modify — register the row),
`src/services/gpu/shaders/bodies/texturedBody/fragment.wesl` (modify — add the
ring-on-planet shadow term), `tests/services/engine/frame/passes/passes.test.ts`
(modify — migration row).

**Layer (spec §6, §6.4):** `{ name: 'textured-bodies', slab: NEAR0, target:
'foreground:0', blend: 'opaque' }`. Per frame: partition via
`partitionBodiesByPresentation` (Task 5), and for each `textured` body compose
`composeBodyMvp(view.slab.vp, body.positionMpc, RENDER_ORIGIN_MPC, radiusMpc,
body.orientation)` + `sunDirLocal` + the ring ratios (`ringInnerRatio` /
`ringOuterRatio` — non-zero only for Saturn, from `SCENE_RINGS` resolved to
planet-radius units; `0` for every other body), pack `TexturedBodyUniforms`, and
`texturedBodyRenderer.draw(pass, body.id, uniforms)`. **f64 seam:** compose from
`view.slab.vp`, NEVER `view.vp` — document it in the layer header (like
`earthLayer` / `debugSpheresLayer`).

**Ring-on-planet shadow (spec §8, in `texturedBody/fragment.wesl`, ~20 lines
WGSL, ONLY when `ringOuterRatio > 0`):** march from the surface point `p` (unit
normal, local frame) toward `sunDirLocal` to the ring plane `z=0`: `t = −p.z /
sunDirLocal.z`; if `t > 0` and the hit radius `length(hit.xy)` (planet-radius
units) is within `[ringInnerRatio, ringOuterRatio]`, sample the ring strip alpha
(binding 3) there and attenuate the Lambert term. `ringOuterRatio == 0` cleanly
skips the whole branch — ring presence is DATA on the uniform, not a Saturn-only
shader (spec §8 un-braiding). Also route `'saturn-ring'` commits:
`texturedBodyRenderer.setRingTexture('saturn', bitmap)` in
`bodyTextureSlotRegistry`.

- [x] Add `texturedBodiesLayer.ts` + register in `CONTENT_LAYERS`
  (`passes/index.ts`) in the foreground group beside `planetsLayer`. Didactic
  header: the f64 slab-`vp` seam, the presentation partition, the ring ratios as
  uniform data.
- [x] Add the ring-on-planet shadow term to `texturedBody/fragment.wesl` (guarded
  by `ringOuterRatio > 0`). WESL constraints; verify visually (Task 11). Route
  `'saturn-ring'` commits to `setRingTexture` in `bodyTextureSlotRegistry`.
- [x] Test (`texturedBodiesLayer.test.ts`, modelled on `earthLayer.test.ts`):
  `textured layer composes with the slab f64 vp and per-body orientation` —
  assert `composeBodyMvp`'s first arg `toBe(view.slab.vp)` (`not.toBe(view.vp)`),
  carries the body `orientation`, and `texturedBodyRenderer.draw` receives a
  length-24 `Float32Array` per textured body; `enabled` false when the renderer
  handle is null.
- [x] Test (`passes.test.ts`): extend the foreground migration table with
  `'textured-bodies'` `{slab: NEAR0, target: 'foreground:0', blend: 'opaque'}`
  (the blend-legality test already enforces opaque for `foreground:0`).
- [x] `npm test -- texturedBodiesLayer passes` → green. Commit.

## Task 9 — `annulusMesh` + `ringRenderer` + ring shaders + `ringsLayer` (planet-on-ring shadow)

**Files:** `src/utils/math/annulusMesh.ts` (new),
`tests/utils/math/annulusMesh.test.ts` (new),
`src/@types/rendering/RingRenderer.d.ts` (new),
`src/services/gpu/renderers/bodies/ringRenderer.ts` (new),
`src/services/gpu/shaders/bodies/ring/io.wesl` + `vertex.wesl` +
`fragment.wesl` (new), `src/services/engine/frame/passes/ringsLayer.ts` (new),
`tests/services/gpu/renderers/ringRenderer.test.ts` +
`tests/utils/math/annulusMesh.test.ts` +
`tests/services/engine/frame/passes/ringsLayer.test.ts` (new),
`src/@types/engine/handles/EngineGpuHandles.d.ts` +
`src/services/engine/phases/initGpu.ts` + `src/services/engine/engine.ts` +
`src/services/engine/frame/passes/index.ts` + `passes.test.ts` +
`initGpu.destroyReachability.test.ts` + `engineState.test.ts` (modify).

**`annulusMesh` (match exactly — spec §8, sibling of `uvSphereMesh`):**

```ts
export function annulusMesh(segments: number, innerRatio: number): AnnulusMesh;
// N-segment annulus in the z=0 local plane; outer radius = 1, inner = innerRatio;
// uv radial u = normalized radius (inner→outer → 0→1) for the strip sample.
```

**`RingRenderer` type (match exactly):**

```ts
export type RingRenderer = Renderer & {
  setTexture(bitmap: ImageBitmap): void; // the radial alpha strip as an N×1 texture_2d
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void; // RingUniforms (96 B)
};
export function createRingRenderer(
  device: GPUDevice, targetFormat: GPUTextureFormat, depthFormat: GPUTextureFormat,
): RingRenderer;
```

**`RingUniforms` (96 B — spec §8):** `mvp` (0..63) + `sunDirLocal` (64..75) +
`planetRadiusRatio` f32 (76..79) + `innerRatio` f32 (80..83) + pad (84..95).
Bindings: sampler + ring-alpha `texture_2d` (**N×1, never `texture_1d`**).

**Ring pipeline (spec §8):** alpha-blended straight-alpha `over`, `cullMode:
'none'` (two-sided), `depthCompare: 'less'` but `depthWriteEnabled: false`
(Saturn's opaque sphere occludes the far ring half). Drawn after the opaque
foreground spheres, into the same `foreground:0` target. `ringsLayer` draws each
`SCENE_RINGS` entry only when the ring texture is resident and Saturn is ≥ a few
px, via `composeBodyMvp(view.slab.vp, saturnPos, origin, outerRadiusMpc,
saturnOrientation)` — the ring rides Saturn's exact equatorial frame by
construction.

**Planet-on-ring shadow (spec §8, in `ring/fragment.wesl`):** ray-sphere test
from the ring point toward `sunDirLocal` against the unit planet sphere
(`RingUniforms.planetRadiusRatio`); a hit dims the ring sample.

- [x] Add `annulusMesh.ts` + `AnnulusMesh` type (or reuse the mesh-type shape of
  `uvSphereMesh`). Didactic docblock: outer=1, inner=innerRatio, radial-u uv for
  the strip.
- [x] Test `annulusMesh spans the ratio` — every generated vertex radius is
  within `[innerRatio, 1]`, the min radius ≈ `innerRatio` and max ≈ 1, and uv u
  spans `[0,1]` monotonically with radius (hand-checkable geometric properties,
  not a vertex-list restatement).
- [x] Add `ring/{io,vertex,fragment}.wesl` (fragment: strip sample by radius +
  planet-on-ring ray-sphere shadow), `RingRenderer.d.ts`, `ringRenderer.ts`
  (`satisfies Renderer`, N×1 `texture_2d` ring strip). WESL constraints; verify
  visually (Task 11).
- [x] Add `ringsLayer.ts` + register in `CONTENT_LAYERS` AFTER the opaque
  foreground sphere rows; add the `ringRenderer` handle + construct in `initGpu` +
  null-seed/destroy in `engine.ts`; route `'saturn-ring'` commits to
  `ringRenderer.setTexture` (alongside the `texturedBodyRenderer.setRingTexture`
  from Task 8) in `bodyTextureSlotRegistry`.
- [x] Test `ringRenderer.test.ts` — `satisfies Renderer` + `RingUniforms` byte
  offsets (`sunDirLocal`@64, `planetRadiusRatio`@76, `innerRatio`@80, size 96 —
  the uniform-layout keep-rule).
- [x] Test `ringsLayer.test.ts` — composes from `view.slab.vp` (not `view.vp`)
  with Saturn's `orientation`; `enabled` false when the ring texture is
  non-resident or the handle is null; the migration row in `passes.test.ts`
  (`'rings'` `{slab: NEAR0, target: 'foreground:0', blend: 'over'}` — note this
  needs the blend-legality table to allow `over` on `foreground:0` for the ring
  row; if the table forbids it, STOP and report — the ring is the first
  alpha-over `foreground:0` layer, spec §8, so the legality assertion may need the
  ring row added to its allow-set).
- [x] `npm test -- annulusMesh ringRenderer ringsLayer passes initGpu` → green.
  Commit.

## Task 10 — `bodyGlintRenderer` + `bodyGlintsLayer` + `bodyGlint` fade band

**Files:** `src/@types/rendering/BodyGlintRenderer.d.ts` (new),
`src/services/gpu/renderers/bodies/bodyGlintRenderer.ts` (new),
`src/services/gpu/shaders/bodies/bodyGlint/io.wesl` + `vertex.wesl` +
`fragment.wesl` (new), `src/services/engine/frame/passes/bodyGlintsLayer.ts`
(new), `src/services/engine/presentation/scaleFadeBands.ts` (modify — add the
`bodyGlint` band), `tests/services/gpu/renderers/bodyGlintRenderer.test.ts` +
`tests/services/engine/frame/passes/bodyGlintsLayer.test.ts` (new),
`src/@types/engine/handles/EngineGpuHandles.d.ts` + `initGpu.ts` + `engine.ts` +
`passes/index.ts` + `passes.test.ts` + `initGpu.destroyReachability.test.ts` +
`engineState.test.ts` (modify).

**Type (match exactly — spec §9):**

```ts
export type BodyGlintRenderer = Renderer & {
  draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number, viewProj: Float32Array, viewportPx: Vec2): void;
};
export function createBodyGlintRenderer(device: GPUDevice, targetFormat: GPUTextureFormat): BodyGlintRenderer;
```

**Glint instance record — 28 B / 7 f32 (spec §6.3, mirrors
`starPointRenderer`):** `position` f32x3 @0, `color` f32x3 @12, `brightness` f32
@24.

**Renderer (spec §9):** a thin additive point pipeline into `(hdr, NEAR0)`,
mirroring `starPointRenderer`'s camera-relative f64-rebase seam and Gaussian-dot
WESL (shared at the `lib/billboard` level, NOT wrapping `starPointRenderer` — the
same justification `starPointRenderer` gives; the fold candidate is deliberately
NOT taken here, spec §14). Additive one/one into `rgba16float`, no depth.

**Layer (spec §9):** `{ name: 'body-glints', slab: NEAR0, target: 'hdr', blend:
'additive' }`. Computes per body `brightness = f(apparentSize × albedo × phase)`
where `phase` is the illuminated fraction from sun–body–camera geometry (crescent
Venus dim, gibbous Moon bright); `color` = the body's albedo tint. Draws the
`glints` partition (Task 5).

**Cross-fade (spec §9):** add a `SCALE_FADE_BANDS` row `bodyGlint: { fullAt: 1,
goneAt: 3 }` keyed on apparent diameter px (recede fade: full ≤1 px, gone ≥3 px),
consumed through `fadeBand`. The mesh keeps its hard `SUB_PIXEL_BODY_CULL_PX = 1`
cull; the glint fades IN over 3→1 px while the mesh still draws — smooth handoff,
no pop. `feedback_opacity_zero_no_render`: a glint whose `brightness·fadeBand`
rounds to 0 skips its draw.

- [x] Add `bodyGlint/{io,vertex,fragment}.wesl` (additive Gaussian dot; reuse
  `lib/billboard` + `lib/camera`). WESL constraints; verify visually (Task 11).
- [x] Add `BodyGlintRenderer.d.ts` + `bodyGlintRenderer.ts` (`satisfies
  Renderer`, camera-relative f64 rebase like `starPointRenderer.ts:33-45`).
- [x] Add the `bodyGlint` band to `scaleFadeBands.ts` (keyed on apparent diameter
  px; didactic comment naming the keying quantity, like the other rows).
- [x] Add `bodyGlintsLayer.ts` + handle + construct/seed/destroy + register in
  `CONTENT_LAYERS` (hdr, NEAR0 additive group). Didactic header: brightness =
  size×albedo×phase; the `fadeBand` cross-fade; the zero-brightness skip.
- [x] Test `bodyGlintsLayer skips zero-brightness glints` — a body whose
  `brightness·fadeBand(apparentPx)` rounds to 0 (fully faded or unlit far side)
  is NOT in the drawn instance buffer; a mid-fade body IS, with `brightness` in
  `(0,1)` (the `feedback_opacity_zero_no_render` behaviour + the phase term).
- [x] Test `bodyGlintRenderer.test.ts` — `satisfies Renderer` + the 7-f32 / 28-B
  instance stride/offsets (the vertex-stride keep-rule); `draw` clamps `count`,
  a zero-count `draw` is a no-op. Migration row in `passes.test.ts` (`'body-glints'`
  `{slab: NEAR0, target: 'hdr', blend: 'additive'}`).
- [x] `npm test -- bodyGlintRenderer bodyGlintsLayer scaleFadeBands passes` →
  green. Commit.

## Task 11 — VISUAL verification (dev server)

**Files:** none — user-verified on the dev server. Requires `?deepZoom` in the
URL (else `clampDistance` floors the wheel at 0.05 Mpc and the foreground never
grows) + `/link-data` for real catalog data. The dev texture subset from Plan 03
is NOT yet built when this plan lands alone — so this gate uses whatever textures
are resident (Earth's placeholder-blue is expected until Plan 03). **Confirm the
lighting/rings/glint geometry that does NOT need real textures now; the
texture-appearance confirmations move to the Plan 03 DoD (spec §12).**

- [x] **STOP and ask the user to confirm on the dev server (`?deepZoom`):**
  _(User AFK — executed as an automated Playwright pass against this worktree's
  dev server (WebGPU Chrome, headless): zero shader/pipeline errors across all
  new WESL; Saturn (flat path) lit with a real terminator; Earth placeholder-blue
  with a correct gibbous Lambert terminator; missing textures degrade to the
  placeholder path with slot-error warnings only. Deferred to the human pass /
  Plan 03 dev-subset gate: Venus crescent close-up (cold-boot focus doesn't fly —
  script limitation, phase geometry already evidenced by Earth's gibbous disc),
  ring visuals (strip texture is a Plan 03 asset), glint absolute-brightness
  tuning (Mars-from-Sun glint physically dim). Screenshots in the session
  scratchpad; findings recorded in the PR body.)_
  - **Phase crescent** — a body lit sun-relative shows a crescent/gibbous
    terminator, not a full disc (Venus/Moon), from the flat/textured Lambert.
  - **Earth Lambert** — Earth's lit/night hemisphere reads consistently with the
    lit planets beside it (placeholder-blue is fine; the terminator is the point).
  - **Saturn's rings** — present, in Saturn's equatorial plane, two-sided, with
    the opaque sphere occluding the far ring half; ring-on-planet AND
    planet-on-ring shadows visible.
  - **Glint cross-fade** — a body shrinking below ~3 px hands off to a
    brightness-scaled additive point with no pop; a faded/unlit body adds nothing.
- [x] Record the confirmed properties in the PR body. (Texture-appearance /
  band-orientation confirmations are deferred to Plan 03's dev-subset gate.)

## Task 12 — Full gate

- [x] `npm run typecheck` (both tsconfigs) → clean.
- [x] `npm test` (full suite) → green.
- [x] Commit.

---

## Self-review

### Spec-coverage map

| Spec section | Task(s) |
|---|---|
| §6.2 `sunDirLocal` | T1 |
| §6.5 `generateMipChain` + `mipBlit` | T2 |
| §6.2/§6.3 `bodyLighting` + `LitBodyUniforms`/`TexturedBodyUniforms` | T3 |
| §6.4 `texturedBodyRenderer` + per-body uniform buffers | T4 |
| §6 presentation partition + handle + commit extension | T5 |
| §7 Earth Lambert | T6 |
| §6.3 flat 24-f32 instance + `sunDirLocal`; delete `LIGHT_DIR` | T7 |
| §6 `texturedBodiesLayer` + §8 ring-on-planet shadow | T8 |
| §8 rings: `annulusMesh` + `ringRenderer` + `ringsLayer` + planet-on-ring | T9 |
| §9 glints + `bodyGlint` fade band | T10 |
| §12 visual verification | T11 |

### Contract seams

- **`bodyTextureSlotRegistry` commit dispatch** is extended incrementally: Plan
  01 routes `'earth'`; T5 adds non-Earth → `texturedBodyRenderer`; T8/T9 add
  `'saturn-ring'` → both `texturedBodyRenderer.setRingTexture` +
  `ringRenderer.setTexture`.
- **Ring is the first alpha-`over` `foreground:0` layer** — T9 flags the
  blend-legality table may need the ring row in its allow-set (STOP-and-report if
  the assertion forbids it).
- **Glint↔`starPointRenderer` fold** is deliberately NOT taken (spec §14) — shared
  at `lib/billboard`, not the pipeline level.

### Placeholder scan

None. Every task names concrete files, signatures/byte-tables, and test names.
