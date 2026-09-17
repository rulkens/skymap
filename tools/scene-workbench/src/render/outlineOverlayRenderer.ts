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
const FLOATS_PER_HANDLE = FLOATS_PER_POINT + 1; // corner, then its width in device px
/** CSS px, the unit `attachOutlineCornerControls`' hit radius is in. */
const HANDLE_CSS_PX = 8;

export type OutlineOverlayRenderer = {
  draw(
    pass: GPURenderPassEncoder,
    ringGroupM: readonly Vec3[],
    closed: boolean,
    devicePxPerCssPx: number,
  ): void;
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
  const position: GPUVertexAttribute = { shaderLocation: 0, offset: 0, format: 'float32x3' };

  const pipelineFor = (
    name: 'edge' | 'handle',
    topology: GPUPrimitiveTopology,
    buffer: GPUVertexBufferLayout,
  ): GPURenderPipeline =>
    device.createRenderPipeline({
      label: `scene-outline-overlay-${name}`,
      layout,
      vertex: {
        module,
        entryPoint: name === 'edge' ? 'vsEdge' : 'vsHandle',
        buffers: [buffer],
      },
      fragment: {
        module,
        entryPoint: name === 'edge' ? 'fsEdge' : 'fsHandle',
        targets: [{ format: targetFormat }],
      },
      primitive: { topology },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    });

  const edgePipeline = pipelineFor('edge', 'line-list', {
    arrayStride: FLOATS_PER_POINT * Float32Array.BYTES_PER_ELEMENT,
    stepMode: 'vertex',
    attributes: [position],
  });
  const handlePipeline = pipelineFor('handle', 'triangle-list', {
    arrayStride: FLOATS_PER_HANDLE * Float32Array.BYTES_PER_ELEMENT,
    stepMode: 'instance',
    attributes: [
      position,
      {
        shaderLocation: 1,
        offset: FLOATS_PER_POINT * Float32Array.BYTES_PER_ELEMENT,
        format: 'float32',
      },
    ],
  });

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
    draw(pass, ringGroupM, closed, devicePxPerCssPx): void {
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

      const handles = new Float32Array(n * FLOATS_PER_HANDLE);
      ringGroupM.forEach((cornerM, i) => {
        handles.set(cornerM, i * FLOATS_PER_HANDLE);
        handles[i * FLOATS_PER_HANDLE + FLOATS_PER_POINT] = HANDLE_CSS_PX * devicePxPerCssPx;
      });
      cornerBuffer = upload(cornerBuffer, handles, 'corners');
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
