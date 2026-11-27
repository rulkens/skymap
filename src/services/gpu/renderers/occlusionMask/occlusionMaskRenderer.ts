/**
 * occlusionMaskRenderer — a covering triangle that turns the overlay joint
 * (`occlusionCoverageGroup`, the shader's group(1)) into one (coverage, distance km)
 * texel per pixel (`shaders/occlusionMask`). Group 0 is empty: the shader owns no
 * bindings of its own. The depth frame is a uniform written per draw, which is safe
 * only because each view that draws this has its own submit (`renderFrame`).
 */

import type { OcclusionMaskRenderer } from '../../../../@types/rendering/OcclusionMaskRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import vsCode from '../../shaders/occlusionMask/vertex.wesl?static';
import fsCode from '../../shaders/occlusionMask/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../../../packages/shared/src/services/gpu/shaderCompileLogger';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  createOcclusionCoverageBindGroup,
  createOcclusionDepthFrameBuffer,
  writeOcclusionDepthFrame,
} from '../labels/occlusionCoverageGroup';

export function createOcclusionMaskRenderer(init: {
  readonly device: GPUDevice;
  readonly targetFormat: GPUTextureFormat;
}): OcclusionMaskRenderer {
  const { device, targetFormat } = init;

  const emptyLayout = device.createBindGroupLayout({ label: 'occlusionMask-bgl', entries: [] });
  // A pipeline layout's every group must be bound, the empty one included.
  const emptyGroup = device.createBindGroup({
    label: 'occlusionMask-bg',
    layout: emptyLayout,
    entries: [],
  });
  const coverageLayout = device.createBindGroupLayout(OCCLUSION_COVERAGE_LAYOUT_DESC);
  const depthFrameBuffer = createOcclusionDepthFrameBuffer(device, 'occlusionMask-depth-frame');

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'occlusionMask.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'occlusionMask.fragment');
  const pipeline = device.createRenderPipeline({
    label: 'occlusionMask-pipeline',
    layout: device.createPipelineLayout({
      label: 'occlusionMask-pipeline-layout',
      bindGroupLayouts: [emptyLayout, coverageLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    // No blend (a 32-bit float target has none) and no depth: every texel is replaced.
    fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: targetFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const draw: OcclusionMaskRenderer['draw'] = (pass, scene, viewportPx) => {
    writeOcclusionDepthFrame(device, depthFrameBuffer, scene.frame, viewportPx);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, emptyGroup);
    // Rebuilt per draw: `reconcile()` replaces the views it wraps.
    pass.setBindGroup(
      OCCLUSION_COVERAGE_GROUP_INDEX,
      createOcclusionCoverageBindGroup(device, coverageLayout, scene, depthFrameBuffer),
    );
    pass.draw(3);
  };

  function destroy(): void {
    depthFrameBuffer.destroy();
  }

  const renderer: OcclusionMaskRenderer = { label: 'occlusionMaskRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
