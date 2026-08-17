/**
 * milkyWayPickRenderer — invisible, pick-only billboard that makes the
 * Milky Way clickable.
 *
 * The Milky Way is a first-class selectable source, but its visible form
 * is the star/dust point cloud (milkyWayCloudRenderer), which owns no
 * pick pipeline.  This renderer fills the gap: a single
 * screen-size-clamped billboard at the galactic centre that stamps the
 * MW identity into the r32uint pick texture.  It draws nothing visible.
 *
 * ### Why it OWNS its @group(0) pick camera (unlike the COSMO pickables)
 *
 * The MW layer projects through the NEAR0 slab, and it is the SOLE pickable
 * on that slab — so its pick pass has no earlier draw to inherit a camera
 * from.  The COSMO pickables (rings, disks) reuse the @group(0) the
 * point-sprites pick draw binds first in their shared pass; porting that
 * inherit pattern here would leave slot 0 unbound (a validation error that
 * can silently drop the whole pick submit).  So `pickMilkyWay` takes the
 * complete pick-uniform image as bytes — built by the layer via
 * `pickUniformBytesOf` against the NEAR0 slab view, the SAME packer the
 * points pick uses, so the byte layout has one home — uploads them to its
 * OWN buffer, and binds its own @group(0).  Self-binding also deletes the
 * hidden order coupling the inherit pattern carried.  The billboard's
 * apparent on-screen size is computed IN the vertex shader from those
 * camera uniforms — the same derivation galaxy points use — so this
 * renderer's `@group(2)` uniform is fully static: world centre, source
 * code, and disc world radius, all written once at construction.
 *
 * ### Pipeline layout (the 'auto'-layout trap)
 *
 * The pipeline uses an EXPLICIT layout `[cameraBgl, fadeBgl, mwBgl]` —
 * never `layout: 'auto'`.  Auto-derived bind-group layouts are
 * pipeline-specific identities, so a bind group built against one
 * pipeline is invalid on another (see `feedback_webgpu_auto_layout_trap`).
 * `@group(1)` lists the canonical shared `fadeBgl` so that whatever fade
 * bind group a prior pass left bound at slot 1 stays layout-compatible
 * when we `setPipeline`; this shader never reads fade, and we bind a
 * dummy zeroed group at draw time.
 *
 * ### CPU-only mode
 *
 * Constructed with a null device for unit tests.  Every GPU op is guarded
 * by `if (device)` and the public methods are no-ops, mirroring
 * structureMarkerRenderer's null-device pattern.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MilkyWayPickRenderer } from '../../../../@types/rendering/MilkyWayPickRenderer';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import { createDummyFadeBindGroup } from '../../lib/dummyFade';
import { Source } from '../../../../data/sources';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_RADIUS_MPC } from '../../../engine/galaxyGenerator/v1/milkyWayCalibration';
import { UNIFORM_BYTES } from '../galaxyCatalog/pointVertexLayout';
import vsCode from '../../shaders/milkyWay/pick/vertex.wesl?static';
import pickFsCode from '../../shaders/milkyWay/pick/pick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';

/**
 * @group(2) MilkyWayPickUniforms — vec3 centreWorld (offset 0) + u32
 * sourceCode (offset 12) + f32 radiusMpc (offset 16) = 32 bytes (WGSL
 * pads the struct to a 16-byte multiple).  Every field is a physical
 * constant of the scene, written once at construction — the vertex
 * shader projects radiusMpc to apparent pixels itself from the pick
 * camera uniforms at @group(0).
 */
const MW_PICK_UNIFORM_BYTES = 32;

/** Byte offset of the disc world-radius f32 in the @group(2) uniform. */
const MW_RADIUS_MPC_BYTE_OFFSET = 16;

export function createMilkyWayPickRenderer(
  ctx: GpuContext,
  /**
   * The shared `FadeUniformsBgl` other pick / HDR pipelines use at
   * `@group(1)`.  This shader DOES NOT read fade, but the slot must
   * appear in the pipeline layout AND match the BindGroupLayout of the
   * fade group a prior pass already bound at slot 1 in the same encoder.
   * Mirrors the `fadeBgl` arg on `createStructureMarkerRenderer`.
   */
  fadeBgl: FadeUniformsBgl,
  /**
   * Selects the NEAR0 slab's depth convention (single-sourced in
   * `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
   * `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
   */
  reversedZ: boolean,
): MilkyWayPickRenderer {
  const device = ctx.device as GPUDevice | null;

  // GPU resources — null when device is null.
  let pickPipeline: GPURenderPipeline | null = null;
  let cameraUniformBuffer: GPUBuffer | null = null;
  let cameraBindGroup: GPUBindGroup | null = null;
  let mwUniformBuffer: GPUBuffer | null = null;
  let mwBindGroup: GPUBindGroup | null = null;
  let dummyFadeBuffer: GPUBuffer | null = null;
  let dummyFadeBindGroup: GPUBindGroup | null = null;

  if (device) {
    // @group(0) CameraUniforms BGL — same single-uniform shape the points
    // pick pipeline declares.  Unlike the COSMO pickables this renderer
    // binds its OWN group against this BGL (see the module header): the MW
    // is alone in the NEAR0 pick pass, so there is no caller-bound slot 0
    // to inherit.
    const cameraBgl = device.createBindGroupLayout({
      label: 'milky-way-pick-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });
    // @group(2) MilkyWayPickUniforms BGL — read by the vertex stage.
    const mwBgl = device.createBindGroupLayout({
      label: 'milky-way-pick-source-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'milky-way-pick-pipeline-layout',
      bindGroupLayouts: [cameraBgl, fadeBgl, mwBgl],
    });

    // Separate GPUShaderModule per pipeline — the one-module-per-pipeline
    // convention that structurally sidesteps the 'auto'-layout trap (our
    // layout is explicit, but the convention keeps any future 'auto'
    // pipeline from inheriting a poisoned module).
    const vs = createShaderModuleWithDevLog(device, vsCode, 'milkyWayPick.vertex');
    const fs = createShaderModuleWithDevLog(device, pickFsCode, 'milkyWayPick.pick');

    pickPipeline = device.createRenderPipeline({
      label: 'milky-way-pick-pipeline',
      layout: pipelineLayout,
      // No vertex buffers — the six corners come from quadCorner(vi) and
      // the world centre + identity ride in the @group(2) uniform.
      vertex: { module: vs, entryPoint: 'vs' },
      fragment: {
        module: fs,
        entryPoint: 'fsPick',
        // r32uint pick texture; no blend (integer formats can't blend).
        targets: [{ format: 'r32uint' }],
      },
      primitive: { topology: 'triangle-list' },
      // depth32float matches the NEAR0 pick target's depth attachment
      // (NEAR0_DEPTH_FORMAT in pickProgram.ts — the pass this pipeline
      // draws in since the layer moved to the NEAR0 slab; a mismatched
      // format is a validation error). The MW is the pass's sole occupant
      // over a cleared-to-1.0 depth, so the test is near-vestigial here;
      // cross-slab occlusion is resolved by the pick program's CPU fold,
      // not this attachment.
      depthStencil: {
        format: 'depth32float',
        depthWriteEnabled: true,
        depthCompare: resolveDepthCompare('nearer', reversedZ),
      },
    });

    // The renderer's OWN @group(0) pick-camera buffer + bind group — the
    // self-bind seam (module header). Sized to the full points pick uniform
    // image (UNIFORM_BYTES from pointVertexLayout, the single layout truth):
    // the shader declares only a prefix of that struct, which WGSL permits,
    // and `pickUniformBytesOf` always packs the complete image. Built once;
    // `pickMilkyWay` re-uploads the bytes per pick and re-binds the same
    // group — the same own-buffer discipline the points pickRenderer uses.
    cameraUniformBuffer = device.createBuffer({
      label: 'milky-way-pick-camera',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    cameraBindGroup = device.createBindGroup({
      label: 'milky-way-pick-camera-bg',
      layout: cameraBgl,
      entries: [{ binding: 0, resource: { buffer: cameraUniformBuffer } }],
    });

    // @group(2) uniform — vec3 centre + u32 source code + f32 disc world
    // radius.  The whole struct is static scene data, so one write here
    // covers the buffer's entire lifetime (no COPY_DST traffic per pick).
    mwUniformBuffer = device.createBuffer({
      label: 'milky-way-pick-uniform',
      size: MW_PICK_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Float view for the vec3 centre at bytes 0..11 and radiusMpc at byte
    // 16 (= f32 index 4); u32 view for the source code at byte 12.  Bytes
    // 20..31 are WGSL struct padding, left zero.
    const scratch = new ArrayBuffer(MW_PICK_UNIFORM_BYTES);
    const f32 = new Float32Array(scratch);
    f32[0] = MILKY_WAY_CENTER_WORLD[0];
    f32[1] = MILKY_WAY_CENTER_WORLD[1];
    f32[2] = MILKY_WAY_CENTER_WORLD[2];
    new Uint32Array(scratch, 12, 1)[0] = Source.MilkyWay;
    f32[MW_RADIUS_MPC_BYTE_OFFSET / 4] = MILKY_WAY_RADIUS_MPC;
    device.queue.writeBuffer(mwUniformBuffer, 0, scratch);
    mwBindGroup = device.createBindGroup({
      label: 'milky-way-pick-source-bg',
      layout: mwBgl,
      entries: [{ binding: 0, resource: { buffer: mwUniformBuffer } }],
    });

    // 16-byte zeroed FadeUniforms — bound at @group(1) for layout
    // symmetry; the shader never reads it.  UNIFORM-only (no COPY_DST):
    // the default-zero contents are what we want.
    const dummyFade = createDummyFadeBindGroup(device, fadeBgl, 'milky-way-pick');
    dummyFadeBuffer = dummyFade.buffer;
    dummyFadeBindGroup = dummyFade.bindGroup;
  }

  function pickMilkyWay(pass: GPURenderPassEncoder, uniformBytes: ArrayBuffer): void {
    if (
      !device ||
      !pickPipeline ||
      !cameraUniformBuffer ||
      !cameraBindGroup ||
      !mwBindGroup ||
      !dummyFadeBindGroup
    ) {
      return;
    }
    // Upload the caller's complete pick-camera image VERBATIM to the
    // renderer's own buffer (byte-shaping has one home: pickUniformBytesOf)
    // and bind our own @group(0) — the MW is the sole draw in the NEAR0
    // pick pass, so there is no earlier-bound camera to inherit (module
    // header). @group(2) stays static (written once at construction); the
    // apparent size is derived in the vertex shader from these camera
    // uniforms.
    device.queue.writeBuffer(cameraUniformBuffer, 0, uniformBytes);
    pass.setPipeline(pickPipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, dummyFadeBindGroup);
    pass.setBindGroup(2, mwBindGroup);
    pass.draw(6, 1);
  }

  function destroy(): void {
    cameraUniformBuffer?.destroy();
    mwUniformBuffer?.destroy();
    dummyFadeBuffer?.destroy();
  }

  const renderer: MilkyWayPickRenderer = {
    label: 'milkyWayPickRenderer',
    pickMilkyWay,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
