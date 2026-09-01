# Froxel aerial-perspective — ground exploration (2026-09-01)

Read-only recon for the FUTURE froxel spec (own PR off post-#631 main, per user packaging
ruling). Facts with citations, gathered by an Explore agent at branch HEAD ee5485a74; re-verify
line numbers when the spec is written.

## 1. Depth access

- `createRenderTargets` (`src/services/gpu/renderTargets.ts:265-406`) owns all targets via the
  `renderTargetRows` spec table (`:179-263`). Only `'foreground:0'` declares
  `depth: FOREGROUND_DEPTH_FORMAT` (`:229-234`; `'depth32float'`, `src/data/renderTargetFormats.ts:8`).
- Depth texture usage is `RENDER_ATTACHMENT` **only** (`renderTargets.ts:312-329`); comment at
  `:318-324` says nothing samples it downstream. Froxels need `TEXTURE_BINDING` added + that
  comment updated. Colour textures already carry `RENDER_ATTACHMENT | TEXTURE_BINDING` (`:307`).
- `depthViewOf(id)` (`:382-391`) is only consumed as a depth attachment (`executeFrame.ts:149`).
- NO pass samples depth anywhere (`texture_depth_2d` / `textureSampleCompare`: zero hits in src/).
  `lib/sceneDepth.wesl` deliberately reads the foreground COLOUR alpha instead (`:14,25`) because
  each painter-chain row CLEARS its own depth — the buffer only holds the LAST row's depth
  (`frameProgram.ts:97-100,172-174`, `executeFrame.ts:51-58`). Cross-row occlusion via depth is
  impossible today; a froxel apply keyed on sampled depth inherits that seam.
- Later-pass-samples-earlier-colour precedent: `createUpsampleLayer.ts:21-27`
  (`viewOf(row.sourceTargetId)` — volume/star-aggregates/mw-aggregate/zoa upsamplers).
- The atmosphere shell is a body-slab layer drawn INSIDE the same merged pass as the body's
  opaque draw (`executeFrame.ts:203-214` group matching), so same-pass depth sampling is out
  (WebGPU forbids sampling an attached depth view). Insertion seams: (i) a new step after the
  foregroundChain loop, before the foreground:0→hdr composite (`frameProgram.ts:176-179`), or
  (ii) pull the atmosphere draw out of the per-body-row group into its own later step.

## 2. Compute prelude / LUT precedent

- Prelude compute steps: `'flow'` then `'atmosphereSkyView'` (`frameProgram.ts:109-117`);
  dispatch table `executeFrame.ts:82-88`. A froxel bake = new prelude row + new COMPUTE entry.
- `encodeAtmosphereSkyView.ts:73-125`: walks `atmosphereDrawList`, reads `ctx.bodyPose(id)`,
  packs a 16-byte params record, calls `renderer.encodeSkyView(encoder, bodyId, …)`.
- Per-body `AtmosphereBundle` (`atmosphereShellRenderer.ts:79-94`) holds transmittance 256×64
  (bake-once), multiScatter 32×32 (bake-once), skyView 192×108 (per-frame); `createLut`
  (`:433-440`) = rgba16float, `STORAGE_BINDING | TEXTURE_BINDING`, 2D. Sky-view bake: one
  beginComputePass per body, 8×8 workgroups (`:612-630`). A froxel 3D LUT follows this shape
  with `dimension: '3d'`.
- 3D textures in src/ exist but only CPU-uploaded (`volumeFieldRenderer.ts:216-230`,
  `flowFieldFromCube.ts:24-40`). Compute-writes-3D precedent only in tools/galaxy-renderer
  (`bakeVolumeTexture.ts:27-68`, one-shot). No per-frame compute-into-texture_3d exists yet;
  the 2D sky-view bake is the closest live pattern.

## 3. Uniforms / camera

- Shell draw already reconstructs per-pixel rays from `invMvp` + `camPosLocal`
  (`shell/fragment.wesl:326-347`, homogeneous far-point form) — the froxel APPLY can reuse that.
- The BAKE would need a new uniform payload: `ctx.bodyPose(bodyId).basisM` is the camera basis
  already in body-local axes (`bodyRelativePose.ts:47-70`), plus `ctx.fovYRad`/`canvasSize` —
  all reachable at the `encodeAtmosphereSkyView` call site; nothing new to derive, only to pack.

## 4. Fragment-side 3D sampling precedent

- `scalarVolume/fragment.wesl:104,239-247`: live per-frame `texture_3d<f32>` sampling via
  `textureSampleLevel(..., 0.0)` — explicit-LOD required inside non-uniform raymarch loops.
  Same constraint will apply to the froxel apply if sampled in a loop (single lookup won't).

## Design notes carried from the T9 investigation (not explorer findings)

- The washout the froxels fix: sky-view LUT reused for ground-hitting rays over-hazes the
  down-view; exposure tuned for the from-space limb; 192×108 compresses the below-horizon
  hemisphere. See evidence artifact
  https://claude.ai/code/artifact/4e5fd214-9021-4948-b7a8-1c42f032b70c
- Hillaire reference: sky-view LUT for sky rays; froxel volume (camera-frustum-aligned 3D LUT,
  in-scatter + transmittance to each slice) for geometry rays, sampled at (uv, depth).
- Unproject landmine (learned twice on this branch): never divide by w near the reversed-Z far
  plane, never subtract near-equal unit-scale vectors — use the homogeneous far-point form.
