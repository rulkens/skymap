# Local Froxel Aerial Perspective + Depth-Occluded Orbit Trails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under
> `docs/superpowers/conventions/sdd-execution.md` (lean protocol). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Inside an atmosphere shell, fog every geometry pixel to its own depth via a camera-local
froxel volume baked once per frame, and let orbit trails hide behind terrain by sampling the same depth.

**Architecture:** A compute prelude marches the shared `scatterStep` integrand once per volume ray into
two `32×32×64` `rgba16float` storage textures (fixed 4 km slices, 256 km far bound). The spike's apply
pass keeps its sky branch and swaps its 16-step march for two linear 3D lookups. The bake is the frame's
only write of the inside body's shell uniform record, so bake and apply unproject with one `invMvp`.
Orbit trails declare `depth: { sample: 'foreground:0' }` and multiply a depth clearance into the
existing analytic-sphere clearance.

**Tech Stack:** WebGPU compute + storage 3D textures, WESL shaders, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-local-froxel-aerial-perspective-design.md` (§4 design,
§6 verification). Ground preparation (§3) is DONE: prep 1 merged in #790, prep 2+3 are commits
d5c8675d4 and add7029d8 on this branch. Port source for the bake and volume plumbing: the abandoned
#709 branch at `cbbab4481` (`git show cbbab4481:<path>`); its slice regime and uniform ownership are
NOT the design.

## Global Constraints

- `FROXEL_DIMS = { x: 32, y: 32, z: 64 }`, `FROXEL_SLICE_KM = 4`, sub-step `FROXEL_SLICE_KM / 4`.
- Slice count comes from `textureDimensions` in WGSL, slice size from the uniform record: no shader literal.
- The apply `draw` writes NO buffer. The bake writes the shell uniform record once per frame.
- Frame files (`src/services/engine/frame/**`) export exactly one symbol named after the file
  (`tests/services/engine/frame/frameFilePurity.test.ts`; budgets are exact, rows only shrink).
- One type per file under `src/@types/`; `type` aliases, never `interface`.
- Comments: header ≤ 5 lines, comment lines ≤ half the code lines added; current state only.
- No `git add -A`; `npx prettier --write` touched `.ts` files only (prettier has no WESL parser).
- Never `npm run format`.

## Deviations from the spec, decided at plan time

1. **`frame/sceneDepthRow.ts` is not built.** Prep 1 already hands a sampling step
   `view.sampledDepth.row` (the slab whose clear last wrote `foreground:0`'s depth). The trails pass
   reads that; a second resolver of the same fact would be a duplicate.
2. **The trails' local frame is km-scaled, so `localToKm` is dropped.** `composeBodySlabMvp` with
   `radiusM = 1000` makes unprojected distances km directly. The "no frame" case needs no sentinel
   either: with `row === null` the executor binds the far placeholder, every texel is `FAR_DEPTH`, and
   the fragment's early-out gives factor 1.
3. **The apply keeps `params` bound.** `sceneRayDistance` returns shell-local units (top = 1);
   converting to km needs `params.atmosphereTopKm`. Dropped from the apply: the multi-scatter LUT and
   `SkyViewParams` (bake-only now).

---

### Task 1: `froxelSliceKm` in the uniform record + froxel constants

**Files:** create `src/data/atmosphere/froxelVolume.ts`; modify `src/utils/gpu/packAtmosphereUniforms.ts:35-101`,
`src/services/gpu/shaders/lib/sphere.wesl:453-464`, `src/services/engine/frame/atmosphereShellUniforms.ts:20-56`;
tests `tests/utils/gpu/packAtmosphereUniforms.test.ts:47-100`, `tests/utils/gpu/atmosphereUniformsLayout.parity.test.ts:76-84`.

**Contract:**

```ts
// src/data/atmosphere/froxelVolume.ts
export const FROXEL_DIMS = { x: 32, y: 32, z: 64 } as const;
export const FROXEL_SLICE_KM = 4;
```

`packAtmosphereUniforms(mvp, invMvp, sunDirLocal, camPosLocal, bottomRadius, exposure, ringInnerRatio, ringOuterRatio, froxelSliceKm: number): Float32Array`
writes `froxelSliceKm` at f32 index 27 (byte 108), the slot `packAtmosphereUniforms.ts:98` zeroes as
`_pad0`. WGSL twin `sphere.wesl:462`: `_pad0` → `froxelSliceKm: f32`. `atmosphereShellUniforms`
passes `FROXEL_SLICE_KM`.

- [ ] Add the two constants (one file, two exports is fine under `src/data/`).
- [ ] Extend the packer and the WGSL struct; update the layout comment at `packAtmosphereUniforms.ts:35-46`.
- [ ] `packAtmosphereUniforms.test.ts:95`: the `rec[27] === 0` pin becomes
      `packs froxelSliceKm at byte 108` asserting `rec[27] === <the value passed>`.
- [ ] `atmosphereUniformsLayout.parity.test.ts`: add `froxelSliceKm` to the sentinel table so the
      parity test covers it (it fails if the WESL field and the packer index ever disagree).
- [ ] `npx vitest run tests/utils/gpu tests/services/engine/frame/passes/atmosphereShellPass.test.ts`.
- [ ] Commit: `feat(atmosphere): froxelSliceKm rides the shell uniform record`.

---

### Task 2: `froxelSlices.wesl` — the one slice↔distance mapping

**Files:** create `src/services/gpu/shaders/atmosphere/aerialPerspective/froxelSlices.wesl`.
**review: yes** (shader maths; TS↔WGSL contract via Task 1's field).

**Contract:**

```wgsl
// Distance from the camera that texel z = i integrates to: (i + 1) * sliceKm.
fn froxelSliceEndKm(i: u32, sliceKm: f32) -> f32

// Where a lookup at distanceKm reads. The identity (no in-scatter, unit
// transmittance) at distance 0 is implicit: below one slice the caller mixes the
// identity with texel 0 by identityMix; at and past the last slice w clamps.
struct FroxelCoord { w: f32, identityMix: f32 }
fn froxelCoord(distanceKm: f32, sliceKm: f32, sliceCount: u32) -> FroxelCoord
```

Definition to hit, for `s = sliceKm`, `N = sliceCount`, `d = distanceKm`:
`f = d / s − 1` (continuous slice index; texel `i` sits at `f = i`), `w = (clamp(f, 0, N − 1) + 0.5) / N`,
`identityMix = 1 − saturate(d / s)` (1 at `d = 0`, 0 from `d = s` on). With a linear sampler this
lerps between the two neighbouring slices exactly as spec §4.1 states.

- [ ] Write the module with a ≤ 5-line header naming the two consumers (bake, apply).
- [ ] No TS test: the mapping is exercised by Task 3's bake and Task 4's apply, whose eye-checks
      (DoD) are the only thing that can catch an off-by-one-slice here. Say so in the commit body.
- [ ] Commit: `feat(atmosphere): froxel slice mapping module`.

---

### Task 3: `bake.wesl` — the volume bake compute

**Files:** create `src/services/gpu/shaders/atmosphere/aerialPerspective/bake.wesl`.
**review: yes** (shader).

Port source: `git show cbbab4481:src/services/gpu/shaders/atmosphere/froxelLut.wesl` (bindings,
loop shape, the ground-hit clamp). Integrand: `scatterStep` at `scattering.wesl:355-366` (km, planet
centre at origin). Ray helpers: `lib/sceneDepthRay.wesl` (`sceneRayDir(uv, u.invMvp, u.camPosLocal)`).
Sky-view bake as the compute-module pattern: `shaders/atmosphere/skyViewLut.wesl:76-171`.

**Bindings (group 0):**

| binding | name               | type                                          |
| ------- | ------------------ | --------------------------------------------- |
| 0       | `params`           | `uniform ScatteringParams`                    |
| 1       | `view`             | `uniform SkyViewParams` (declare locally as `skyViewLut.wesl:76-81` does) |
| 2       | `transmittanceLut` | `texture_2d<f32>`                             |
| 3       | `multiScatterLut`  | `texture_2d<f32>`                             |
| 4       | `lutSamp`          | `sampler`                                     |
| 5       | `u`                | `uniform AtmosphereUniforms` (`lib/sphere.wesl`) |
| 6       | `outInScatter`     | `texture_storage_3d<rgba16float, write>`      |
| 7       | `outTransmittance` | `texture_storage_3d<rgba16float, write>`      |

**Entry:** `@compute @workgroup_size(8, 8, 1) fn cs(@builtin(global_invocation_id) gid: vec3<u32>)`,
one invocation per `(x, y)` ray; bounds from `textureDimensions(outInScatter)`; `z` is a loop.

**Behaviour to hit:**
- `uv = (vec2f(gid.xy) + 0.5) / vec2f(dims.xy)`; `dir = sceneRayDir(uv, u.invMvp, u.camPosLocal)`;
  origin in km = `u.camPosLocal * params.atmosphereTopKm`.
- The march stops at the nearer of the atmosphere top exit (`raySphere(u.camPosLocal, dir, 0, 1.0).y`
  scaled to km) and the ground hit (`raySphere(..., u.bottomRadius).x` when ≥ 0), both in km; past
  that point every remaining slice stores the totals unchanged (no medium past the top; the relief
  floor is never below drawn terrain, so nothing is ever looked up past a ground hit).
- Sub-step `dt = u.froxelSliceKm * 0.25`; slice `i` ends at `froxelSliceEndKm(i, u.froxelSliceKm)`;
  after each slice's four sub-steps `textureStore` both running totals at `(gid.x, gid.y, i)`.
  Running totals follow `AerialMarch` in the spike (`aerialPerspective/fragment.wesl:73-105` at
  HEAD add7029d8): `inScatter += T * step.inScatter`, `T *= step.transmittance`.
- Twilight knobs from `view` exactly as the spike's `marchAerial` passes them.

- [ ] Write the shader; header ≤ 5 lines.
- [ ] Commit: `feat(atmosphere): froxel bake compute shader`.

---

### Task 4: apply fragment — two lookups replace the march

**Files:** modify `src/services/gpu/shaders/atmosphere/aerialPerspective/fragment.wesl` (whole file).
**review: yes** (shader).

**Bindings after (0–4 stay hoisted from the shell import):**

| binding | name                  | type                                  |
| ------- | --------------------- | ------------------------------------- |
| 5       | `params`              | `uniform ScatteringParams`            |
| 6       | `froxelInScatter`     | `texture_3d<f32>`                     |
| 7       | `froxelTransmittance` | `texture_3d<f32>`                     |
| 8       | `sceneDepth`          | `texture_depth_2d`                    |

Deleted: `multiScatterLut`, `view`, the local `SkyViewParams` struct, `AERIAL_STEPS`, `AerialMarch`,
`marchAerial`, the `scatterStep` import. Kept unchanged: `vs`, `AerialSample`, the sky branch
(`sampleShellRay`), `fsAerialMultiply`/`fsAerialAdd`, the top-of-atmosphere clip of `tEnd`.

**Geometry branch to hit:** `distKm = tEnd * params.atmosphereTopKm`;
`c = froxelCoord(distKm, u.froxelSliceKm, textureDimensions(froxelInScatter).z)`;
`p = vec3f(in.uv, c.w)`; `inScatter = mix(textureSampleLevel(froxelInScatter, lutSamp, p, 0).rgb, vec3f(0), c.identityMix)`;
`transmittance = mix(textureSampleLevel(froxelTransmittance, lutSamp, p, 0).rgb, vec3f(1), c.identityMix)`;
then the same `transmit`/`emission` packing the spike's geometry branch does today from `AerialMarch`.

- [ ] Rewrite; keep the header's binding-hoist warning (`fragment.wesl:8-11`).
- [ ] Commit: `feat(atmosphere): aerial apply reads the froxel volume`.

---

### Task 5: `AerialPerspectiveRenderer` owns the volumes and the bake

**Files:** modify `src/@types/rendering/AerialPerspectiveRenderer.d.ts`, `src/@types/rendering/AtmosphereShellRenderer.d.ts:139-152`,
`src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.ts`, `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts:573-582,620-635,685-692`;
create `tests/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.test.ts`; modify `tests/services/gpu/renderers/atmosphere/atmosphereShellRenderer.test.ts`.
**review: yes** (TS↔WGSL bind-group contract).

**Contract:**

```ts
// AerialPerspectiveRenderer.d.ts
export type AerialPerspectiveRenderer = Renderer & {
  /** The frame's ONLY write of this body's shell uniform record; bakes both volumes. */
  bake(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void;
  /** Writes no buffer: unprojects with the record `bake` wrote this frame. */
  draw(pass: GPURenderPassEncoder, bodyId: string, depthView: GPUTextureView): void;
  rebind(bodyId: string, bundle: AerialBundleResources): void;
};

// AtmosphereShellRenderer.d.ts — delegation, same shapes
bakeAerialPerspective(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void;
drawAerialPerspective(pass: GPURenderPassEncoder, bodyId: string, depthView: GPUTextureView): void;
```

**Behaviour to hit** (port source `git show cbbab4481:src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.ts`,
storage-3D descriptor precedent `galaxyField/gpu/bakeVolumeTexture.ts:36-42`):
- ONE volume pair for the renderer, allocated at construction: `dimension: '3d'`,
  `size: [FROXEL_DIMS.x, FROXEL_DIMS.y, FROXEL_DIMS.z]`, `rgba16float`, `STORAGE_BINDING | TEXTURE_BINDING`;
  destroyed in `destroy()`.
- Bake pipeline from `bake.wesl?static`; bake BGL = Task 3's table (COMPUTE visibility; 6/7 are
  `storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' }`).
- Apply BGL = Task 4's table (FRAGMENT; 6/7 `texture: { sampleType: 'float', viewDimension: '3d' }`).
- Per body: bake bind group (built from the bundle + the two volumes) and apply entries 0–7; the
  apply bind group is still rebuilt only when `depthView` identity changes (today's
  `aerialPerspectiveRenderer.ts:145-154`). `rebind` rebuilds both.
- `bake`: `queue.writeBuffer(shellUniformBuffer, 0, uniforms)`, set pipeline + bind group,
  `dispatchWorkgroups(FROXEL_DIMS.x / 8, FROXEL_DIMS.y / 8, 1)`.
- `draw`: today's body minus the `writeBuffer` (`aerialPerspectiveRenderer.ts:139`).
- `atmosphereShellRenderer.ts`: `bakeAerialPerspective` delegates; `drawAerialPerspective` loses `uniforms`.

**Tests** (`aerialPerspectiveRenderer.test.ts`, mock-device style of `atmosphereShellRenderer.test.ts:1-100`;
`git show cbbab4481:tests/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.test.ts` as a shape reference):
- `bake writes the body's shell uniform record once and dispatches FROXEL_DIMS / 8 workgroups`
- `draw writes no buffer` (asserts `queue.writeBuffer` not called across a `draw`).
- `allocates one 3D volume pair at FROXEL_DIMS and never per body` (two `createTexture` calls with
  `dimension: '3d'` after constructing with two bodies).
- `rebind rebuilds the bake bind group for that body`.
- `atmosphereShellRenderer.test.ts:160-190` `reconcile` test: assert `rebind` still reaches the aerial renderer.

- [ ] Implement, tests, `npx vitest run tests/services/gpu/renderers/atmosphere`, `npm run typecheck:fast`.
- [ ] Commit: `feat(atmosphere): aerial renderer bakes the froxel volumes`.

---

### Task 6: Frame wiring — compute row, apply pass, frame order

**Files:** create `src/services/engine/frame/computes/aerialPerspectiveCompute.ts`,
`src/services/engine/frame/encodeAtmosphereAerialPerspective.ts`, `tests/services/engine/frame/encodeAtmosphereAerialPerspective.test.ts`;
modify `src/services/engine/frame/computes/index.ts:9`, `src/services/engine/frame/frameOrder.ts:25`,
`src/services/engine/frame/bodyRowSlabs.ts:15`, `src/services/engine/frame/passes/aerialPerspectivePass.ts:28-40`;
tests `tests/services/engine/frame/passes/atmosphereShellPass.test.ts` only if its fixture calls `drawAerialPerspective`.

**Contract:**

```ts
// computes/aerialPerspectiveCompute.ts — bare delegation, as computes/skyViewCompute.ts:12-15
export const aerialPerspectiveCompute: ContentCompute = { name: 'aerial-perspective', encode: encodeAtmosphereAerialPerspective };

// encodeAtmosphereAerialPerspective.ts — signature mirrors encodeAtmosphereSkyView.ts:23-28
export function encodeAtmosphereAerialPerspective(
  encoder: GPUCommandEncoder, ctx: ReadyFrameContext, state: PassState, claimTimestampWrites?: ClaimTimestampWrites,
): void;

// bodyRowSlabs.ts:15 — narrowed to what it reads (atmosphereDrawList takes PassState)
export function bodyRowSlabs(state: PassState, ctx: ReadyFrameContext): Record<BodyRowSource, readonly number[]>;
```

**Behaviour to hit** (`encodeAtmosphereAerialPerspective`): return with no pass and no timing claim
when `state.gpu.atmosphereShellRenderer === null` or `bodyRowSlabs(state, ctx).insideAtmosphere`
is empty. Otherwise `row = ctx.slabs[index]`, `entry = atmosphereDrawList(state, ctx).find(e => e.inside)`,
`uniforms = atmosphereShellUniforms(entry, row, ctx, state)`, one
`encoder.beginComputePass({ label: 'atmosphere-aerial-bake', ...(claimTimestampWrites?.() ?? {}) })`,
`renderer.bakeAerialPerspective(pass, entry.body.id, uniforms)`, `pass.end()`. Same slab resolver
as the render line, so bake and apply share one `slab.vp` (spec §3.4 prep 4 is satisfied by this).

- `computes/index.ts`: `CORE_COMPUTES = [skyViewCompute, aerialPerspectiveCompute]`.
- `frameOrder.ts:25`: add `{ kind: 'compute', name: 'aerial-perspective' }` right after `'sky-view'`
  (the sky-view LUT the apply's sky branch reads must be baked first, and this bake reads that
  frame's shell record). Timing row `aerial-perspective-compute` derives itself
  (`timing/timedSlotRowsOf.ts:33-38`); nothing hand-added.
- `aerialPerspectivePass.draw`: `renderer.drawAerialPerspective(pass, bodyId, view.sampledDepth!.view)`;
  drop the `atmosphereShellUniforms` import and the `entry` lookup if nothing else needs it
  (`enabled` keeps its `inside` check). Header: the record is the bake's.

**Tests** (`encodeAtmosphereAerialPerspective.test.ts`, fixture style of `tests/services/engine/frame/encodeAtmosphereSkyView.test.ts`):
- `no inside body: no compute pass and the timing claim is never called`
- `inside body: one compute pass, bake called once with that body id and a 44-float record`
- `null renderer short-circuits before touching body inputs`
- Existing: `frameFilePurity.test.ts` must pass without a new allow-list row (both new files are pure).
  `timedSlots.test.ts` unchanged (uniqueness holds).

- [ ] Implement, tests, `npx vitest run tests/services/engine/frame`, `npm run typecheck:fast`.
- [ ] Commit: `feat(atmosphere): froxel bake compute row ahead of the foreground chain`.

---

### Task 7: Orbit trails — depth clearance

**Files:** create `src/@types/rendering/OrbitTrailDepthFrame.d.ts`; modify
`src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl:17-25,44-102`, `src/services/gpu/shaders/bodies/orbitTrail/constants.wesl`,
`src/services/gpu/renderers/bodies/orbitTrailRenderer.ts:63-104,156-196`, `src/@types/rendering/OrbitTrailRenderer.d.ts:46-52`,
`src/services/engine/frame/passes/orbitTrailsPass.ts:71-164`, `src/services/engine/frame/frameOrder.ts:259-265`;
tests `tests/services/gpu/shaders/orbitTrailConstants.parity.test.ts:195-224`,
`tests/services/gpu/renderers/bodies/orbitTrailRenderer.test.ts:121,169-195`,
`tests/services/engine/frame/passes/orbitTrailsPass.test.ts:359`.
**review: yes** (shader + TS↔WGSL layout; camera maths).

**Uniform record** (`OcclusionUniforms`, std140; today ends at 272):

| bytes   | field        | WGSL           | TS constant                    |
| ------- | ------------ | -------------- | ------------------------------ |
| 0       | `count`      | `u32` (+3 pad) | `OCCLUDER_COUNT_OFFSET = 0`    |
| 16      | `spheres`    | `array<vec4<f32>, MAX_OCCLUDERS>` | `OCCLUDER_SPHERES_OFFSET = 16` |
| 272     | `invMvp`     | `mat4x4<f32>`  | `OCCLUDER_INV_MVP_OFFSET = 272` |
| 336     | `camPosKm`   | `vec3<f32>` (+4 pad) | `OCCLUDER_CAM_POS_OFFSET = 336` |
| 352     | `viewportPx` | `vec2<f32>` (+8 pad) | `OCCLUDER_VIEWPORT_OFFSET = 352` |
| —       | total        |                | `OCCLUDER_UNIFORM_BYTES = 368` |

`constants.wesl`: `DEPTH_CLEARANCE_REL: f32 = 0.01` (tolerance as a fraction of the trail point's distance).

```ts
// src/@types/rendering/OrbitTrailDepthFrame.d.ts — the survivor row's km-scaled local frame
export type OrbitTrailDepthFrame = { readonly invMvp: Float32Array; readonly camPosKm: Vec3 };

// OrbitTrailRenderer.d.ts
draw(pass, instances, count, occluders, depthFrame: OrbitTrailDepthFrame | null, depthView: GPUTextureView, showImpostor?: boolean): void;
```

**Fragment to hit** (after the sphere fold at `fragment.wesl:87-93`, before the discard):
`texel = vec2<i32>(in.clip.xy * vec2f(textureDimensions(sceneDepth)) / occ.viewportPx)`;
`depth = textureLoad(sceneDepth, texel, 0)`; if `depth != FAR_DEPTH`:
`uv = in.clip.xy / occ.viewportPx`, `sceneKm = sceneRayDistance(uv, depth, occ.invMvp, occ.camPosKm)`,
`trailKm = length(x)` (`x` at `fragment.wesl:86`), `tol = DEPTH_CLEARANCE_REL * trailKm`,
`clear *= smoothstep(-tol, tol, sceneKm - trailKm)`. New binding `@group(0) @binding(1) var sceneDepth: texture_depth_2d`.
Import the helpers from `lib/sceneDepthRay.wesl`.

**Renderer to hit:** BGL gains binding 1 (`texture: { sampleType: 'depth' }`, FRAGMENT); the bind group
moves from construction to first `draw` and is rebuilt only when `depthView` identity changes
(`aerialPerspectiveRenderer.ts:145-154` is the pattern). `draw` packs `invMvp`, `camPosKm`,
`viewportPx` into the same scratch buffer after the spheres; `depthFrame === null` packs identity +
zero (never read: the far placeholder makes every texel `FAR_DEPTH`). Still ONE `writeBuffer` for the
uniform and ONE `setBindGroup(0)`.

**Pass to hit** (`orbitTrailsPass.draw`): `row = view.sampledDepth?.row ?? null`; when
`row?.frame.kind === 'body-m'`: `pose = ctx.bodyPose(row.frame.bodyId)`, and if non-null
`mvp = composeBodySlabMvp(row.vp, pose.eyeRelBodyM, 1000)` (f64 `row.vp`, never `view.vp`: the
invariant at `orbitTrailsPass.ts:6-9`), `invMvp = narrowMat4(mat4d.inverse(mvp))` (as
`atmosphereShellUniforms.ts:31-48`), `camPosKm = bodySlabCamLocal(pose.eyeRelBodyM, 1000)`; else
`null`. Hand `renderer.draw(..., depthFrame, view.sampledDepth!.view, ...)`.

`frameOrder.ts:259-265`: the `'orbit-trails'` line gains `depth: { sample: 'foreground:0' }` (hdr is
depthless, so this attaches nothing; it only names the texture the pass reads). Update the comment
at `:255-258`: trails hide behind the last body row's terrain and meshes; the analytic spheres still
cover every other body.

**Tests:**
- `orbitTrailConstants.parity.test.ts:195-206`: extend the field regex and size table with
  `mat4x4<f32>` (64, align 16), `vec3<f32>` (12, align 16), `vec2<f32>` (8, align 8); assert the three
  new offsets and `OCCLUDER_UNIFORM_BYTES`.
- `orbitTrailRenderer.test.ts`: `:121` still no `depthStencil`; `:169-195` keep TWO `writeBuffer`
  calls and one `setBindGroup`; add `rebuilds the bind group only when the depth view identity changes`.
- `orbitTrailsPass.test.ts:359`: extend to assert the depth frame is derived from `view.sampledDepth.row`
  via `composeBodySlabMvp(row.vp, …, 1000)`, and add `hands a null depth frame when no body row cleared the depth`.
- `expandFrameOrder.test.ts` / `checkFrameOrder.test.ts`: no new test; the boot check covers the new source.

- [ ] Implement, tests, `npx vitest run tests/services/gpu/shaders tests/services/gpu/renderers/bodies tests/services/engine/frame`, `npm run typecheck:fast`.
- [ ] Commit: `feat(orbit-trails): trails hide behind sampled scene depth`.

---

### Task 8: Docs and leftovers

**Files:** modify `docs/RENDERER.md` (FRAME_ORDER paragraph, the sampled-depth sentence added by #790),
`src/services/engine/frame/frameOrder.ts:235-241`.

- [ ] `docs/RENDERER.md`: one paragraph after the sampled-depth sentence: the aerial bake compute
      row (volume pair, 4 km slices, 256 km far bound, why the bake owns the shell record write) and the
      two sampled-depth consumers (aerial apply, orbit trails). No history.
- [ ] `frameOrder.ts:235-241`: the aerial-line comment no longer mentions a march; say the volume was
      baked from this row's record in the prelude.
- [ ] Grep `src` for `marchAerial|AERIAL_STEPS|encodeFroxel|froxelLut` → zero hits.
- [ ] Commit: `docs(renderer): froxel aerial perspective and sampled-depth consumers`.

---

## Verification (controller, after Task 8)

- Eye-checks by the user on this worktree's dev server (:5173, f.lux off): Everest 07:43 UTC pose
  (`.superpowers/spike-poses/earth-everest.json`) — phantom band gone, no banding along the ray, no
  screen-space blockiness from the 32×32 ray grid; Dead Sea pose — trails hidden behind the hills;
  descent through 1.005 × top radius — no pop; a Mars rover site; outside the shell — unchanged.
- Perf (`perf` skill, `--url http://localhost:5173`): paired A/B OUTSIDE the shell against
  `origin/main`, expected neutral; neutral-or-negative HALTS landing pending the user's ruling.
  INSIDE: absolute `aerial-perspective-compute` and `AERIAL` numbers reported next to the spike's
  42–50 ms (dpr2, N=16).
- Headless regression: scratchpad `shotPose.mts` Everest capture diffed against
  `everest-after.png` (the spike) with `diffAmp.mts`; expected mean diff ≲ 0.1/255 (the gate run
  measured 0.04 for the 4 km emulation).

## Definition of Done

**Deliverables:** `src/data/atmosphere/froxelVolume.ts`; `aerialPerspective/{froxelSlices,bake}.wesl`;
`frame/computes/aerialPerspectiveCompute.ts` + `frame/encodeAtmosphereAerialPerspective.ts`;
`AerialPerspectiveRenderer.bake/draw` and `AtmosphereShellRenderer.bakeAerialPerspective`;
`OrbitTrailDepthFrame.d.ts`; `froxelSliceKm` at byte 108; the `'aerial-perspective'` compute line and
the trails line's `depth: { sample: 'foreground:0' }` in `FRAME_ORDER`.

**Observable behaviours:** Everest terrain fogged to its own depth (no haze column over the summit);
orbit trails vanish behind terrain and meshes of the body row that last wrote depth; the DebugPanel
lists `aerial-perspective-compute` and it toggles the bake; outside any shell the frame is pixel-identical
to main; a body with no inside entry runs no bake pass.

**Deferral boundary:** Mars density altitude-zero (`docs/backlog/2026-09-21-atmosphere-density-altitude-zero.md`);
inside-sky stars at daytime (known, separate); Bruneton tables; contact-shadow's own NDC build adopting
`lib/sceneDepthRay.wesl`; any froxel resolution knob beyond `FROXEL_DIMS`.
