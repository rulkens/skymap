/**
 * FilamentRenderer — GPU pipeline for the cosmic-web filament skeleton
 * overlay.
 *
 * Strategy: instanced-quad line technique (see `shaders/filaments.wgsl`).
 * Each filament segment becomes one quad instance; the vertex shader
 * expands the unit-square UV into a thick screen-aligned segment between
 * the two endpoints.  This is necessary because native WebGPU line
 * topology is hardcoded to 1-pixel width.
 *
 * Buffers:
 *
 *   indexBuffer (static)        :  6 × uint16  → two-triangle quad
 *   quadVertexBuffer (static)   :  4 × vec2<f32> → corner UVs
 *   segmentInstanceBuffer       :  segmentCount × 8 × f32 → per-segment endpoints
 *   uniformBuffer               :  32 bytes (viewProj + viewport + halfWidth)
 *
 * Public API:
 *   - new FilamentRenderer(device, format)
 *   - upload(cloud: FilamentCloud)  → builds the instance buffer
 *   - draw(pass, viewProj, viewportPx, halfWidthPx)
 *   - clear()                       → drops the instance buffer
 *   - destroy()                     → releases all GPU resources
 */
import shaderSource from './shaders/filaments.wgsl?raw';
import type { FilamentCloud } from '../../@types/FilamentCloud';
import type { mat4 } from 'gl-matrix';

const FLOATS_PER_SEGMENT = 8; // startxyz + startD + endxyz + endD

// Uniform block layout (std140-ish, WGSL host-shareable):
//   viewProj    mat4   = 64 bytes
//   viewport    vec2   =  8 bytes
//   halfWidthPx f32    =  4 bytes
//   _pad        f32    =  4 bytes  (round to 16-byte alignment)
// Total: 80 bytes.  WebGPU rounds uniform-buffer sizes up to a multiple
// of 16, so 80 is already aligned — no extra padding needed.
const UNIFORM_BYTES = 80;

/**
 * Build a flat per-segment instance array from a `FilamentCloud`.  One
 * instance per consecutive (v_i, v_{i+1}) pair within each strip.
 *
 * Public so tests can exercise the layout without instantiating the
 * full GPU pipeline.
 */
export function buildSegmentInstances(cloud: FilamentCloud): {
  segmentCount: number;
  data: Float32Array;
} {
  // Total segment count = sum over strips of (verts - 1) = totalVerts - stripCount.
  const segmentCount = cloud.vertexCount - cloud.stripCount;
  if (segmentCount <= 0) {
    return { segmentCount: 0, data: new Float32Array(0) };
  }
  const data = new Float32Array(segmentCount * FLOATS_PER_SEGMENT);

  let outIdx = 0;
  for (let s = 0; s < cloud.stripCount; s++) {
    const lo = cloud.stripOffsets[s]!;
    const hi = cloud.stripOffsets[s + 1]!;
    for (let v = lo; v < hi - 1; v++) {
      const a = v * 4;
      const b = (v + 1) * 4;
      data[outIdx + 0] = cloud.vertices[a + 0]!;
      data[outIdx + 1] = cloud.vertices[a + 1]!;
      data[outIdx + 2] = cloud.vertices[a + 2]!;
      data[outIdx + 3] = cloud.vertices[a + 3]!;
      data[outIdx + 4] = cloud.vertices[b + 0]!;
      data[outIdx + 5] = cloud.vertices[b + 1]!;
      data[outIdx + 6] = cloud.vertices[b + 2]!;
      data[outIdx + 7] = cloud.vertices[b + 3]!;
      outIdx += FLOATS_PER_SEGMENT;
    }
  }
  return { segmentCount, data };
}

export class FilamentRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly bindGroup: GPUBindGroup;
  private readonly uniformBuffer: GPUBuffer;
  private readonly indexBuffer: GPUBuffer;
  private readonly quadVertexBuffer: GPUBuffer;
  private instanceBuffer: GPUBuffer | null = null;
  private segmentCount = 0;

  constructor(
    private readonly device: GPUDevice,
    /**
     * The colour-attachment format the pipeline writes into.  In skymap
     * this is the HDR offscreen target (`rgba16float`) — see
     * `src/services/gpu/hdrTarget.ts` and the rationale in
     * `renderFrame.ts`.  Filaments accumulate additively into the same
     * float buffer the points/quads/disks write, then the tone-map pass
     * compresses everything onto the swap chain.  Drawing direct to the
     * swap chain would clip on overlap — exactly the visual cosmic-web
     * scenes need to NOT do.
     */
    hdrFormat: GPUTextureFormat,
  ) {
    const module = device.createShaderModule({ code: shaderSource });

    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Static index buffer: two triangles forming the quad.
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    this.indexBuffer = device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);

    // Static quad-corner buffer: 4 vertices × vec2 = 32 bytes.
    const quadCorners = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    this.quadVertexBuffer = device.createBuffer({
      size: quadCorners.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.quadVertexBuffer, 0, quadCorners);

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          // Per-quad-vertex: uv vec2
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
          // Per-instance: startxyz + startDensity + endxyz + endDensity
          {
            arrayStride: FLOATS_PER_SEGMENT * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' }, // startPos
              { shaderLocation: 2, offset: 12, format: 'float32' },  // startDensity
              { shaderLocation: 3, offset: 16, format: 'float32x3' }, // endPos
              { shaderLocation: 4, offset: 28, format: 'float32' },  // endDensity
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: hdrFormat,
            // Additive blending — filaments glow over the existing scene
            // without occluding the point cloud below them.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
      // Note: the HDR pass in `renderFrame.ts` does NOT attach a depth
      // texture — points/quads/disks all skip depth.  Filaments follow
      // the same convention; if a future plan adds a depth attachment
      // to the HDR pass, mirror the points-pipeline's depthStencil
      // block here.
    });
  }

  /** Upload a new filament cloud, replacing any prior buffer. */
  upload(cloud: FilamentCloud): void {
    const { segmentCount, data } = buildSegmentInstances(cloud);
    this.segmentCount = segmentCount;
    if (segmentCount === 0) {
      this.instanceBuffer?.destroy();
      this.instanceBuffer = null;
      return;
    }
    this.instanceBuffer?.destroy();
    this.instanceBuffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  /** Drop the loaded filaments without destroying the pipeline itself. */
  clear(): void {
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.segmentCount = 0;
  }

  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    halfWidthPx: number,
  ): void {
    if (this.segmentCount === 0 || !this.instanceBuffer) return;

    // Pack uniforms.  See UNIFORM_BYTES comment above for the byte layout.
    //   f32[0..15]   viewProj (mat4)
    //   f32[16..17]  viewport (vec2)
    //   f32[18]      halfWidthPx
    //   f32[19]      padding (zero)
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    f32.set(viewProj as Float32Array, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[18] = halfWidthPx;
    f32[19] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, buf);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.setVertexBuffer(0, this.quadVertexBuffer);
    pass.setVertexBuffer(1, this.instanceBuffer);
    pass.drawIndexed(6, this.segmentCount);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.indexBuffer.destroy();
    this.quadVertexBuffer.destroy();
    this.instanceBuffer?.destroy();
  }
}
