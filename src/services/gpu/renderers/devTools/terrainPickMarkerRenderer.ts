/**
 * terrainPickMarkerRenderer — the terrain-pick debug marker: one screen-facing
 * proxy quad, one ray-traced sphere, one analytic `frag_depth` written against
 * the SAME depth attachment and convention the surface tiles use, so the
 * terrain occludes the marker and the intersection silhouette is the reading.
 * Depth intent is `'nearer'`, not the tiles' `'nearer-or-equal'`: a tie belongs
 * to the terrain, or a marker exactly on the surface would hide the seam.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { TerrainPickMarkerRenderer } from '../../../../@types/rendering/TerrainPickMarkerRenderer';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/devTools/terrainPickMarker/vertex.wesl?static';
import fsCode from '../../shaders/devTools/terrainPickMarker/fragment.wesl?static';

/** The one matching statement of `terrainPickMarker/io.wesl`'s byte layout. */
const UNIFORM_BYTES = 112;
const F32_VP = 0;
const F32_CENTRE_REL_EYE_M = 16;
const F32_RADIUS_M = 19;
const F32_CAM_RIGHT = 20;
const F32_CAM_UP = 24;

/** Strip corners; the geometry is derived from `vertex_index`, no buffers. */
const QUAD_VERTEX_COUNT = 4;

/**
 * @param reversedZ this slab's depth convention, resolved through
 *   `resolveDepthCompare` — never a hardcoded `'greater'` (see that file).
 */
export function createTerrainPickMarkerRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): TerrainPickMarkerRenderer {
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'terrain-pick-marker-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'terrain-pick-marker-pipeline',
    layout: device.createPipelineLayout({
      label: 'terrain-pick-marker-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: createShaderModuleWithDevLog(device, vsCode, 'terrainPickMarker.vertex'),
      entryPoint: 'vs',
    },
    fragment: {
      module: createShaderModuleWithDevLog(device, fsCode, 'terrainPickMarker.fragment'),
      entryPoint: 'fs',
      targets: [{ format: targetFormat }], // opaque replace, alpha=1
    },
    // No culling: the quad is built about the camera axes, so its winding
    // depends on which way those axes happen to face.
    primitive: { topology: 'triangle-strip', cullMode: 'none' },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  const uniformBuffer = device.createBuffer({
    label: 'terrain-pick-marker-uniforms',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(UNIFORM_BYTES / 4);

  const bindGroup = device.createBindGroup({
    label: 'terrain-pick-marker-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const renderer: TerrainPickMarkerRenderer = {
    label: 'terrainPickMarkerRenderer',

    draw(pass, args) {
      uniformScratch.set(args.vp, F32_VP);
      uniformScratch.set(args.centreRelEyeM, F32_CENTRE_REL_EYE_M);
      uniformScratch[F32_RADIUS_M] = args.radiusM;
      uniformScratch.set(args.camRight, F32_CAM_RIGHT);
      uniformScratch.set(args.camUp, F32_CAM_UP);
      device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(QUAD_VERTEX_COUNT, 1, 0, 0);
    },

    destroy(): void {
      uniformBuffer.destroy();
    },
  };
  renderer satisfies Renderer;
  return renderer;
}
