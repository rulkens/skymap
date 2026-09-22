/**
 * milkyWayPickRenderer — invisible, pick-only billboard that makes the
 * Milky Way clickable.
 *
 * The MW's visible form is the star/dust point cloud, which owns no pick
 * pipeline; this stamps its identity into the r32uint pick texture instead.
 * The two uniform images below must stay byte-exact with
 * `shaders/milkyWay/pick/io.wesl` — the renderer test pins both images.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MilkyWayPickRenderer } from '../../../../@types/rendering/MilkyWayPickRenderer';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { createDummyFadeBindGroup } from '../../lib/dummyFade';
import { Source } from '../../../../data/sources';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_PICK_MIN_SIZE_PX } from '../../../../data/milkyWay/milkyWayPickMinSizePx';
import { MILKY_WAY_RADIUS_MPC } from '../../../engine/galaxyGenerator/v1/milkyWayCalibration';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import vsCode from '../../shaders/milkyWay/pick/vertex.wesl?static';
import pickFsCode from '../../shaders/milkyWay/pick/pick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';

/**
 * @group(2) MilkyWayPickUniforms — vec3 centreWorld (0) + u32 sourceCode
 * (12) + f32 radiusMpc (16) + f32 minSizePx (20) = 32 bytes (WGSL pads
 * the struct to a 16-byte multiple).  Every field is a constant of the
 * scene, written once at construction — the vertex shader projects
 * radiusMpc to apparent pixels itself from @group(0).
 */
const MW_PICK_UNIFORM_BYTES = 32;

/**
 * @group(0) Uniforms — the shared CameraUniforms prefix (0..79) + vec3
 * camPosWorld (80) + f32 pxPerRad (92), packed per pick by `pickMilkyWay`.
 */
const MILKY_WAY_PICK_CAMERA_BYTES = 96;

/** Byte offset of the disc world-radius f32 in the @group(2) uniform. */
const MW_RADIUS_MPC_BYTE_OFFSET = 16;

/** Byte offset of the apparent-size floor f32 in the @group(2) uniform. */
const MW_MIN_SIZE_PX_BYTE_OFFSET = 20;

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
    // pick pipeline declares.
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

    // EXPLICIT layout, never `layout: 'auto'`: auto-derived BGLs are
    // pipeline-specific identities, so a bind group built against one pipeline
    // is invalid on another. @group(1) lists the canonical shared `fadeBgl` so
    // whatever fade group a prior pass left bound at slot 1 stays
    // layout-compatible through our `setPipeline`.
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
    // self-bind seam (module header). Built once; `pickMilkyWay` repacks and
    // re-uploads per pick and re-binds the same group — the same own-buffer
    // discipline the points galaxyPickRenderer uses.
    cameraUniformBuffer = device.createBuffer({
      label: 'milky-way-pick-camera',
      size: MILKY_WAY_PICK_CAMERA_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    cameraBindGroup = device.createBindGroup({
      label: 'milky-way-pick-camera-bg',
      layout: cameraBgl,
      entries: [{ binding: 0, resource: { buffer: cameraUniformBuffer } }],
    });

    // @group(2) uniform — vec3 centre + u32 source code + f32 disc world
    // radius + f32 size floor.  The whole struct is static scene data, so one
    // write here covers the buffer's entire lifetime (no per-pick traffic).
    mwUniformBuffer = device.createBuffer({
      label: 'milky-way-pick-uniform',
      size: MW_PICK_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Float view for the vec3 centre at bytes 0..11 and the two f32s at 16
    // and 20; u32 view for the source code at byte 12.  Bytes 24..31 are
    // WGSL struct padding, left zero.
    const scratch = new ArrayBuffer(MW_PICK_UNIFORM_BYTES);
    const f32 = new Float32Array(scratch);
    f32[0] = MILKY_WAY_CENTER_WORLD[0];
    f32[1] = MILKY_WAY_CENTER_WORLD[1];
    f32[2] = MILKY_WAY_CENTER_WORLD[2];
    new Uint32Array(scratch, 12, 1)[0] = Source.MilkyWay;
    f32[MW_RADIUS_MPC_BYTE_OFFSET / 4] = MILKY_WAY_RADIUS_MPC;
    f32[MW_MIN_SIZE_PX_BYTE_OFFSET / 4] = MILKY_WAY_PICK_MIN_SIZE_PX;
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

  function pickMilkyWay(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportPx: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
  ): void {
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
    // Pack the 96-byte @group(0) image into our own buffer and bind it
    // ourselves: the shared prefix at floats 0..18 (the pad stays zero via
    // Float32Array zero-init), then the two sizing facts at 20..23.
    // @group(2) stays static; the apparent size is derived in the vertex
    // shader from these camera uniforms.
    const uni = new Float32Array(MILKY_WAY_PICK_CAMERA_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportPx, pxPerRad);
    uni[CAMERA_UNIFORM_BYTES / 4] = camPosWorld[0];
    uni[CAMERA_UNIFORM_BYTES / 4 + 1] = camPosWorld[1];
    uni[CAMERA_UNIFORM_BYTES / 4 + 2] = camPosWorld[2];
    uni[CAMERA_UNIFORM_BYTES / 4 + 3] = pxPerRad;
    device.queue.writeBuffer(cameraUniformBuffer, 0, uni);
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
