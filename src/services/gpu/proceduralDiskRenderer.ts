/**
 * proceduralDiskRenderer — 3D-oriented procedural galaxy impostors.
 *
 * Sibling to diskRenderer (texture-based) and quadRenderer (screen-
 * aligned + texture-based).  Activates for galaxies in the apparent-
 * size band 8..∞ px, with a crossfade against the points pass across
 * 8..14 px.  See `docs/superpowers/plans/2026-05-04-procedural-disk-
 * impostor.md` for the full design rationale.
 *
 * The shader (proceduralDisks.wgsl) is documented in detail; this file
 * is just the JS-side pipeline wiring.
 */

import wgsl from './shaders/proceduralDisks.wgsl?raw';
import type { ProceduralDiskInstance } from '../../@types/ProceduralDiskInstance';

const STRIDE_FLOATS = 12; // 3 vec4<f32> per instance
const STRIDE_BYTES = STRIDE_FLOATS * 4;

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export class ProceduralDiskRenderer {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferCapacity = 0; // in instances

  constructor(init: Init) {
    const { device, format } = init;
    this.device = device;

    const module = device.createShaderModule({ code: wgsl });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Uniform layout matches diskRenderer / quadRenderer (mat4 + vec2 +
    // 2 padding f32 + vec3 + f32) — 96 bytes.
    this.uniformBuffer = device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' }, // posSize
              { shaderLocation: 1, offset: 16, format: 'float32x4' }, // orientation
              { shaderLocation: 2, offset: 32, format: 'float32x4' }, // extras
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied additive — same as the textured-disk path
            // so the two pipelines compose cleanly when both are drawing
            // (e.g. inside the 8-14 px crossfade band where points fade
            // out, here, but the textured-disk pass would only fire
            // above 24 px).
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  /**
   * Issue one draw call for the given list of instances.  Packs the
   * instance data into the GPU vertex buffer (re-allocating if it grew),
   * writes the uniform buffer, and emits `draw(6, instances.length)`.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: [number, number, number],
    pxPerRad: number,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Grow vertex buffer if needed.
    if (this.vertexBuffer === null || this.vertexBufferCapacity < instances.length) {
      this.vertexBuffer?.destroy();
      const cap = Math.max(instances.length, 64);
      this.vertexBuffer = this.device.createBuffer({
        size: cap * STRIDE_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.vertexBufferCapacity = cap;
    }

    // Pack instances.  Same memory layout as diskRenderer (3 vec4<f32>),
    // minus the UV rect — those four floats become (colourIndex,
    // crossfadeAlpha, _, _) instead.
    const packed = new Float32Array(instances.length * STRIDE_FLOATS);
    for (let i = 0; i < instances.length; i++) {
      const o = i * STRIDE_FLOATS;
      const ins = instances[i]!;
      packed[o + 0] = ins.x;
      packed[o + 1] = ins.y;
      packed[o + 2] = ins.z;
      packed[o + 3] = ins.sizeWorldMpc;
      packed[o + 4] = ins.axisRatio;
      packed[o + 5] = ins.positionAngleDeg;
      packed[o + 6] = 0;
      packed[o + 7] = 0;
      packed[o + 8] = ins.colourIndex;
      packed[o + 9] = ins.crossfadeAlpha;
      packed[o + 10] = 0;
      packed[o + 11] = 0;
    }
    this.device.queue.writeBuffer(this.vertexBuffer!, 0, packed);

    // Pack uniforms (mat4 + vec2 + 2*f32 + vec3 + f32 = 96 bytes).
    const uniforms = new ArrayBuffer(96);
    const u32f = new Float32Array(uniforms);
    u32f.set(viewProj, 0); // 0..63
    u32f[16] = viewport[0]; // 64..67
    u32f[17] = viewport[1]; // 68..71
    // 72..79 padding
    u32f[20] = camPosWorld[0]; // 80..83
    u32f[21] = camPosWorld[1]; // 84..87
    u32f[22] = camPosWorld[2]; // 88..91
    u32f[23] = pxPerRad; // 92..95
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer!);
    pass.draw(6, instances.length);
  }

  destroy(): void {
    this.uniformBuffer.destroy();
    this.vertexBuffer?.destroy();
    this.vertexBuffer = null;
  }
}
