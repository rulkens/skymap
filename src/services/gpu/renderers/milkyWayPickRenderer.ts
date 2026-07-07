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
 * ### Why mirror structureMarkerRenderer.pickRing
 *
 * The MW pick is the sibling of the structure-ring pick path: a small
 * dedicated pipeline writing into the SAME pick texture the galaxy draws
 * use, sharing their depth attachment so a foreground galaxy still claims
 * the pixel.  The engine's pick pass calls `pickMilkyWay(pass)` after the
 * galaxy + structure + disk pick draws, reusing the caller's bound
 * `@group(0)` (the points pick uniform buffer).  The billboard's apparent
 * on-screen size is computed IN the vertex shader from those shared
 * camera uniforms — the same derivation galaxy points use — so this
 * renderer's own `@group(2)` uniform is fully static: world centre,
 * source code, and disc world radius, all written once at construction.
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

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { MilkyWayPickRenderer } from '../../../@types/rendering/MilkyWayPickRenderer';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import { Source } from '../../../data/sources';
import { MILKY_WAY_CENTER_WORLD } from '../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_RADIUS_MPC } from '../galaxy/milkyWayCalibration';
import vsCode from '../shaders/milkyWayPick/vertex.wesl?static';
import pickFsCode from '../shaders/milkyWayPick/pick.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/**
 * @group(2) MilkyWayPickUniforms — vec3 centreWorld (offset 0) + u32
 * sourceCode (offset 12) + f32 radiusMpc (offset 16) = 32 bytes (WGSL
 * pads the struct to a 16-byte multiple).  Every field is a physical
 * constant of the scene, written once at construction — the vertex
 * shader projects radiusMpc to apparent pixels itself from the shared
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
): MilkyWayPickRenderer {
  const device = ctx.device as GPUDevice | null;

  // GPU resources — null when device is null.
  let pickPipeline: GPURenderPipeline | null = null;
  let mwUniformBuffer: GPUBuffer | null = null;
  let mwBindGroup: GPUBindGroup | null = null;
  let dummyFadeBuffer: GPUBuffer | null = null;
  let dummyFadeBindGroup: GPUBindGroup | null = null;

  if (device) {
    // @group(0) CameraUniforms BGL — same single-uniform shape the points
    // pick pipeline declares.  pickMilkyWay reuses the caller's bound
    // group rather than building one of its own, so this BGL only has to
    // be layout-compatible with that group.
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
      // Shared depth state with the galaxy + structure pick draws so a
      // closer galaxy claims the pixel over the MW billboard.
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
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
    dummyFadeBuffer = device.createBuffer({
      label: 'milky-way-pick-fade-dummy',
      size: 16,
      usage: GPUBufferUsage.UNIFORM,
    });
    dummyFadeBindGroup = device.createBindGroup({
      label: 'milky-way-pick-fade-bg-dummy',
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: dummyFadeBuffer } }],
    });
  }

  function pickMilkyWay(pass: GPURenderPassEncoder): void {
    if (!device || !pickPipeline || !mwBindGroup || !dummyFadeBindGroup) return;
    // No uniform upload here — the @group(2) uniform is fully static
    // (written once at construction) and the apparent size is derived in
    // the vertex shader from the caller's @group(0) camera uniforms, so
    // the draw is pure command recording.
    pass.setPipeline(pickPipeline);
    // @group(0) is the pick pass's camera uniform group — the caller
    // re-binds it immediately before this call (ring / disk picks bind
    // their own smaller uniforms at slot 0, so inheriting the last-bound
    // group would read the wrong buffer); we bind only @group(1) (dummy
    // fade) + @group(2) (MW uniform).
    pass.setBindGroup(1, dummyFadeBindGroup);
    pass.setBindGroup(2, mwBindGroup);
    pass.draw(6, 1);
  }

  function destroy(): void {
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
