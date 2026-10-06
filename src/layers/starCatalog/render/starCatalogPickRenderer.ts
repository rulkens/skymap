/**
 * starCatalogPickRenderer — the r32uint pick provider for the survey (Gaia bin)
 * stars, the pick twin of `starCatalogRenderer`.
 *
 * It draws the frame's GPU cut — the LEAF list only — into an already-begun
 * r32uint pick pass, where each fragment stamps the star's packed identity
 * (`(SOURCE_GAIA_STARS << 26) | recordIdx`, see `starCatalog/pickFragment.wesl`).
 * An aggregate glow stands in for a whole subtree and has no single star to
 * name. A leaf is on that list only while its fade is above zero and it is on
 * screen (grown by the pick floor — `starCullMargins`), so what clicks is what
 * the last frame drew.
 *
 * It shares the visual renderer's layouts, record blob and cut lists
 * (`pickResources`), and owns the one buffer it writes: its `StarUniforms`,
 * with `pickPass = 1`. A pick draw must never write the visual renderer's live
 * camera buffer — the queued writes would race at submit.
 *
 * Unlike the depthless additive visual pass, the pick pipeline is depth-tested
 * in the NEAR0 slab's convention so the vertex stage's pick depth bands order
 * a survey star against the other pickable rows.
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { StarCatalogPickRenderer } from '../@types/StarCatalogPickRenderer';
import type { StarCatalogPickResources } from '../@types/StarCatalogPickResources';
import type { StarCatalogPickDrawArgs } from '../@types/StarCatalogPickDrawArgs';
import vsCode from '../../../services/gpu/shaders/starCatalog/vertex.wesl?static';
import pickFsCode from '../../../services/gpu/shaders/starCatalog/pickFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { writeCameraPrefix } from '../../../services/gpu/lib/cameraUniforms';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import {
  STAR_UNIFORM_BYTES,
  SIZE_PX_FLOAT_INDEX,
  BRIGHTNESS_FLOAT_INDEX,
  GLOW_OVERLAP_FLOAT_INDEX,
  PICK_PASS_U32_INDEX,
} from './starCatalogLayout';

export function createStarCatalogPickRenderer(
  device: GPUDevice,
  resources: StarCatalogPickResources,
  /** The NEAR0 slab's depth convention (`SLAB_REVERSED_Z`). */
  reversedZ: boolean,
): StarCatalogPickRenderer {
  const { cameraBgl, drawBgl, recordsBgl } = resources;

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'starCatalogPick.vertex');
  const fsModule = createShaderModuleWithDevLog(device, pickFsCode, 'starCatalogPick.pickFragment');

  const pipeline = device.createRenderPipeline({
    label: 'star-catalog-pick-pipeline',
    layout: device.createPipelineLayout({
      label: 'star-catalog-pick-pipeline-layout',
      bindGroupLayouts: [cameraBgl, drawBgl, recordsBgl],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fsPick',
      // No blend: the last-written fragment's packed id wins.
      targets: [{ format: 'r32uint' }],
    },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: 'depth32float',
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  const uniformBuffer = device.createBuffer({
    label: 'star-catalog-pick-uniform',
    size: STAR_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBindGroup = device.createBindGroup({
    label: 'star-catalog-pick-uniform-bg',
    layout: cameraBgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  // Two typed views over ONE buffer: the struct mixes f32 with the u32
  // `pickPass`, which must be the integer 1, not a float's bit pattern.
  const uniformScratch = new ArrayBuffer(STAR_UNIFORM_BYTES);
  const uniformF32 = new Float32Array(uniformScratch);
  new Uint32Array(uniformScratch)[PICK_PASS_U32_INDEX] = 1;
  // The pick fragment ignores intensity; 1.0 keeps the shared vertex math finite.
  uniformF32[BRIGHTNESS_FLOAT_INDEX] = 1.0;
  uniformF32[GLOW_OVERLAP_FLOAT_INDEX] = 1.0;

  function draw(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs): void {
    const recordsBindGroup = resources.recordsBindGroup(args.source);
    const leaves = resources.leafDraw(args.source);
    if (recordsBindGroup === null || leaves === null) return;

    // Source-independent, so the repeated write per source is idempotent.
    writeCameraPrefix(uniformF32, args.vp, args.viewportPx, args.pxPerRad);
    uniformF32[SIZE_PX_FLOAT_INDEX] = args.sizePx;
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, leaves.bindGroup);
    pass.setBindGroup(2, recordsBindGroup);
    pass.drawIndirect(leaves.indirect, leaves.indirectOffset);
  }

  const renderer: StarCatalogPickRenderer = {
    label: 'starCatalogPickRenderer',
    draw,
    destroy: () => uniformBuffer.destroy(),
  };
  renderer satisfies Renderer;
  return renderer;
}
