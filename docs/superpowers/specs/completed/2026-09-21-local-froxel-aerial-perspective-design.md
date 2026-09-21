# Local froxel aerial perspective + depth-occluded orbit trails: design

> **Status.** Shape ratified by the user 2026-09-21 (refactor-ground checkpoint); spec
> awaiting review. **Date.** 2026-09-21.
> **Relationship to prior work.** Supersedes and deletes
> `2026-09-14-atmosphere-froxel-aerial-perspective-design.md` and its plan (#709,
> abandoned: planetary-scale slabs could not resolve the fog). Builds on the D spike
> `459782f44` (per-pixel march, visually correct, ~50x over budget): its frame seam, apply
> pass, depth reconstruction and blend pair stay; only `marchAerial` and the perf script go.
> Absorbs `docs/backlog/2026-09-18-orbit-trails-draw-through-terrain.md` (deleted here).
> #709's code survives on branch `worktree-atmosphere-froxel-aerial-perspective` (`cbbab4481`,
> feature diff `059623802..cbbab4481`): its bake compute, storage-3D volume allocation and
> renderer bind groups are the port source for §4.1; its slice regime and uniform ownership
> are NOT (planetary slabs, draw-time write), and main has moved since, so port by hand.

## 1. Problem

Inside an atmosphere every geometry pixel is fogged to the analytic ground sphere
(`u.bottomRadius`, the relief floor), not to the pixel's own depth: a phantom haze column
over terrain (~9 km over Everest), and every mesh body inside the shell takes the whole
column. The spike proved the fix is "fog to the depth hit" and that a per-pixel march is
the wrong price: cost is pure fill, linear in pixels and steps.

Orbit trails have the same root cause one layer up: they draw after the composite,
occluded only by one analytic sphere per body at the relief floor, so all land above the
floor stops occluding (Dead Sea pose: trails through the hills).

Both consumers want the same thing: **scene depth, sampled as a texture, after the
foreground chain.** The spike built that seam for one consumer; this feature makes it a
declared frame joint and adds the second.

## 2. Ratified decisions

- **B, the local regime.** A camera-frustum-aligned volume of fixed 4 km slices, 64 deep
  (the slices reach 256 km); past the last slice the apply hands the pixel to the outside
  shell's per-pixel segment answer, so the fog reaches the terminator without a
  column-dependent total at the limb, cross-faded against the froxel answer by a horizon-distance
  weight so the hand-off draws no line on the ground. The gate
  (4 km-slab emulation, 1 km sub-steps, linear lerp at the hit, vs the 16-step march at
  Everest 07:43 UTC) measured mean |diff| 0.04/255, max 2, against a fog signal of mean
  14.7, max 105. Bruneton tables remain the all-altitude answer, parked.
- **One body.** The volume pair is baked for the body the camera is inside; the outside
  proxy-mesh path is untouched and stays pixel-identical.
- **Per-channel transmittance, two draws.** Two `rgba16float` volumes (in-scatter,
  transmittance) and the shell's MULTIPLY + ADD pair. Dual-source blending is an optional
  WebGPU feature absent on the target phones; with a lookup, the second draw costs two
  texture reads.
- **Delegation stays.** The aerial renderer is reached through `atmosphereShellRenderer`
  (tier `reconcile` destroys the sky-view texture the apply binds; the owner rebinds).
- **Orbit trails IN scope:** the second consumer of sampled scene depth. Analytic sphere
  occluders STAY for every body the depth does not hold.
- **Two consumers added in execution:** the scene-body captions and their leader lines
  (task 10), and the outside-shell atmosphere (task 11), which classifies each ray by that
  depth instead of by the relief-floor sphere — the limb band fix. The joint is five rows
  now, and only the shell's own draw moved: the inside froxel path is untouched.
- **Mars density altitude-zero OUT of scope** (own item, §8).
- **Not touched:** the daytime-stars inside-sky bug (known, separate).

## 3. Ground preparation

Sketch, verdicts and prep from the refactor-ground checkpoint
(`.superpowers/refactor-ground-2026-09-21-local-froxel.md`).

### 3.1 Ideal shape (data first)

```ts
// src/data/atmosphere/froxelVolume.ts
export const FROXEL_DIMS = { x: 32, y: 32, z: 64 } as const;   // texels
export const FROXEL_SLICE_KM = 4;                              // far bound = z * slice

// packAtmosphereUniforms.ts — the 176 B record gains ONE f32, no growth:
//   froxelSliceKm @ byte 108 (today's _pad0 between the ring ratios and invMvp)

// src/@types/engine/frame/RenderStepSpec.d.ts, FrameStep.d.ts
depth?: 'clear' | 'load' | { readonly sample: string };        // sample = source target id

// FRAME_ORDER
{ kind: 'compute', name: 'aerial-perspective' }                // after 'sky-view'
{ kind: 'render', target: 'foreground:0', slab: 'insideAtmosphere',
  depth: { sample: 'foreground:0' }, passes: ['aerial-perspective'], slot: 'AERIAL' }
{ kind: 'render', target: 'hdr', slab: NEAR0,
  depth: { sample: 'foreground:0' }, passes: ['orbit-trails'], slot: 'POST_FOREGROUND' }

// src/@types/rendering/AerialPerspectiveRenderer.d.ts
bake(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void; // prelude
draw(pass: GPURenderPassEncoder, bodyId: string, sampledDepth: GPUTextureView): void;

// src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl
struct OcclusionUniforms {
  count, pad×3, spheres[MAX_OCCLUDERS],
  invMvp: mat4x4<f32>, camPosLocal: vec3<f32>, localToKm: f32,   // the survivor row's frame
}
```

Growth after prep: one compute row, two `FRAME_ORDER` field edits, new files, one widened
union, one record field.

### 3.2 Tensions (greenfield vs incumbent)

1. Own `state.gpu` handle for the aerial renderer vs delegation through the shell renderer:
   **keep delegation** (the rebind-after-reconcile contract lives with the owner).
2. Dual-source blend vs two draws: **keep two draws** (§2).
3. `planetRadiusKm` carries two meanings, shell ground-hit radius (must stay the relief
   floor; Titan limb warning `atmosphereParams.ts:224-226`) and density profile zero
   (`scattering.wesl:167`, should be the datum). **Out**, own item (§8); un-braiding it is a
   second `ScatteringParams` field and three LUT bakes, 17 % on Mars, 5 % on Earth.

### 3.3 Missing joints

- **Bolt-on:** the sampled depth source is a per-pass hardcode (`aerialPerspectivePass.ts:38`,
  `contactShadowsPass.ts:38,55`); the trails would be the third. Blocker `executeFrame.ts:255`:
  the never-first guard keys on the step's own `target:slab` row, so an `hdr` step declaring
  `depth: 'sample'` is silently skipped. → **Prep 1.**
- **Bolt-on:** the apply rewrites the shell's per-body uniform buffer at draw time; a prelude
  reader would see the frame's LAST write (`docs/RENDERER.md:35`). → the bake owns the write
  (feature, §4.2).
- **Growth:** compute row (`CORE_COMPUTES`), storage-3D textures (precedent
  `galaxyField/gpu/bakeVolumeTexture.ts`), timing row (derived), trail clearance factor.
- **Not a joint:** `mesh-bodies` last is correct and required (`frameOrder.ts:207-212`).
- **Stale:** `camLocal`/`sunLocal` are already derived once (`atmosphereDrawList.ts`); the
  hoist item's atmosphere scope is deleted here.
- Depth holds only the LAST chain row (`renderTargets.ts:98-101`): the trails' depth test
  covers that row's terrain and meshes; the analytic spheres cover the rest.

### 3.4 Prep, packaging (user ruling 2026-09-21)

**Separate prep PR, off main:** prep 1, plus prep 4 if it turns out needed.
**Own commits at the head of this branch, before the feature commits:** prep 2 and 3 (they
touch spike-only code).

1. **Step-declared depth source.** `depth: { sample: TargetId }` replaces `'sample'` on
   `RenderStepSpec` and `FrameStep`; `expandFrameOrder` emits `{ sample: spec.target }` for
   a `DepthSampledPasses` marker. The executor attaches no depth for such a step, deletes
   the never-first guard, and hands the group `view.sampledDepth = { view, row }`: the
   source target's depth view and the `slab` of the row that last cleared it this frame, or
   `renderTargets.farDepthView()` (a 1×1 depth texture cleared once to the reversed-Z far
   value) with `row: null` when nothing cleared it. `checkFrameOrder` rejects a source that
   is not a declared depth-bearing row. `contactShadowsPass.enabled` adds
   `view.sampledDepth.row === its own slab` (today's guard, moved to its one consumer);
   `aerialPerspectivePass` and `contactShadowsPass` read `view.sampledDepth.view`.
   Pixel-identical.
2. **Depth-ray helpers to a lib module.** The spike's `aerialUnproject`, `aerialRayDir`,
   `aerialRayDistance`, `FAR_DEPTH` move to `shaders/lib/sceneDepthRay.wesl`, parameterised
   by inverse matrix and camera position (two consumers, §4.3). `lib/sceneDepth.wesl`'s
   header ("depth is the wrong signal for overlays") is reconciled: right for cross-row
   alpha, wrong as a blanket claim now that a declared step can sample it. Pixel-identical.
3. **Spike hygiene.** `AerialBundleResources` → `src/@types/rendering/`; delete
   `tools/perf/spikeMeasure.mts`.
4. **Conditional.** If the prelude cannot reach the inside row's `slab.vp` through the
   resolver the `insideAtmosphere` render line uses, memoise that slab per `ctx`.

Adjacent, not taken: `contactShadow/fragment.wesl`'s own NDC build could adopt prep 2's
helpers (different matrix; offer at the branch review).

## 4. Design

### 4.1 The volume

Texel `(x, y)` is a view ray through the screen-uv cell centre, unprojected with the same
helpers the apply uses (bit-identical `invMvp`, §4.2). Texel `z = i` holds the ray's
in-scatter and per-channel transmittance integrated from the camera to distance
`(i + 1) · FROXEL_SLICE_KM`; the identity `(0, 1)` at distance 0 is implicit, so a lookup
at distance `d` lerps between slices `floor(d / slice) − 1` and `floor(d / slice)`, clamped
to `[identity, last]`. The slice↔km mapping lives in ONE module,
`aerialPerspective/froxelSlices.wesl`, imported by bake and apply; slice count comes from
`textureDimensions`, slice size from `u.froxelSliceKm`, so no shader carries a literal.

**Bake** (`aerialPerspective/bake.wesl`, `@workgroup_size(8, 8, 1)`, one invocation per
ray): march the shared `scatterStep` integrand at `FROXEL_SLICE_KM / 4` (1 km) sub-steps,
writing each slice's running totals to the two `texture_storage_3d<rgba16float>` textures.
A ray that ends (atmosphere top, or the relief floor) inside the slices copies its exit
totals into the remaining ones; past the last slice the apply reads the outside shell's
per-pixel segment answer instead, so the volume never holds a column-dependent total.
Residual: the shell's own (in-scatter is the LUT's whole-ray answer, so high terrain far
out is over-fogged). Reads: the body's `ScatteringParams`,
`SkyViewParams` (twilight knobs), transmittance and multi-scatter LUTs, the uniform record.

**Apply** (`aerialPerspective/fragment.wesl`, spike file, geometry branch rewritten):
sky branch unchanged (`sampleShellRay`); geometry branch = `aerialRayDistance` → two
`textureSampleLevel` lookups (linear in xyz) → the same `transmit`/`emission` outputs the
spike's blend pair already consumes. Bindings drop the multi-scatter LUT, params and
sky-view params (the bake takes them) and gain the two volumes; the sampler is the shell's
`lutSamp`. Both entry points still evaluate `aerialSample`; at two reads it is not worth
un-braiding.

Resolution in screen-xy (32×32) is the one untested assumption: the z coordinate is the
pixel's own depth, so only the ray DIRECTION is quantised. Eye-check §6; the only knob is
`FROXEL_DIMS`.

### 4.2 Frame wiring

- `CORE_COMPUTES += aerialPerspectiveCompute` (`frame/computes/`), delegating to
  `frame/encodeAtmosphereAerialPerspective.ts`: for the first `atmosphereDrawList` entry
  with `inside`, resolve its slab, build the record with `atmosphereShellUniforms` (now
  carrying `froxelSliceKm`), open ONE compute pass (timing claimed lazily, as the sky-view
  bake does), `renderer.bake(pass, bodyId, uniforms)`. No inside entry ⇒ no pass, slot
  unwritten. The bake is the frame's ONLY write of that body's shell uniform buffer: the
  apply `draw` writes nothing, so the record the volume was baked from is the record the
  apply unprojects with. The outside path's draw-time write is untouched (exactly one path
  runs per body per frame).
- The apply line keeps its place (after the chain, before the composite) and declares
  `depth: { sample: 'foreground:0' }`. `aerialPerspectivePass.draw` calls
  `renderer.drawAerialPerspective(pass, bodyId, view.sampledDepth.view)`.
- Timing rows derive from `FRAME_ORDER` (`aerial-perspective-compute`), nothing hand-added.
- `AerialPerspectiveRenderer` owns the two volumes (allocated once, `FROXEL_DIMS`), the bake
  pipeline, per-body bake bind groups, and the apply bind groups; `rebind` re-takes a body's
  views after the shell's `reconcile`, as today.

### 4.3 Orbit trails: depth clearance

`OcclusionUniforms` grows by the survivor row's unprojection: `invMvp` (the inverse of that
row's `composeBodySlabMvp`, at the row's own radius scale), `camPosLocal` (the camera in
that local frame), `localToKm`. The trail pipeline binds `sceneDepth: texture_depth_2d`
beside it; the bind group is rebuilt when the depth view's identity changes (a `reconcile`
resize).

Fragment: the texel is `in.clip.xy` scaled by `textureDimensions(sceneDepth) / viewportPx`
(resolution-agnostic). `FAR_DEPTH` ⇒ factor 1. Otherwise
`sceneKm = aerialRayDistance(uv, depth) · localToKm`, `trailKm = length(x)` (the existing
eye-relative point), `clear *= smoothstep` over a relative tolerance around
`sceneKm − trailKm`. `localToKm == 0` is the no-frame sentinel (factor 1), the
`ringOuterRatio` data-gate style.

`frame/sceneDepthRow.ts` (memo per `ctx`) answers "which body row's depth survives": the
last foreground-chain row when it is a body row, else null. `orbitTrailsPass` packs the
three new fields from it (sentinel when null); the CPU/WGSL layout is pinned by
`orbitTrailConstants.parity.test.ts`. The analytic spheres stay multiplied in.

### 4.4 Uniform record

| bytes   | field           | note                                   |
| ------- | --------------- | -------------------------------------- |
| 108–111 | `froxelSliceKm` | was `_pad0`; f32; read by bake + apply |

Everything else in `packAtmosphereUniforms` is unchanged; the packer gains one parameter.

## 5. Deletions riding this spec's commit

- `docs/superpowers/specs/2026-09-14-atmosphere-froxel-aerial-perspective-design.md`,
  `docs/superpowers/plans/2026-09-14-atmosphere-froxel-aerial-perspective.md`.
- `docs/backlog/2026-09-18-orbit-trails-draw-through-terrain.md` + its index line.
- `2026-09-17-terrain-f3b-remaining-routing.md` item 2 (terrain under an atmosphere: this).
- `2026-09-17-mars-terrain-followups.md` shell bullet (shell ground-hit at the floor is
  correct; the density half becomes §8's item).
- `2026-08-20-hoist-solar-system-derivations.md`: the `atmosphereDrawList` bullet and the
  "Partial progress" atmosphere scope (both already memoised/hoisted); index line trimmed.

Riding the feature's landing: the spike's `marchAerial`, `AERIAL_STEPS`, the redeclared
`SkyViewParams`, `tools/perf/spikeMeasure.mts` (prep 3).

## 6. Verification

**Eye-checks (user, dev server, f.lux off):** Everest 07:43 UTC pose, phantom band gone
and no banding vs the spike capture (`everest-day-march.png` in the session scratchpad);
Dead Sea pose, trails hidden behind the hills; descent through 1.005, no pop; a Mars rover
site; outside the shell, unchanged.

**Perf (`perf` skill, `--url` on this worktree's port):** paired A/B OUTSIDE the shell,
expected neutral (a neutral-or-negative result halts landing). INSIDE: absolute numbers for
`aerial-perspective-compute` and `AERIAL`, reported, with the spike's 42–50 ms (dpr2, N=16)
as the before.

**Tests that can fail on a real bug:** `expandFrameOrder` (sample source emitted, prelude
index), `checkFrameOrder` (bad source rejected), `executeFrame` (placeholder when nothing
cleared; guard gone; `hdr` sampling step runs), `contactShadowsPass` (row check),
`packAtmosphereUniforms` (byte 108), `orbitTrailConstants.parity` (new offsets),
`orbitTrailRenderer` (depth binding), `sceneDepthRow`, `frameFilePurity` (new frame files),
`timedSlots` (derived compute row), `atmosphereShellRenderer` (bake writes the buffer,
draw does not).

## 7. New and changed artifacts

**New:** `src/data/atmosphere/froxelVolume.ts`, `frame/computes/aerialPerspectiveCompute.ts`,
`frame/encodeAtmosphereAerialPerspective.ts`, `frame/sceneDepthRow.ts`,
`src/@types/rendering/AerialBundleResources.d.ts` (prep 3),
`shaders/lib/sceneDepthRay.wesl` (prep 2), `shaders/atmosphere/aerialPerspective/froxelSlices.wesl`,
`shaders/atmosphere/aerialPerspective/bake.wesl`, `renderTargets.farDepthView()` (prep 1).

**Changed:** `RenderStepSpec`/`FrameStep`/`SlabView` (prep 1), `expandFrameOrder`,
`checkFrameOrder`, `executeFrame`, `aerialPerspectivePass`, `contactShadowsPass`,
`frameOrder.ts` (two field edits + the compute line), `computes/index.ts`,
`packAtmosphereUniforms`, `atmosphereShellUniforms`, `AerialPerspectiveRenderer` (+`bake`,
`draw` loses `uniforms`), `AtmosphereShellRenderer` (+`bakeAerialPerspective`, delegation),
`aerialPerspectiveRenderer`, `aerialPerspective/fragment.wesl`, `orbitTrail/fragment.wesl`,
`orbitTrailRenderer`, `orbitTrailsPass`, `sceneDepth.wesl` header, `docs/RENDERER.md`
(sampled-depth joint, one paragraph).

## 8. Out of scope, filed

`docs/backlog/2026-09-21-atmosphere-density-altitude-zero.md`: `planetRadiusKm` is both
the shell's ground-hit radius (relief floor, correct) and the density profile's zero
(should be the datum: Mars rows sit 2 km low, 17 % thin; Earth 5 %).
