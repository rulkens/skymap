# Froxel aerial perspective for the atmosphere: design

> **Status.** Ratified by the user; ready to plan.
> **Date.** 2026-09-14.
> **Relationship to prior work.** Completes the deferred half of
> [Inside-atmosphere rendering](completed/2026-08-24-inside-atmosphere-rendering-design.md)
> (§6 names this feature as out of scope there) and retires the `mesh-bodies`
> ordering stopgap shipped as #698. Absorbs
> [`docs/backlog/2026-09-01-atmosphere-froxel-aerial-perspective.md`](../../backlog/2026-09-01-atmosphere-froxel-aerial-perspective.md),
> deleted by this change (§8).

## 1. Problem

Inside an atmosphere (`isInsideAtmosphereShell(camLocal)`, camera radius below
1.005 atmosphere-top radii) the shell abandons its proxy mesh for a full-screen
pair of entry points, and every ray goes through `sampleShellRay`
(`shell/fragment.wesl:146-267`): one sky-view LUT lookup, capped at the
analytic ground sphere. That integral is the whole camera-to-space column, so a
down-looking ray gets the haze of a ray that never stopped at the terrain it is
looking at. Two consequences:

- **Washout.** The down-view over-hazes. The sky-view LUT is 192x108 over the
  full sphere, exposure-tuned for the from-space limb, and it compresses the
  below-horizon hemisphere into a handful of texels. Evidence artifact:
  <https://claude.ai/code/artifact/4e5fd214-9021-4948-b7a8-1c42f032b70c>.
- **No scene depth, so no correct occluder.** The inside path draws
  `depthCompare: 'always'` over a target whose depth it never reads, so an
  opaque mesh standing on the ground is invisible to it. #698's stopgap draws
  `mesh-bodies` AFTER the shell: correct silhouettes, at the price of a rover
  taking no aerial perspective at all. The prose arguing that trade (at
  `frameOrder.ts`'s `bodyPasses` block and in `atmosphereShellPass.ts`'s
  header) is rewritten by this change.

The fix is Hillaire (2020)'s split: the sky-view LUT keeps the sky rays, and a
camera-frustum-aligned 3D froxel volume (in-scatter plus transmittance
integrated to each slice) serves the geometry rays, sampled at `(uv, depth)`.

## 2. Ratified decisions

- **Scope: the inside down-view washout AND fog on every occluder inside the
  shell.** Earth surface tiles, planet and globe spheres, textured bodies, mesh
  bodies, and attached bodies such as the whale all take distance fog. The
  cloud deck writes no depth, so it takes fog at the ground distance behind it;
  accepted limitation, not a defect to chase.
- **One body only.** The froxel volume is baked and applied for the single body
  the camera is inside. Outside-the-shell rendering (the proxy-mesh two-wall
  path) is untouched and must stay pixel-identical.
- **A depth-keyed post-loop apply step**, not a per-shader fog lookup added to
  every body shader. One full-screen pass reads the foreground depth buffer and
  branches per pixel.
- **Per-channel transmittance.** Two `rgba16float` 3D textures, not one plus a
  grey scalar. The shell exists because one channel cannot attenuate three
  wavelengths (`atmosphereShellRenderer.ts`'s header records the cyan-wash that
  taught it).

## 3. Ground preparation

Seven prep refactors, their own commits, landing as their own PR **before** the
feature PR (user ruling). Each touchpoint below was a bolt-on verdict: a
special case, a duplicated derivation, or a second trigger for an existing
special case. After them the feature lands as growth: two new `FRAME_ORDER`
rows, new files, and one widened union.

1. **Painter order must put the inside body last.** `deriveSlabs`'s body-row
   sort (`slabs.ts:319`) keys on `distanceRangeM[0]`, which is
   `max(dM - rMaxM, 0)`. Every body the camera is inside clamps to 0, ties with
   every other such row, and the stable sort then keeps input order: the inside
   body is last only by luck. The tie-break goes into that sort alone, where the
   unclamped `dM - rMaxM` is already in scope as a row-local value:
   `bodySlabRow` returns it as `signedNearM` beside `slab` and `chainRow`, and
   the sort reads it as its secondary key, primary key `distanceRangeM[0]`
   descending as today, both descending. No `Slab` field, and `distanceRangeM`
   keeps its clamped meaning for the overlap warn and the pick path, which read
   it as a bracket rather than an ordering key.
   **Contract:** `foregroundChainOrder` is unchanged and must stay that way. It
   receives `ctx.slabs` in index order, index equals painter ordinal after
   `deriveSlabs`, and its sort is stable (ES2019), so rows tied at 0 keep the
   order `deriveSlabs` established; re-sorting or reordering its input discards
   the tie-break silently.
   *Verdict: bolt-on.* The feature's correctness rests on "the last foreground
   row is the inside body", which today is an accident.
2. **`AtmosphereDrawEntry` carries its own derivations.**
   `atmosphereShellPass.draw:107-141` and `encodeAtmosphereSkyView:92-101`
   derive `atmosphereTopM`, `camLocal` and `sunLocal` from the same pose, twice.
   A third consumer (the bake) and a fourth (the apply pass) would make it four.
   The entry grows the four fields, derived once in `atmosphereDrawList` from
   `ctx.bodyPose`; a null pose skips the entry there, which deletes the null-pose
   guard in both existing consumers.
   *Verdict: bolt-on (duplicate derivation), already flagged by #631's §5a.*
3. **Memoise `atmosphereDrawList` per frame.** Its own commit, kept as a
   separate diff from prep 2 even though both touch the file. The list is
   recomputed on every call, three or more times per body per frame today
   (`atmosphereShellPass.enabled`, `atmosphereShellPass.draw`,
   `encodeAtmosphereSkyView`), each call taking a fresh `sceneBodyStates`
   snapshot; the bake and the apply pass add two more consumers, and prep 2
   raises the per-call cost. `atmosphereDrawList(state, ctx)` derives once per
   frame and every consumer reads that one list. Contract: memoised on the
   `ReadyFrameContext` identity, the `WeakMap<ReadyFrameContext, T>` pattern
   `cosmoLabelProjection.ts:14` already uses (`state` is a live getter and is
   NOT part of the key; `ctx` is the per-frame object). The map lives in its own
   frame file, `frame/atmosphereDrawListCache.ts`, exporting
   `atmosphereDrawListCache`: a second module-level declaration inside
   `atmosphereDrawList.ts` would need a new `frameFilePurity` allow-list row,
   and that list only ever shrinks (`cosmoLabelProjection`'s row is precisely
   this debt, already booked).
   *Verdict: bolt-on.* A per-frame derivation the module header already calls
   "the ONE per-frame derivation" while the code recomputes it per caller.
4. **One shell uniform builder.** `atmosphereShellPass.draw:100-141` composes
   mvp, invMvp, sun, camLocal, bottomRadius, exposure and the ring ratios into
   `packAtmosphereUniforms`. The bake and the apply pass need the identical
   record, and "identical" is the whole correctness argument (§4.4). Extract to
   its own frame file, `src/services/engine/frame/atmosphereShellUniforms.ts`,
   one export.
   *Verdict: bolt-on.* Three copies of a byte-layout-critical build is the
   drift the packer exists to prevent, re-introduced one level up.
5. **Fold the `lens` step kind into `render`.** `lens` exists only because a
   render line could not name a slab resolved per frame. `insideAtmosphere`
   wants exactly that, and adding a second bespoke kind would confirm the
   special case rather than remove it.
   *Verdict: bolt-on.* A step kind that exists for one caller's slab-resolution
   timing, about to acquire a second.
6. **Extract the per-step scattering integrand.** `raymarchInScatter`'s loop
   body (`skyViewLut.wesl:129-170`: medium sample, sun transmittance,
   multi-scatter, twilight fade into one source, then the analytic
   `(s - s*T)/sigma` step) moves into `scattering.wesl` and the sky-view loop
   calls it. This is what makes the froxel bake and the sky-view LUT the same
   integrand rather than two implementations that agree by inspection (§4.6).
   Pixel-identical by construction; paired A/B on `npm run perf`.
   *Verdict: bolt-on.* A second march would be a second source of truth for a
   physical integral.
7. **Foreground depth becomes sampleable.** `renderTargets.ts:428` declares
   `RENDER_ATTACHMENT` only; add `TEXTURE_BINDING` and rewrite the comment at
   `:421-427`, which currently asserts that nothing samples depth downstream and
   explains why (the per-row depth clear). That reason still holds for
   cross-row occlusion and the caption path; it stops being a reason nothing
   binds the texture.
   *Verdict: bolt-on.* A usage flag that encodes "no consumer exists" as a
   permission.

## 4. Design

### 4.1 Frame architecture

`FRAME_ORDER` gains two lines. The bake joins the compute prelude beside its
sibling, immediately after `atmosphereSkyView`, which is a listing choice: the
frame is one encoder with one submit, and `queue.writeBuffer` lands before any
command buffer submitted after it, so both bakes see this frame's
`SkyViewParams` whichever order they encode in:

```ts
{ kind: 'compute', name: 'atmosphereFroxel' },
```

The apply sits between the `foreground` line and the
`foreground:0 -> hdr` composite:

```ts
{
  kind: 'render',
  target: 'foreground:0',
  slab: 'insideAtmosphere',
  depth: 'sample',
  passes: ['aerial-perspective'],
  slot: 'AERIAL',
},
```

The `slot` is not decoration. Without one this step's timing key is
`groupKeyOf('foreground:0', <the inside body's row>)`, byte-identical to the
foreground-chain step for that same row, so `timedSlotRowsOf` would emit two
rows under one name; `slot` is the existing separator for exactly that
(`POST_LENSING`, `POST_FOREGROUND`).

`executeFrame`'s `COMPUTE` table gains a row calling a new frame file:

```ts
export function encodeAtmosphereFroxel(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
): void;
```

It finds the `atmosphereDrawList` entry with `inside === true`. None means no
dispatch: outside the shell this feature costs zero GPU work, the same
guarantee the lens line gives.

**`depth: 'sample'` means no depth attachment.** `depthAttachment` in
`executeFrame` returns `{}` for it, and the pass binds `foreground:0`'s depth
texture as a `texture_depth_2d` instead. WebGPU forbids sampling a view that is
attached to the same pass, so this is the only shape that reads scene depth
here. What the depth buffer holds at that point is exactly the inside body's
geometry: every foreground row clears its own depth, and prep 1 makes the
inside body's row the last one.

The new `ContentPass` (`frame/passes/aerialPerspectivePass.ts`) is `enabled`
when `view.slab.frame.kind === 'body-m'` and that body's draw-list entry has
`inside`; `draw` builds the uniform record with the shared builder and calls
`renderer.drawAerialPerspective(pass, bodyId, uniforms,
ctx.renderTargets.depthViewOf('foreground:0'))`.

`atmosphereShellPass.enabled` returns false for a body whose entry is `inside`,
and `AtmosphereShellRenderer.draw` loses its `inside` boolean: the inside
pipeline pair moves to the aerial-perspective module, and `fsInsideMultiply` /
`fsInsideAdd` move to its shader as `fsAerialMultiply` / `fsAerialAdd`.
`insideRayDir` is the one exception: it is REPLACED, not moved, by
`froxelSlices.wesl`'s parameterised `froxelRayDir` (identical arithmetic, §4.4),
which the bake calls too. Nothing is duplicated. `mesh-bodies`
stays where it is in `bodyPasses` (the outside path still wants it after the
shells), but the #698 prose at `frameOrder.ts` and in `atmosphereShellPass.ts`'s
header is rewritten to describe the new truth rather than the stopgap.

### 4.2 Step kinds and the resolved slab

Prep 5's widened contract:

```ts
// src/@types/engine/frame/BodyRowSource.d.ts
export type BodyRowSource = 'lens' | 'insideAtmosphere';

// RenderStepSpec
readonly slab: number | BodyRowSource;
readonly depth?: 'clear' | 'load' | 'sample';

// FrameInputs
readonly bodyRowSlabs: Record<BodyRowSource, readonly number[]>;
```

`LensStepSpec.d.ts` is deleted, along with the `lens` rows in `EXPAND_STEP` and
in `checkFrameOrder`'s `STEP_FACTS`. `FrameStep`'s `depthLoad` is renamed
`depth` and gains `'sample'`. A `render` spec whose `slab` is a
`BodyRowSource` expands to one step per entry in that list, so both lines keep
the zero-emission property when their list is empty.

`renderFrame` resolves both lists in one place (`renderFrame.ts:159-222` is the
precedent, `sgrAStarBodySlab`):

```ts
bodyRowSlabs: {
  lens: sgrAStarBodySlab === null ? [] : [sgrAStarBodySlab],
  insideAtmosphere: /* the inside body's row index via ctx.slabs, or [] */,
},
```

### 4.3 The froxel bake

Two `rgba16float` `texture_3d`, 32x32x32 (`FROXEL_SIZE`, one constant, the
shader reading `textureDimensions` rather than restating it, matching the
existing LUT-size convention). One stores in-scatter rgb integrated from the
camera to that slice, the other the rgb transmittance over the same interval.
Allocated once in the new module, re-baked for whichever body is inside. The
module also owns its own per-body bake bind groups, keyed by body id and built
at construction from the LUT textures, buffers and sampler the shell factory
hands it (§11). `AtmosphereBundle` is not touched.

`froxelLut.wesl` is a compute shader, `@workgroup_size(8, 8)` over `(x, y)`.
Per invocation it reconstructs ONE ray through `u.invMvp` with the same
homogeneous unproject the apply uses, then loops z, accumulating radiance and
throughput with the shared per-step integrand from prep 6 and storing at every
slice boundary. Bake ray equals apply ray per texel by construction, which is
the property that keeps the two halves registered. Slice 0 is the identity
(`T = 1`, `L = 0`).

The bake works in km (`camLocal * atmosphereTopKm`), like `skyViewLut.wesl`;
the shell and the apply work in atmosphere-top units. The LUT parametrisations
are ratio-based and accept either (`scattering.wesl`'s header states this).

**No new packed params record.** The bake binds a SECOND buffer of the existing
`AtmosphereUniforms` layout, written by `packAtmosphereUniforms` from the same
inputs as the shell's (the prep-3 builder), plus the bundle's `ScatteringParams`
and its `SkyViewParams` (for `twilightSoftness` and `twilightIntensity`). No new
byte layout, so no new parity test.

### 4.4 Slice distribution and the far bound

`D`, the maximum ground-geometry distance inside the atmosphere, is computed in
the shader from `u.camPosLocal` and `u.bottomRadius` (top radius is 1 by the
local-frame convention):

```
D = sqrt(r_cam^2 - R_g^2) + sqrt(R_top^2 - R_g^2)
```

the camera-to-ground-tangent length plus the tangent-to-top length: the longest
ray that can both graze the ground and stay under the atmosphere top. Slices
are distributed squared over `[0, D]`, and anything beyond clamps to the last
slice.

`D`, the slice-to-distance mapping (both directions) and the ray reconstruction
live in ONE shared WESL file, `froxelSlices.wesl`, imported by the bake and the
apply:

```
fn froxelMaxDistance(camRadius: f32, bottomRadius: f32) -> f32
fn froxelSliceDistance(slice: f32, sliceCount: f32, maxDistance: f32) -> f32
fn froxelSliceCoord(distance: f32, sliceCount: f32, maxDistance: f32) -> f32
fn froxelRayDir(invMvp: mat4x4<f32>, camPosLocal: vec3<f32>, uv: vec2<f32>) -> vec3<f32>
fn froxelRayDistance(invMvp: mat4x4<f32>, camPosLocal: vec3<f32>, uv: vec2<f32>, depth: f32) -> f32
```

`froxelSliceCoord` takes `sliceCount` because an exact inverse of
`froxelSliceDistance` needs N for the texel-centre offset; a two-argument form
would be off by half a slice.

The two ray functions live here, parameterised, for a linker reason with teeth:
a WESL module cannot capture a consumer's `@group`/`@binding`, so §4.3's "bake
ray equals apply ray by construction" is achievable ONLY as one shared function
the two consumers pass their own uniforms into. Both share one private
numerator, so the direction and the distance can never describe different rays.

No TS mirror, so there is no cross-language parity to keep. Coupling worth
recording: per-planet 3D terrain (PR #700) lifts real geometry above `R_g`, so
a terrain ray can exceed `D`. The clamp covers it, at the cost of the last
slice's fog being reused past the bound.

### 4.5 The apply pass

One full-screen pass, colour loading `foreground:0`, drawn twice with the SAME
blend states the shell uses today (multiply `zero`/`src`, then add `one`/`one`,
in that order; reversing attenuates this body's own in-scatter by its own
transmittance).

Per pixel it reconstructs the ray through `u.invMvp` with `froxelRayDir`, reads
`d = textureLoad(depth, pixel, 0)`, and branches:

- **`d == depthClearValueFor(reversedZ)`** (0 under the body slab's reversed-Z
  convention): SKY. Today's `sampleShellRay`, unchanged, with identical alpha
  semantics (multiply writes `1 - coverage`, add writes `coverage`), so the
  star and deep-space washout the compositor derives from `foreground:0`'s
  alpha is preserved exactly.
- **otherwise**: GEOMETRY. Reconstruct the view distance to the depth sample
  through the same homogeneous form, in atmosphere-top units (the shell's own
  frame), map it to the froxel w with `froxelSliceCoord`, and sample both 3D
  textures at `(uv, w)`. Multiply writes `(T.rgb, 1.0)`, add writes
  `(inScatter.rgb * exposure, 0.0)`: alpha passes through untouched, so opaque
  ground stays opaque for the compositor.

`froxelRayDistance` shares `froxelRayDir`'s numerator (§4.4) so the two can
never describe different rays:

```
// froxelRayDistance(invMvp, camPosLocal, uv, depth):
// P = invMvp * vec4(clipXy, depth, 1.0)
// length(P.xyz - camPosLocal * P.w) / abs(P.w)
```

The divide by `P.w` is safe here and only here: the geometry branch is reached
only when `depth` differs from the far-plane clear value, so `w` is bounded
away from zero. The sky branch never divides (that is the landmine the
homogeneous form exists for, docs/RENDERER.md).

**Precision floor, accepted.** `P.xyz - camPosLocal * P.w` cancels
catastrophically for a point near the camera: in f32 atmosphere-top units
(Earth's top is about 6,471 km, so one ulp of a unit-scale coordinate is about
0.6 m) the reconstructed distance carries an error floor of roughly a metre.
That is fine by construction. The error is absolute rather than relative, so it
vanishes against the kilometre distances at which fog is visible at all, and at
metre range the froxel lookup lands in the identity slice regardless. Recorded
so nobody "fixes" this into a divide-then-subtract form, which trades a
harmless absolute floor for the far-plane blow-up the homogeneous form avoids.

### 4.6 Handoff at 1.005

`isInsideAtmosphereShell` switches paths at 1.005 atmosphere-top radii. Nothing
blends across the boundary; the two sides agree because prep 6 makes the
outside near-wall integral (through the sky-view LUT) and the inside froxel
integral the same integrand over the same medium, evaluated on the same ray.
The visual gate checks that claim by looking for a pop.

## 5. Out of scope

- Fog on the cloud deck at its own depth. The deck writes no depth, so it takes
  the fog of the ground behind it (§2).
- Any change to the outside-the-shell path: proxy-mesh pipelines, the wall-duty
  split, the sky-view LUT's dimensions or cadence.
- Froxel volumes for a body the camera is not inside.
- Per-body tuning of the new fog. Earth is the reference; Mars gets a sanity
  look because the rover framing is what motivated #698.
- Shadowed or volumetric light shafts through the froxel volume.

## 6. Risks, judged and accepted

- **Silhouette haloing.** 32x32 XY froxels are coarse relative to the sky
  branch, which is exact per pixel. At a sky/geometry silhouette the two
  branches meet across one froxel of interpolation, which can read as a halo.
  Judge at the visual gate; `FROXEL_SIZE` is the knob, and the cost is cubic.
- **Near-field slice resolution.** At altitude `D` is roughly twice the tangent
  length (about 2,300 km for Earth), so squared distribution puts the first
  slice boundary at roughly 1 to 2 km. In-scatter is near-linear over that
  interval and slice 0 is the identity, so trilinear interpolation stays
  correct at the metre-to-kilometre ranges a rover is framed at. That is why
  the identity slice is specified rather than left to the bake loop.
- **Depth from the last row only.** Benign: painter order puts every earlier
  row outside this atmosphere, where the sky branch is the physically correct
  answer anyway.

## 7. Landmines

- **The depth view changes identity on resize.** `depthViewOf('foreground:0')`
  returns a new view after `reconcile` reallocates the row, so the apply pass's
  bind group is keyed on the view object and rebuilt when it differs. A cached
  bind group over a destroyed texture is a validation error, and on iOS a
  silently dropped frame.
- **Never divide by `w` in the sky branch.** §4.5. Under reversed-Z the far
  plane is `z = 0` and the divide degenerates every ray to one direction (a
  uniform grey veil).
- **Multiply before add, both branches**, the shell's existing invariant.
- **Per-channel transmittance, not a grey scalar.** A luminance-collapsed
  factor adds blue to the ground without removing blue from it.
- **iOS drops the whole frame on one bad pipeline.** Build the new pipelines
  through `createShaderModuleWithDevLog`, as every atmosphere pipeline does.
- **`writeBuffer` immediately before its own dispatch or draw.** The bake's
  second `AtmosphereUniforms` buffer is per body, written at its own call site;
  no shared buffer may sit between a write and a `submit`.

## 8. Backlog edits (this change)

- Deleted `docs/backlog/2026-09-01-atmosphere-froxel-aerial-perspective.md` and
  its `docs/BACKLOG.md` index line; this spec absorbs it.
- No backlog line added. The one adjacent finding this work surfaced,
  `atmosphereDrawList` being recomputed per call, is fixed here instead, as
  prep 3.

## 9. Testing

Judged by "would this fail on a real bug nothing else catches"
(`docs/superpowers/conventions/testing.md`).

**Prep:**

- `tests/services/engine/frame/slabs.test.ts`: `the body the camera is inside is
  the last foreground chain row`, asserting on
  `foregroundChainOrder(deriveSlabs(...))` rather than on `deriveSlabs` alone,
  since the carry-through (stable sort over index order) is half of what prep 1
  guarantees. Built from two body rows whose clamped near distance both land at
  0, ordered so the pre-prep sort puts the inside body first.
- `tests/services/engine/frame/expandFrameOrder.test.ts`: `a render line with a
  BodyRowSource slab expands once per resolved row`, and `a render line with an
  empty BodyRowSource list emits no step`.
- `tests/services/engine/frame/checkFrameOrder.test.ts` and
  `frameOrderBoot.test.ts`: updated for the folded `lens` kind (the lensing pass
  is now drawn by a `render` line) and for `depth: 'sample'`.
- `tests/services/engine/frame/atmosphereDrawList.test.ts`: `entries carry
  inside=true when the camera is within the handoff ratio`, `a body with no
  pose is absent from the list`, and (prep 3) `a second ctx re-derives the
  list`, which is the memo bug that matters: a key that outlives the frame
  serves a stale body position to the bake.

**Feature:**

- `expandFrameOrder`: `the aerial-perspective step is emitted only when
  bodyRowSlabs.insideAtmosphere is non-empty`. The compute row gets no test: a
  compute spec always expands to a compute step, and the zero-work guarantee
  lives in the encoder, not the expansion.
- `tests/services/engine/frame/frameFilePurity.test.ts`: unchanged allow-list.
  The new frame files (`encodeAtmosphereFroxel`, `atmosphereShellUniforms`,
  `passes/aerialPerspectivePass`) each export exactly one symbol, so the ratchet
  gains no rows.
- `atmosphereUniformsLayout.parity`: unchanged. The bake reuses the existing
  layout, which is why it gains no test.

**Visual gate (user's eyes, dev server):**

- Standing on Earth's surface, down-view: the washout is gone and the ground
  reads at its own distance.
- Earth tiles, mesh bodies and the Mars rover take fog that grows with distance.
- Descent through 1.005: no pop at the handoff.
- Stars and deep space through the sky branch: unchanged from today.

**Perf (`perf` skill, `--url` on this worktree's own port):**

- Paired A/B OUTSIDE the shell. Expect neutral: no dispatch, no step. A
  neutral-or-negative result here halts landing.
- Absolute cost INSIDE the shell, reported as a number rather than a pass/fail:
  one 32-cubed bake plus one full-screen apply drawn twice.

## 10. References

- `frame/frameOrder.ts`: the two new lines, and the #698 prose §4.1 rewrites.
- `frame/expandFrameOrder.ts`, `frame/checkFrameOrder.ts`: prep 5's tables.
- `frame/executeFrame.ts`: the `COMPUTE` table and `depthAttachment`.
- `frame/slabs.ts:300-353`: prep 1's sort, and the `foregroundChainOrder` it
  deliberately leaves alone.
- `frame/atmosphereDrawList.ts`: prep 2's derivation site, prep 3's memo site.
- `frame/cosmoLabelProjection.ts:14`: the `WeakMap<ReadyFrameContext, T>`
  pattern prep 3 follows.
- `frame/encodeAtmosphereSkyView.ts`: the prelude precedent, and the
  `SkyViewParams` write §4.3 reuses.
- `frame/passes/atmosphereShellPass.ts`: prep 4's extraction source.
- `frame/renderFrame.ts:159-222`: the resolved-slab precedent.
- `gpu/renderers/atmosphere/atmosphereShellRenderer.ts`: the bundle, the inside
  pipeline pair §4.1 moves out, `encodeSkyView`'s shape.
- `gpu/shaders/atmosphere/skyViewLut.wesl:107-172`: prep 6's extraction source.
- `gpu/shaders/atmosphere/shell/fragment.wesl:146-370`: `sampleShellRay` (the
  sky branch) plus the inside entry points §4.1 moves.
- `gpu/renderTargets.ts:415-432`: prep 7's usage flag.
- `utils/camera/isInsideAtmosphereShell.ts`, `utils/gpu/depthClearValueFor.ts`,
  `utils/gpu/packAtmosphereUniforms.ts`: the handoff ratio, the sky-branch
  discriminant, the layout the bake's second buffer reuses.
- docs/RENDERER.md: the homogeneous-unproject and iOS one-bad-pipeline
  landmines, and the per-row depth clear.

## 11. New and changed artifacts

**New:**

- `src/@types/engine/frame/BodyRowSource.d.ts`
- `src/services/engine/frame/encodeAtmosphereFroxel.ts`
- `src/services/engine/frame/atmosphereDrawListCache.ts` (prep 3)
- `src/services/engine/frame/atmosphereShellUniforms.ts` (prep 4)
- `src/services/engine/frame/passes/aerialPerspectivePass.ts`
- `src/@types/rendering/AerialPerspectiveRenderer.d.ts`
- `src/services/gpu/renderers/atmosphere/aerialPerspectiveRenderer.ts`
- `src/services/gpu/shaders/atmosphere/froxelLut.wesl`
- `src/services/gpu/shaders/atmosphere/froxelSlices.wesl`
- `src/services/gpu/shaders/atmosphere/aerialPerspective/fragment.wesl`

**Changed API:**

```ts
// src/@types/rendering/AerialPerspectiveRenderer.d.ts
export type AerialPerspectiveRenderer = Renderer & {
  encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void;
  draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;
};

export function createAerialPerspectiveRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  sampler: GPUSampler,
  placeholderRingView: GPUTextureView,
  bodies: ReadonlyMap<
    string,
    {
      scatteringBuffer: GPUBuffer;
      skyViewParamsBuffer: GPUBuffer;
      shellUniformBuffer: GPUBuffer;
      transmittanceTex: GPUTexture;
      multiScatterTex: GPUTexture;
      skyViewTex: GPUTexture;
    }
  >,
): AerialPerspectiveRenderer;

// src/@types/rendering/AtmosphereShellRenderer.d.ts
encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void;
drawAerialPerspective(
  pass: GPURenderPassEncoder,
  bodyId: string,
  uniforms: Float32Array,
  depthView: GPUTextureView,
): void;
draw(pass: GPURenderPassEncoder, bodyId: string, uniforms: Float32Array): void;

// src/services/engine/frame/atmosphereShellUniforms.ts (prep 4)
export function atmosphereShellUniforms(
  entry: AtmosphereDrawEntry,
  slab: Slab,
  ctx: ReadyFrameContext,
  state: PassState,
): Float32Array;

// src/@types/engine/frame/AtmosphereDrawEntry.d.ts (prep 2), added fields
readonly atmosphereTopM: number;
readonly camLocal: Vec3;   // atmosphere-top-radius units
readonly sunLocal: Vec3;
readonly inside: boolean;
```

`aerialPerspectiveRenderer` is constructed by `createAtmosphereShellRenderer`,
which passes in the per-body LUT textures, the scattering and sky-view buffers,
and the shared sampler; `AtmosphereShellRenderer`'s two new methods are its
delegation to it. The ring binding it receives is the shared 1x1 placeholder
view rather than a per-body strip: inside the shell `tNear` is 0, so the
ring-in-front branch is unreachable and no real strip can matter. The
aerial-perspective fragment reuses the existing full-screen `insideVs` vertex
entry point.

**Deleted:** `src/@types/engine/frame/LensStepSpec.d.ts` (prep 5),
`docs/backlog/2026-09-01-atmosphere-froxel-aerial-perspective.md` (§8).
