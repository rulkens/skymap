/**
 * createOutlineOverlayRenderer — the draw-mode ring over the scene (outlineOverlay.wesl): a
 * line list of its edges, then one instanced handle per corner. Depth-tested 'always' and
 * never writing depth, so it must draw after every scene pass.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createShaderModuleWithDevLog } from '../../../../src/services/gpu/shaderCompileLogger';
import outlineOverlayWgsl from './shaders/outlineOverlay.wesl?static';

const VERTICES_PER_HANDLE = 6; // outlineOverlay.wesl's two-triangle quad
const FLOATS_PER_POINT = 3;

export type OutlineOverlayRenderer = {
  draw(pass: GPURenderPassEncoder, ringGroupM: readonly Vec3[], closed: boolean): void;
  dispose(): void;
};

export function createOutlineOverlayRenderer(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): OutlineOverlayRenderer {
  const { device } = gpu;
  const module = createShaderModuleWithDevLog(device, outlineOverlayWgsl, 'scene-outline-overlay');
  const layout = device.createPipelineLayout({
    label: 'scene-outline-overlay-layout',
    bindGroupLayouts: [cameraLayout],
  });

  const pipelineFor = (
    name: 'edge' | 'handle',
    stepMode: GPUVertexStepMode,
    topology: GPUPrimitiveTopology,
  ): GPURenderPipeline =>
    device.createRenderPipeline({
      label: `scene-outline-overlay-${name}`,
      layout,
      vertex: {
        module,
        entryPoint: name === 'edge' ? 'vsEdge' : 'vsHandle',
        buffers: [
          {
            arrayStride: FLOATS_PER_POINT * 4,
            stepMode,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: name === 'edge' ? 'fsEdge' : 'fsHandle',
        targets: [{ format: targetFormat }],
      },
      primitive: { topology },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    });

  const edgePipeline = pipelineFor('edge', 'vertex', 'line-list');
  const handlePipeline = pipelineFor('handle', 'instance', 'triangle-list');

  let edgeBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;

  const upload = (buffer: GPUBuffer | null, data: Float32Array, name: string): GPUBuffer => {
    if (buffer && buffer.size >= data.byteLength) {
      device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    }
    buffer?.destroy();
    const grown = device.createBuffer({
      label: `scene-outline-overlay-${name}`,
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(grown, 0, data);
    return grown;
  };

  return {
    draw(pass, ringGroupM, closed): void {
      const n = ringGroupM.length;
      if (n === 0) return;

      const edgeCount = closed ? n : n - 1;
      if (edgeCount > 0) {
        const edges = new Float32Array(edgeCount * 2 * FLOATS_PER_POINT);
        for (let e = 0; e < edgeCount; e++) {
          edges.set(ringGroupM[e]!, e * 2 * FLOATS_PER_POINT);
          edges.set(ringGroupM[(e + 1) % n]!, (e * 2 + 1) * FLOATS_PER_POINT);
        }
        edgeBuffer = upload(edgeBuffer, edges, 'edges');
        pass.setPipeline(edgePipeline);
        pass.setVertexBuffer(0, edgeBuffer);
        pass.draw(edgeCount * 2);
      }

      cornerBuffer = upload(cornerBuffer, new Float32Array(ringGroupM.flat()), 'corners');
      pass.setPipeline(handlePipeline);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.draw(VERTICES_PER_HANDLE, n);
    },
    dispose(): void {
      edgeBuffer?.destroy();
      cornerBuffer?.destroy();
    },
  };
}
