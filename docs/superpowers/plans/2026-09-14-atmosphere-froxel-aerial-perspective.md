# Froxel aerial perspective for the atmosphere — feature

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give the inside-the-atmosphere path scene depth. A camera-frustum
froxel volume (in-scatter + per-channel transmittance integrated to each slice)
is baked per frame for the one body the camera is inside, and a depth-keyed
full-screen pass applies it: sky rays keep today's sky-view answer, geometry
rays get the fog of their own distance. Retires the #698 ordering stopgap's
rationale.

**Spec:** `docs/superpowers/specs/2026-09-14-atmosphere-froxel-aerial-perspective-design.md`
— this plan implements §4 (Design) and §9 (Testing); §3 (Ground preparation) is
`docs/superpowers/plans/completed/2026-09-14-atmosphere-froxel-prep.md`.

**Precondition — do not start this plan until both hold:**

1. The prep plan has **merged to `main`** — PR #702, the seven prep refactors
   squash-merged (the plan itself lands in `plans/completed/` with that PR; the
   spec deliberately stays in `specs/`).
2. This branch is a NEW branch cut from — or rebased onto — that `main`; it is
   not #702's worktree. Verify before Task 1:
   `git log --oneline -8 origin/main` shows the prep squash, and
   `src/services/engine/frame/atmosphereShellUniforms.ts`,
   `src/@types/engine/frame/BodyRowSource.d.ts` and
   `scattering.wesl`'s `scatterStep` all exist. If any is missing, STOP — every
   task below consumes them.

**Lands as:** its own PR off that `main`. `/feature-done` runs at the end of
THIS PR and relocates the spec to `specs/completed/` (the prep PR deliberately
left it in `specs/`).

## Task dependency table

| #   | Task                                                     | Depends on | Parallelizable with |
| --- | -------------------------------------------------------- | ---------- | ------------------- |
| 1   | `froxelSlices.wesl` — the shared froxel geometry         | —          | —                   |
| 2   | The bake: `froxelLut.wesl`, renderer, compute step       | 1          | —                   |
| 3   | The apply: `aerialPerspective/fragment.wesl` + draw path | 1, 2       | —                   |
| 4   | The frame wiring: pass, `FRAME_ORDER`, resolved slab     | 2, 3       | —                   |
| 5   | Visual gate, perf, `/feature-done`                       | 1–4        | —                   |

**This chain is genuinely serial** — 2 creates the renderer file 3 extends, 3
provides the draw entry point 4 calls, and 4 is what makes anything visible for
5. Do not parallelise it into worktrees; the review pipeline
(`docs/superpowers/conventions/sdd-execution.md` Rule 2) is the concurrency here.

## Global constraints

- **Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly
  ONE symbol, the one they are named for; helpers go to `src/utils/`, constants
  to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list
  never grows.** The two new frame files (`encodeAtmosphereFroxel.ts`,
  `passes/aerialPerspectivePass.ts`) must therefore carry **no module-level
  constant**: sizes, workgroup dimensions and format live in the renderer.
- **Outside the shell nothing may change.** The proxy-mesh two-wall path, the
  sky-view LUT's dimensions and cadence, and every pixel of an outside frame stay
  as they are. The perf gate (Task 5) measures exactly this.
- `type` aliases never `interface`; one symbol per file in `src/@types/` and
  `src/utils/`; deep relative imports, no barrels.
- Comments explain WHY only: module header ≤ 10 lines, comment lines ≤ half the
  code lines. The two shader files carrying derivations (the slice mapping, the
  bake's ray) may run over — say so in the header's first line, as
  `scattering.wesl` does.
- **Testing** (`docs/superpowers/conventions/testing.md`): only the tests named
  per task. No mirror tests (never build the expected uniform record with the
  same builder the code calls), no constant restatements, no type-shape tests.
- File moves/renames go through the refactor CLI:
  `npm run refactor -- move <from> <to>` / `rename` — never `git mv` plus
  hand-edited imports (`.claude/skills/refactor/SKILL.md`).
- `npm run typecheck:fast` is unavailable in worktrees — use `npx tsc --noEmit`
  against both projects, or `npm run typecheck`.
- Stage specific paths; never `git add -A`. No `Co-Authored-By` trailer.
- **At every commit step, report the task's line-diff breakdown**: code /
  comment / test / doc lines added+removed, as four numbers.

### Shader rules — every task that touches a `.wesl` file

**Invoke the `wesl-shaders` skill before the first edit.** These are linker-level
constraints that fail at runtime, not at build:

- **No backticks in WESL comments**, including block comments — the parser
  tokenises them anyway. Single quotes for inline code.
- `import package::…;` is the **literal** token `package`, one identifier per
  line (no brace lists), and **all imports at the top of the file**. An import
  beside a call site is passed through verbatim and Chrome rejects the module.
- The import path's LAST segment is the symbol; everything before it is the
  module path. `package::atmosphere::froxelSlices::froxelSliceCoord` reads
  `froxelSliceCoord` out of `atmosphere/froxelSlices.wesl`.
- `textureSampleLevel`, never `textureSample`, anywhere reachable from
  non-uniform control flow (both branches of the apply qualify) — and for a
  mip-less LUT there is no level to select anyway.
- Build every pipeline and module through `createShaderModuleWithDevLog`
  (`src/services/gpu/shaderCompileLogger.ts`): **iOS drops the entire frame on
  one bad pipeline**, with no thrown error, and the logger's
  `getCompilationInfo()` dump against the LINKED WGSL is the only way to map an
  error line back to a source file.
- **The homogeneous-unproject landmine** (docs/RENDERER.md, and
  `shell/fragment.wesl`'s `insideRayDir`): reconstruct a full-screen ray as
  `normalize(P.xyz − cam · P.w)` for `P = invMvp · vec4(xy, 0, 1)`. Never divide
  by `w` first — under reversed-Z the far plane is `z = 0`, so the divide
  degenerates every ray to one direction (a uniform grey veil).

---

### Task 1: `froxelSlices.wesl` — the shared froxel geometry

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Files:**

- Create: `src/services/gpu/shaders/atmosphere/froxelSlices.wesl`

**Why:** the bake and the apply must agree on three things or the volume
mis-registers invisibly: the far bound `D`, the slice↔distance mapping in both
directions, and the ray each screen texel stands for. One module, imported by
both, is what makes agreement structural rather than reviewed. There is no TS
mirror and so no cross-language parity to keep (spec §4.4) — and therefore **no
TS test in this task**; its correctness is carried by the visual gate.

**Interfaces (the file's exported functions):**

```wgsl
// The far bound: the longest ray that can both graze the ground and stay under
// the atmosphere top, in the LOCAL frame where the top radius is 1.
//   D = sqrt(camRadius^2 - bottomRadius^2) + sqrt(1 - bottomRadius^2)
fn froxelMaxDistance(camRadius: f32, bottomRadius: f32) -> f32

// Slice index -> the distance its stored integral runs to. Squared over [0, D],
// so slice 0 is EXACTLY 0 (the identity: T = 1, L = 0) and the last slice is D.
//   d(i) = maxDistance * (i / (sliceCount - 1))^2
fn froxelSliceDistance(slice: f32, sliceCount: f32, maxDistance: f32) -> f32

// The inverse, as a NORMALIZED 3D texture w coordinate landing on texel centres:
//   w(d) = (sqrt(clamp(d / maxDistance, 0, 1)) * (sliceCount - 1) + 0.5) / sliceCount
// Invariant both halves rest on: w(froxelSliceDistance(i, N, D)) == (i + 0.5) / N.
fn froxelSliceCoord(distance: f32, sliceCount: f32, maxDistance: f32) -> f32

// The full-screen ray for 'uv', unprojected through 'invMvp' (homogeneous form).
fn froxelRayDir(invMvp: mat4x4<f32>, camPosLocal: vec3<f32>, uv: vec2<f32>) -> vec3<f32>

// Distance from the camera to the depth sample at 'uv', same frame as the ray.
//   length(P.xyz - camPosLocal * P.w) / abs(P.w),  P = invMvp * vec4(clipXy, depth, 1)
fn froxelRayDistance(invMvp: mat4x4<f32>, camPosLocal: vec3<f32>, uv: vec2<f32>, depth: f32) -> f32
```

**Deviations from the spec, both deliberate — record them in the module header:**

1. `froxelSliceCoord` takes `sliceCount`; the spec's two-argument form cannot be
   the exact inverse of `froxelSliceDistance` (the texel-centre offset needs N).
2. The ray reconstruction lives HERE rather than only in the apply's fragment.
   WESL modules cannot capture a consumer's `@group/@binding`
   (`scattering.wesl`'s header states the rule), so "the bake's ray equals the
   apply's ray by construction" (spec §4.3) is only achievable as a
   **parameterised** function both import. `insideRayDir` is therefore not copied
   into the apply — it is replaced by `froxelRayDir`, whose arithmetic is
   identical, so the sky branch stays pixel-identical (Task 3 asserts that by eye).

- [ ] **Step 1: Write the file.** Six functions: the five above plus one private
      `froxelUnproject(invMvp, camPosLocal, uv, clipZ) -> vec4<f32>` returning
      `P.xyz − cam·P.w` in `.xyz` and `P.w` in `.w`, so the dir and the distance
      share ONE numerator and cannot describe two rays. `froxelRayDir` folds the
      `P.w < 0` sign in and normalizes, exactly as `shell/fragment.wesl:334-350`
      does today; `froxelRayDistance` divides by `abs(P.w)`.

- [ ] **Step 2: Record the two landmines in the header** (≤ 10 lines plus the
      derivations, declared over-budget in line 1 as a maths file):
      - The divide by `w` is safe in `froxelRayDistance` **and only there**: its
        caller reaches it only when `depth` differs from the far-plane clear
        value, so `w` is bounded away from zero. `froxelRayDir` never divides.
      - The precision floor: `P.xyz − camPosLocal·P.w` cancels catastrophically
        for a near point — in f32 atmosphere-top units (Earth's top ≈ 6,471 km,
        one ulp of a unit coordinate ≈ 0.6 m) the reconstructed distance carries
        a ~metre ABSOLUTE error floor. That is fine by construction (fog is a
        kilometre-scale effect, and at metre range the lookup lands in the
        identity slice regardless), and it is recorded so nobody "fixes" it into
        a divide-then-subtract form, which trades a harmless absolute floor for
        the far-plane blow-up the homogeneous form exists to avoid.

- [ ] **Step 3: Verify it links.** Nothing imports it yet, so the check is
      mechanical: `npm test` (the WESL plugin runs under Vitest's transform) and
      `npm run build` must both pass with the file present.

- [ ] **Step 4: Commit** + line-diff breakdown.

```
feat(atmosphere): add the shared froxel slice + ray geometry module

The bake and the apply must agree on the far bound, the slice mapping and
the per-texel ray; one parameterised module is how they cannot disagree.
```

---

### Task 2: The bake — `froxelLut.wesl`, the renderer, the compute step

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Task 1.**

**Files:**

- Create: `src/services/gpu/shaders/atmosphere/froxelLut.wesl`
- Create: `src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.ts`
- Create: `src/@types/rendering/AerialPerspectiveRenderer.d.ts`
- Create: `src/services/engine/frame/encodeAtmosphereFroxel.ts`
- Create: `tests/services/engine/frame/encodeAtmosphereFroxel.test.ts`
- Modify: `src/@types/rendering/AtmosphereShellRenderer.d.ts:71-134` (adds
  `encodeFroxel`)
- Modify: `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`
  (construct the sub-renderer after the bundle loop; delegate; destroy it)
- Modify: `src/services/engine/frame/executeFrame.ts:86-100` (the `COMPUTE` row)
- Modify: `src/services/engine/frame/frameOrder.ts:16-24` (the compute line)

**Why:** the geometry rays need in-scatter and transmittance integrated to their
own distance, which a 2D sky-view table indexed by direction alone cannot carry.
Hillaire's split: keep the LUT for sky rays, add a camera-frustum volume for the
rest.

**Interfaces:**

```ts
// src/@types/rendering/AerialPerspectiveRenderer.d.ts — the file's ONE type
export type AerialPerspectiveRenderer = Renderer & {
  encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void;
  draw(                                   // Task 3 implements this half
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;
};

// aerialPerspectiveRenderer.ts
export function createAerialPerspectiveRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  sampler: GPUSampler,
  placeholderRingView: GPUTextureView,
  bodies: ReadonlyMap<
    string,
    {
      readonly scatteringBuffer: GPUBuffer;
      readonly skyViewParamsBuffer: GPUBuffer;
      readonly shellUniformBuffer: GPUBuffer;
      readonly transmittanceTex: GPUTexture;
      readonly multiScatterTex: GPUTexture;
      readonly skyViewTex: GPUTexture;
    }
  >,
): AerialPerspectiveRenderer;

// AtmosphereShellRenderer.d.ts — delegation, same throw-on-unknown-id contract
encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void;

// src/services/engine/frame/encodeAtmosphereFroxel.ts — the file's ONE export
export function encodeAtmosphereFroxel(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
): void;
```

**Resources (owned by the new renderer):**

- `FROXEL_SIZE = 32`, one TS constant in the renderer. Two shared
  `rgba16float` `texture_3d` of `32×32×32` — **one pair total, not per body**
  (only one body can be inside), `STORAGE_BINDING | TEXTURE_BINDING`. One stores
  in-scatter rgb integrated camera→slice, the other the rgb transmittance over
  the same interval. Per-channel, never a grey scalar: a luminance-collapsed
  factor adds blue to the ground without removing blue from it (the cyan wash
  `atmosphereShellRenderer`'s header records).
- One `AtmosphereUniforms` buffer **per body** (`ATMOSPHERE_UNIFORM_FLOATS × 4`
  bytes), separate from the shell's own. Written immediately before that body's
  own dispatch — no shared buffer may sit between a `writeBuffer` and a `submit`.
- One bake bind group per body, built at construction:

| binding | resource                                            |
| ------- | --------------------------------------------------- |
| 0       | `ScatteringParams` (that body's, from the shell)     |
| 1       | `SkyViewParams` (that body's — twilight knobs)       |
| 2       | transmittance LUT view                               |
| 3       | multi-scatter LUT view                               |
| 4       | shared sampler                                       |
| 5       | this body's froxel `AtmosphereUniforms` buffer        |
| 6       | in-scatter storage view (`texture_storage_3d<rgba16float, write>`) |
| 7       | transmittance storage view (same format)             |

  **No new packed record and so no new parity test** (spec §4.3): the bake binds
  a second buffer of the EXISTING layout, written by the same
  `atmosphereShellUniforms` builder the shell uses.

**`froxelLut.wesl` shape:**

- `@compute @workgroup_size(8, 8)` over `(x, y)`; dispatch `(4, 4, 1)` for 32².
  Guard `gid.xy >= textureDimensions(outInScatter).xy` and return — the shader
  reads the size from `textureDimensions`, never a restated constant (the
  sky-view bake's convention).
- Per invocation: `uv = (gid.xy + 0.5) / dims.xy`, ray
  `froxelRayDir(u.invMvp, u.camPosLocal, uv)` — **the same uv the apply samples
  with**, which is what registers the two halves per texel.
- `D = froxelMaxDistance(length(u.camPosLocal), u.bottomRadius)` in LOCAL units
  (top = 1); the march converts to km with `params.atmosphereTopKm`, because
  `scatterStep` integrates in km like every other bake, while the ray and the
  slice mapping stay in top units (`scattering.wesl`'s header: the LUT
  parametrisations are ratio-based and accept either).
- Loop z from 0: store at every slice boundary, accumulating `L` and `throughput`
  with `scatterStep` (the prep-6 integrand) over `dt = froxelSliceDistance(i, N, D) −
  froxelSliceDistance(i − 1, N, D)`. **Slice 0 is stored as the identity**
  (`L = 0`, `T = 1`) rather than left to the loop — it is what keeps trilinear
  interpolation correct at the metre-to-kilometre ranges a rover is framed at.
- `cosTheta = dot(dir, u.sunDirLocal)`, constant along the ray, hoisted out of
  the z loop.

- [ ] **Step 1: Write the failing tests** in
      `tests/services/engine/frame/encodeAtmosphereFroxel.test.ts`, modelled on
      `encodeAtmosphereSkyView.test.ts`'s fixtures (same `sceneBodyStates` mock,
      same seeded-Earth records, a stub renderer whose `encodeFroxel` is a
      `vi.fn<AtmosphereShellRenderer['encodeFroxel']>()`):
      - `no dispatch when no body is inside the shell` — a camera five Earth-radii
        out: `encodeFroxel` not called. This is the zero-GPU-work guarantee the
        Task 5 perf gate rests on.
      - `bakes for the body the camera is inside` — a camera at half an Earth
        radius: `encodeFroxel` called exactly once, with `'earth'`.
      No assertion recomputes the uniform record: building the expectation with
      `atmosphereShellUniforms` would be a mirror. The record's correctness is
      the existing `atmosphereUniformsLayout.parity` test plus the visual gate.

- [ ] **Step 2: Run them and watch them fail.**
      `npx vitest run tests/services/engine/frame/encodeAtmosphereFroxel.test.ts`
      Expected: FAIL — module not found.

- [ ] **Step 3: Write `froxelSlices`-consuming `froxelLut.wesl`** per the shape
      above. Re-read the shader rules at the top of this plan first.

- [ ] **Step 4: Write `aerialPerspectiveRenderer.ts`** — textures, per-body
      uniform buffers, per-body bake bind groups, the compute pipeline (explicit
      `GPUBindGroupLayout` + `GPUPipelineLayout`, **never `layout: 'auto'`**:
      auto-derived layouts are pipeline-specific even when the bindings match),
      `encodeFroxel`, and a `destroy` that releases everything it made. `draw`
      lands in Task 3 — declare it throwing `not implemented` only if the type
      forces it, and delete that stub in Task 3.

- [ ] **Step 5: Wire it into the shell renderer.** Construct it after the bundle
      loop (it needs every bundle's buffers and LUT textures), expose
      `encodeFroxel` as a delegation on the returned `AtmosphereShellRenderer`,
      and destroy it in `destroy()`. `AtmosphereBundle` gains no field.

- [ ] **Step 6: Write `encodeAtmosphereFroxel.ts`** — one symbol, no module
      constants. It returns early when the renderer is null, when no
      `atmosphereDrawList` entry has `inside`, or when that body has no row in
      `ctx.slabs`; otherwise it calls
      `renderer.encodeFroxel(encoder, entry.body.id, atmosphereShellUniforms(entry, slab, ctx, state))`.
      Its ≤ 10-line header states the one non-obvious fact: the bake and the apply
      read the SAME uniform record from the SAME builder, which is what makes the
      bake's rays and the apply's rays the same rays.

- [ ] **Step 7: Add the frame rows.** `COMPUTE` gains
      `atmosphereFroxel: (encoder, ctx, state) => encodeAtmosphereFroxel(encoder, ctx, state)`,
      and `FRAME_ORDER` gains `{ kind: 'compute', name: 'atmosphereFroxel' },`
      immediately after `atmosphereSkyView`. Extend that block's existing comment
      by at most three lines with the fact a reader cannot derive: the order of
      the two bakes is a LISTING choice — the frame is one encoder with one
      submit and `queue.writeBuffer` lands before any command buffer submitted
      after it, so both see this frame's `SkyViewParams` whichever way round they
      encode. `executeFrame`'s and `frameOrder`'s purity/allow-list rows are
      unchanged (a table row and a list entry are not declarations).

- [ ] **Step 8: Verify.** `npx vitest run tests/services/engine/frame` → green
      (including `frameFilePurity` with NO new `ALLOWED` row and `frameOrderBoot`),
      then `npx tsc --noEmit`. On the dev server, fly inside Earth's atmosphere:
      nothing looks different yet (nothing samples the volume), and the console
      shows no shader-compile or validation error — the bake dispatching is the
      whole observable.

- [ ] **Step 9: Commit** + line-diff breakdown.

```
feat(atmosphere): bake a camera-frustum froxel volume for the inside body

In-scatter and per-channel transmittance integrated to each slice, over the
same integrand the sky-view march uses.
```

---

### Task 3: The apply — `aerialPerspective/fragment.wesl` and the draw path

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Tasks 1 and 2.**

**Files:**

- Create: `src/services/gpu/shaders/atmosphere/aerialPerspective/fragment.wesl`
- Modify: `src/services/gpu/shaders/atmosphere/shell/fragment.wesl:323-370`
  (the inside path LEAVES: `insideRayDir`, `fsInsideMultiply`, `fsInsideAdd`)
- Modify: `src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.ts`
  (the pipeline pair, the depth-keyed bind groups, `draw`)
- Modify: `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`
  (the inside pipeline pair and its `ShellPipelineState` leave; `draw` loses
  `inside`; `drawAerialPerspective` delegates)
- Modify: `src/@types/rendering/AtmosphereShellRenderer.d.ts:115-134`
- Modify: `src/services/engine/frame/passes/atmosphereShellPass.ts` (drop the
  `inside` argument at the `renderer.draw` call)

**Why:** one full-screen pass that reads the foreground depth buffer and
branches per pixel, rather than a fog lookup bolted onto every body shader
(spec §2). The inside pipeline pair MOVES rather than being duplicated: after
this task there is exactly one full-screen atmosphere path.

**Interfaces:**

```ts
// AtmosphereShellRenderer.d.ts
drawAerialPerspective(
  pass: GPURenderPassEncoder,
  bodyId: string,
  uniforms: Float32Array,
  depthView: GPUTextureView,
): void;
draw(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array): void; // loses `inside`
```

**`aerialPerspective/fragment.wesl` shape:**

- Imports (one per line, at the top, literal `package::`):
  `package::atmosphere::shell::fragment::sampleShellRay`,
  `package::atmosphere::froxelSlices::froxelRayDir`,
  `package::atmosphere::froxelSlices::froxelRayDistance`,
  `package::atmosphere::froxelSlices::froxelSliceCoord`,
  `package::atmosphere::froxelSlices::froxelMaxDistance`,
  `package::lib::sphere::AtmosphereUniforms`,
  `package::lib::fullscreenTri::FullscreenOut`.
  Importing a plain function out of a module that also declares entry points is
  precedented (`mcpm/volpathBlit.wesl` imports `McpmVsOut` from `mcpm/vertex.wesl`);
  if the linker also demands the `ShellSample` struct by name, add that import on
  its own line.
- Bindings — the shell's five, plus three:

| binding | resource                                                      |
| ------- | ------------------------------------------------------------- |
| 0       | `AtmosphereUniforms` (the body's shell uniform buffer)         |
| 1       | shared sampler                                                 |
| 2       | sky-view LUT                                                   |
| 3       | transmittance LUT                                              |
| 4       | ring strip — **always the shared 1×1 placeholder**              |
| 5       | froxel in-scatter `texture_3d<f32>`                            |
| 6       | froxel transmittance `texture_3d<f32>`                         |
| 7       | scene depth, `texture_depth_2d`                                |

  Binding 4 never needs the real strip: inside the shell `tNear` is 0, so
  `sampleShellRay`'s ring-in-front branch (`tRing > 0 && tRing < tNear`) is
  unreachable. State that in a comment; it is why the apply's bind group is keyed
  on the depth view alone.

- Two entry points, `fsAerialMultiply` then `fsAerialAdd`, over
  `shell/vertex.wesl`'s existing `insideVs` (`@vertex`, covering triangle, no
  vertex buffer — a pipeline may take its two stages from different modules).
  Each:

```wgsl
let d = textureLoad(sceneDepth, vec2<i32>(in.pos.xy), 0);
// SKY: 'd' is the body slab's reversed-Z far-plane clear value, 0.0 — the CPU
// twin is 'depthClearValueFor(true)' (utils/gpu/depthClearValueFor.ts).
```

  - **SKY branch** (`d == FAR_DEPTH`): today's `sampleShellRay(froxelRayDir(...))`,
    unchanged, with identical alpha semantics — multiply writes
    `vec4(s.transmit, 1 - s.coverage)`, add writes `vec4(s.emission, s.coverage)`
    — so the star and deep-space washout the compositor derives from
    `foreground:0`'s alpha is preserved exactly. It never divides by `w`.
  - **GEOMETRY branch**: `dist = froxelRayDistance(u.invMvp, u.camPosLocal, in.uv, d)`
    in atmosphere-top units, `w = froxelSliceCoord(dist, f32(textureDimensions(froxelInScatter).z), froxelMaxDistance(length(u.camPosLocal), u.bottomRadius))`,
    then `textureSampleLevel` both 3D textures at `vec3(in.uv, w)`. Multiply
    writes `vec4(T.rgb, 1.0)`, add writes `vec4(inScatter.rgb * u.exposure, 0.0)`:
    alpha passes through untouched, so opaque ground stays opaque for the
    compositor.

**Renderer shape:**

- Two pipelines sharing one layout, one vertex state (`insideVs`) and one
  depth-stencil state — `depthCompare: 'always'`, `depthWriteEnabled: false`,
  **no depth attachment at all** (the step declares `depth: 'sample'`; WebGPU
  forbids sampling a view attached to the same pass). Reuse the SAME blend
  objects the shell's inside pair used: multiply (`zero`/`src`) then add
  (`one`/`one`), **in that order** — reversing attenuates this body's own
  in-scatter by its own transmittance.
- **Bind groups are keyed on the depth VIEW object**: `depthViewOf('foreground:0')`
  returns a NEW view after a `reconcile` reallocates the row, and a cached bind
  group over a destroyed texture is a validation error — on iOS, a silently
  dropped frame. Cache `Map<string, { depthView: GPUTextureView; group: GPUBindGroup }>`
  per body and rebuild when the view differs.
- `draw` writes the body's shell uniform buffer immediately before its own two
  draws, then `setPipeline`/`draw(3)` twice.

- [ ] **Step 1: Move the inside path.** Cut `insideRayDir`, `fsInsideMultiply`
      and `fsInsideAdd` out of `shell/fragment.wesl` (its `FullscreenOut` import
      goes with them) and write the new fragment around `fsAerialMultiply` /
      `fsAerialAdd`, replacing `insideRayDir(uv)` with
      `froxelRayDir(u.invMvp, u.camPosLocal, uv)` — identical arithmetic, now
      shared with the bake (Task 1's deviation 2). Rewrite `shell/fragment.wesl`'s
      header section "Inside-shell path" — it describes code that no longer lives
      there — and its `## Two walls` case analysis, which currently says the
      camera-inside case is "the deferred froxel's job".

- [ ] **Step 2: Move the pipelines.** The `insideShellState`, the two inside
      pipelines and their creation leave `atmosphereShellRenderer.ts`;
      `createShellPipeline`'s `state` parameter collapses back to the outside
      state if nothing else uses it. `draw` loses its `inside` branch and its
      parameter; `drawAerialPerspective` delegates to the sub-renderer. Update
      the `.d.ts` docs for both (`:115-134`) — the `inside` paragraph describes a
      selector that no longer exists.

- [ ] **Step 3: Update the one `draw` caller.** `atmosphereShellPass.draw` drops
      the fourth argument. It still uses `entry.inside` in Task 4's `enabled`
      change — not yet here.

- [ ] **Step 4: Verify.** `npm test` → green (no test asserts the `inside`
      argument today; if one does, it is the pass test and its assertion changes
      with the signature), then `npx tsc --noEmit`. On the dev server, check the
      OUTSIDE view is unchanged (that is the invariant this task must hold), then
      descend to Earth's surface and expect an intermediate state: **the shell
      draws via the outside proxy path from inside; facet-sag and missing
      near-wall haze are expected until Task 4 closes the gate and the aerial
      pass takes over.** `atmosphereShellPass.enabled` still returns true for the
      inside body at this commit, and `draw` now has only the proxy pipelines, so
      the far wall still renders the sky — with exactly the artefacts the inside
      path existed to avoid (`isInsideAtmosphereShell`'s header). Say so in the
      review package rather than chasing it.

- [ ] **Step 5: Commit** + line-diff breakdown.

```
feat(atmosphere): add the depth-branching aerial-perspective fragment

The inside-shell full-screen path moves out of the shell, gains the scene
depth branch, and samples the froxel volume for geometry rays.
```

---

### Task 4: The frame wiring — pass, `FRAME_ORDER` line, resolved slab

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Tasks 2 and 3.**

**Files:**

- Create: `src/services/engine/frame/passes/aerialPerspectivePass.ts`
- Modify: `src/services/engine/frame/passes/index.ts` (register it)
- Modify: `src/services/engine/frame/frameOrder.ts:150-195` (the new render line,
  and the #698 prose rewrite at `:168-181`)
- Modify: `src/services/engine/frame/renderFrame.ts:203-222`
- Modify: `src/services/engine/frame/timing/maxFrameInputs.ts:14-23`
- Modify: `src/services/engine/frame/passes/atmosphereShellPass.ts` (`enabled`
  returns false for an `inside` entry; header rewrite)
- Modify: `tests/services/engine/frame/expandFrameOrder.test.ts`

**Why:** the apply must run after every foreground row has stamped its depth and
before the `foreground:0 → hdr` composite, on the inside body's own slab, with
the row's depth bound as a texture instead of attached. Prep 1 is what makes
"the depth buffer holds the inside body's geometry" true rather than lucky.

**Interfaces:**

```ts
// FRAME_ORDER — between the `foreground` line and the foreground:0 -> hdr composite
{
  kind: 'render',
  target: 'foreground:0',
  slab: 'insideAtmosphere',
  depth: 'sample',
  passes: ['aerial-perspective'],
  slot: 'AERIAL',
},

// renderFrame — beside the existing sgrAStarBodySlab resolution
bodyRowSlabs: {
  lens: sgrAStarBodySlab === null ? [] : [sgrAStarBodySlab],
  insideAtmosphere: insideAtmosphereBodySlab === null ? [] : [insideAtmosphereBodySlab],
},

// passes/aerialPerspectivePass.ts — the file's ONE export
export const aerialPerspectivePass: ContentPass; // name: 'aerial-perspective'
```

- **`slot: 'AERIAL'` is required and is an addition to the spec's literal.**
  Without it this step's group key is `groupKeyOf('foreground:0', BODY[k])` —
  byte-identical to the foreground chain step for the SAME row, so
  `timedSlotRowsOf` would emit two rows with one name and the two passes would
  attach the same query indices (the last write silently wins). The authored slot
  is the existing separator for lines sharing a group (`POST_LENSING`,
  `POST_FOREGROUND`). `PASS_GROUP_TITLES` needs no row: the bare group key still
  buckets under "Foreground bodies · depth".
- `MAX_FRAME_INPUTS.bodyRowSlabs.insideAtmosphere` becomes every capacity row
  (`Array.from({ length: BODY_SLAB_CAPACITY }, (_, k) => k + 2)`), the same
  reasoning as `lens`: the inside body's painter row moves with the live bodies,
  and an unallocated slot is a missing DebugPanel/perf row.
- `aerialPerspectivePass.enabled` is `view.slab.frame.kind === 'body-m'`, a
  non-null `state.gpu.atmosphereShellRenderer`, and that body's draw-list entry
  carrying `inside`. `draw` builds the record with `atmosphereShellUniforms` and
  calls `renderer.drawAerialPerspective(pass, bodyId, uniforms,
  ctx.renderTargets.depthViewOf('foreground:0'))`.
- `atmosphereShellPass.enabled` gains `&& entry.inside === false`: inside the
  shell the aerial pass draws the atmosphere, and the two must never both run
  (they would double the in-scatter).

- [ ] **Step 1: Write the failing test** in
      `tests/services/engine/frame/expandFrameOrder.test.ts`:
      `the aerial-perspective step is emitted only when bodyRowSlabs.insideAtmosphere is non-empty`.
      With `insideAtmosphere: []` (and a non-empty `foregroundChain`), no step
      targets `foreground:0` with `depth: 'sample'`. With `insideAtmosphere: [3]`
      and `foregroundChain: [NEAR0, 3]`, exactly one such step exists, it carries
      `slab === 3`, `depth === 'sample'` and `slot === 'AERIAL'`, it sits AFTER
      the last foreground chain step and BEFORE the `foreground:0 → hdr`
      composite, and it did **not** merge into the chain step for row 3 (same
      target, same slab — `sameGroup`'s `depth` key is the only thing keeping
      them apart, and a merge would attach a depth the pass must not have).

- [ ] **Step 2: Run it and watch it fail.**
      `npx vitest run tests/services/engine/frame/expandFrameOrder.test.ts`
      Expected: FAIL — no line emits it.

- [ ] **Step 3: Write the pass** — one symbol, no module constants, gates as
      above. Its ≤ 10-line header carries the two facts a reader cannot see: it
      is the inside-the-shell sibling of `atmosphere-shell` (exactly one of the
      two draws per frame), and its step binds `foreground:0`'s depth as a
      TEXTURE, which is why the line declares `depth: 'sample'` and takes no
      depth attachment. Register it in `passes/index.ts`.

- [ ] **Step 4: Add the `FRAME_ORDER` line** with the rationale beside it:
      after the foreground chain so every opaque row has stamped its depth,
      before the composite so the fog rides the one tone curve, on the inside
      body's own row because prep 1 makes that row last and therefore the owner
      of the depth the pass reads.

- [ ] **Step 5: Rewrite the #698 prose** (`frameOrder.ts:168-181` and
      `atmosphereShellPass.ts`'s header `:20-22,36-37`). It currently argues a
      stopgap — "the real fix is the froxel LUT, which gives the inside path
      scene depth and lets this line move back". `mesh-bodies` STAYS where it is
      (the outside path still wants it after the shells); what changes is the
      reason. New prose, timeless: the shells write no depth, so a mesh drawn
      last depth-tests correctly against every opaque sphere, and inside the
      shell the aerial pass reads that same depth and fogs the mesh at its own
      distance. No "used to", no "#698", no diff narration.

- [ ] **Step 6: Resolve the slab in `renderFrame`** — a local `let`, beside
      `sgrAStarBodySlab` (no new top-level declaration: `renderFrame`'s purity
      row stays 2). Find the `atmosphereDrawList` entry with `inside`, then its
      row index in `ctx.slabs` by `frame.kind === 'body-m' && frame.bodyId`;
      `null` when either is absent. The list is memoised on `ctx` (prep 3), so
      this read costs nothing. Update `maxFrameInputs.ts`.

- [ ] **Step 7: Close the shell pass's gate** (`enabled` returns false for an
      `inside` entry) and delete the now-false sentence in its header about the
      inside path being what it switches to below 1.005.

- [ ] **Step 8: Verify.** `npm test` → green (`frameOrderBoot` proves the new
      pass has exactly one line drawing it; `frameFilePurity` must stay at its
      current `ALLOWED` table), then `npx tsc --noEmit`.

- [ ] **Step 9: Commit** + line-diff breakdown.

```
feat(atmosphere): apply the froxel volume as a depth-keyed foreground pass

The inside body's own painter row owns the depth the pass samples, so the
apply lands between the foreground chain and the composite.
```

---

### Task 5: Visual gate, perf, `/feature-done`

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Tasks 1–4.**

- [ ] **Step 1: Visual gate — ASK THE USER TO LOOK, do not claim it.** Dev
      server on this worktree's own port. Spec §9's list, verbatim:
      1. **Standing on Earth's surface, down-view** — the washout is gone and the
         ground reads at its own distance.
      2. **Earth tiles, mesh bodies and the Mars rover** take fog that grows with
         distance (Mars is the framing that motivated #698).
      3. **Descent through 1.005** — no pop at the handoff. The two sides agree
         because prep 6 made the outside near-wall integral and the inside froxel
         integral the same integrand on the same ray; this look is what checks the
         claim.
      4. **Stars and deep space through the sky branch** — unchanged from today.
      Also watch for the risk spec §6 flags and judge it: **silhouette haloing**
      at a sky/geometry edge, where the exact per-pixel sky branch meets the 32²
      froxel branch across one froxel of interpolation. `FROXEL_SIZE` is the knob
      and its cost is cubic — a bump is a user call, not an implementer's.
      **f.lux OFF before any colour judgement.**

- [ ] **Step 2: Perf — paired A/B OUTSIDE the shell.** Read
      `.claude/skills/perf/SKILL.md` first. Base commit in a scratch worktree,
      `node_modules` and `public/data` symlinked, a second dev server, runs
      alternated A-B-A-B; `--scenario earth-surface --frames 30`; **pass
      `--url http://localhost:<port>` from THIS worktree's own `Local:` line** or
      you silently measure another branch's server. Interpretation traps to state
      in the report: quote MERGED medians only; PER-LAYER rows carry 1–3 ms of
      instrumented per-pass overhead each, so attribute through the EST. PER-PASS
      FLOOR section; on Apple Silicon MERGED slot-sums are ~3× inflated by
      concurrent TBDR execution (adjacent slots with identical medians are the
      tell), so per-slot numbers are ordinal, never additive or fps-convertible;
      run-to-run noise is ~0.5 ms at 30 frames.
      **Expected: neutral** — outside the shell there is no dispatch and no step.
      A negative result outside the noise band **HALTS landing**; land-or-park is
      the user's ruling, never process momentum.

- [ ] **Step 3: Perf — absolute cost INSIDE the shell**, reported as a number,
      not a pass/fail: one 32³ bake plus one full-screen apply drawn twice, at a
      surface pose. State it beside the maintenance cost the feature adds (three
      shader files, one renderer, two frame files, two `FRAME_ORDER` lines).

- [ ] **Step 4: `deletion-audit`.** The standing leanness pass over the whole
      diff (`docs/superpowers/conventions/leanness.md`) — framed as "a
      less-capable model wrote this; surplus is presumed". Prime suspects: the
      `draw` stub if Task 2 left one, any parameter the pipelines no longer vary
      on after the inside pair moved, and any comment restating the spec.

- [ ] **Step 5: Backlog verification** (spec §8): confirm
      `docs/backlog/2026-09-01-atmosphere-froxel-aerial-perspective.md` and its
      `docs/BACKLOG.md` index line are both absent — they were deleted with the
      spec. Nothing to remove here, and no new backlog line is added.

- [ ] **Step 6: `/feature-done`.** It gates on the Definition of Done below, then
      relocates THIS plan to `docs/superpowers/plans/completed/` and the spec to
      `docs/superpowers/specs/completed/` — the spec relocation the prep PR
      deliberately deferred. The prep plan relocated itself when its own PR
      landed; do not move it again. Archive the ledger first: copy
      `<workspace>/progress.md` to
      `docs/superpowers/plans/completed/2026-09-14-atmosphere-froxel-aerial-perspective.ledger.md`
      (sdd-execution Rule 3).

- [ ] **Step 7: Commit** the docs moves + line-diff breakdown.

```
docs(atmosphere): complete the froxel aerial-perspective plan
```

---

## Definition of Done

**Deliverable inventory**

- New files, each exporting exactly one symbol (or, for WESL, one cohesive
  module): `src/@types/rendering/AerialPerspectiveRenderer.d.ts`,
  `src/services/engine/frame/encodeAtmosphereFroxel.ts`,
  `src/services/engine/frame/passes/aerialPerspectivePass.ts`,
  `src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.ts`,
  `src/services/gpu/shaders/atmosphere/froxelLut.wesl`,
  `src/services/gpu/shaders/atmosphere/froxelSlices.wesl`,
  `src/services/gpu/shaders/atmosphere/aerialPerspective/fragment.wesl`.
- `FRAME_ORDER` carries exactly two new lines: the `atmosphereFroxel` compute
  row and the `insideAtmosphere` render row.
- `AtmosphereShellRenderer.draw` has **no `inside` parameter**; `shell/fragment.wesl`
  declares no `fsInside*` entry point and no `insideRayDir`; the full-screen
  atmosphere path exists in exactly one place.
- `frameFilePurity.test.ts`'s `ALLOWED` table is byte-identical to its pre-PR
  state, and `atmosphereUniformsLayout.parity.test.ts` is untouched (the bake
  reuses the existing layout).
- `docs/backlog/2026-09-01-atmosphere-froxel-aerial-perspective.md` and its
  `docs/BACKLOG.md` index line are absent — deleted with the spec, verified in
  Task 5, and no new backlog line replaces them.

**Named observable behaviours** (Task 5's gate, user's eyes)

- Down-view from Earth's surface: ground at its own haze, not the
  camera-to-space column.
- A mesh body, an Earth surface tile and the Mars rover each take fog that grows
  with distance, and each still silhouettes correctly against the sky.
- Descent through the 1.005 handoff: no pop.
- Sky and deep space through the sky branch: unchanged, alpha included (stars
  still wash out behind the atmosphere exactly as before).
- Outside the shell: pixel-identical to `main`, and the perf A/B is neutral.

**Deferral boundary**

- The cloud deck writes no depth and therefore takes the fog of the ground
  behind it. Accepted limitation, not a defect to chase.
- No froxel volume for a body the camera is NOT inside; no per-body tuning of the
  new fog beyond Earth as the reference and a Mars sanity look; no shadowed or
  volumetric light shafts through the volume.
- No change to the outside path: proxy-mesh pipelines, the wall-duty split, the
  sky-view LUT's dimensions or cadence.
- Terrain from per-planet 3D terrain (PR #700) can lift geometry above the ground
  sphere and exceed `D`; the last slice's clamp covers it, and re-deriving `D`
  against real terrain is out of scope here.
- `FROXEL_SIZE` stays 32 unless the visual gate shows haloing the user asks to
  fix; the cost is cubic.
