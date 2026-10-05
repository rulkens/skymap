/**
 * terrainPickMarkerRenderer — the terrain-pick debug marker: one screen-facing
 * proxy quad, one ray-traced sphere, one analytic `frag_depth` against the SAME
 * depth attachment and convention the surface tiles use. TWO draws of it — a
 * dim depth-blind underlay, then the depth-tested marker over it — so the part
 * the terrain hides stays visible AS hidden and the buried fraction is the
 * measurement. Depth intent is `'nearer'`, not the tiles' `'nearer-or-equal'`:
 * a tie belongs to the terrain, or a marker exactly on the surface would hide
 * the seam.
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

  const layout = device.createPipelineLayout({
    label: 'terrain-pick-marker-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });
  const vertexModule = createShaderModuleWithDevLog(device, vsCode, 'terrainPickMarker.vertex');
  const fragmentModule = createShaderModuleWithDevLog(device, fsCode, 'terrainPickMarker.fragment');

  /** The two draws differ only in fragment entry point and depth state. */
  function markerPipeline(
    label: string,
    entryPoint: string,
    depthStencil: GPUDepthStencilState,
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout,
      vertex: { module: vertexModule, entryPoint: 'vs' },
      fragment: {
        module: fragmentModule,
        entryPoint,
        targets: [{ format: targetFormat }], // opaque replace, alpha=1
      },
      // No culling: the quad is built about the camera axes, so its winding
      // depends on which way those axes happen to face.
      primitive: { topology: 'triangle-strip', cullMode: 'none' },
      depthStencil,
    });
  }

  // `'always'` rather than a `resolveDepthCompare` intent because there is no
  // near/far direction to get wrong: this draw deliberately ignores depth, and
  // writes none, so it disturbs nothing drawn after it. It lays the WHOLE
  // silhouette down dim; the pass below then covers the visible part, leaving
  // the dim residue equal to what the terrain buries.
  const occludedPipeline = markerPipeline('terrain-pick-marker-occluded-pipeline', 'fsOccluded', {
    format: depthFormat,
    depthWriteEnabled: false,
    depthCompare: 'always',
  });
  const pipeline = markerPipeline('terrain-pick-marker-pipeline', 'fs', {
    format: depthFormat,
    depthWriteEnabled: true,
    depthCompare: resolveDepthCompare('nearer', reversedZ),
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

      pass.setBindGroup(0, bindGroup);
      // Underlay first: the depth-tested draw has to land ON TOP of it.
      pass.setPipeline(occludedPipeline);
      pass.draw(QUAD_VERTEX_COUNT, 1, 0, 0);
      pass.setPipeline(pipeline);
      pass.draw(QUAD_VERTEX_COUNT, 1, 0, 0);
    },

    destroy(): void {
      uniformBuffer.destroy();
    },
  };
  renderer satisfies Renderer;
  return renderer;
}
