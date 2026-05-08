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
 *
 * ### Factory shape (Spec F.1)
 *
 * Exposed as `createProceduralDiskRenderer(init): ProceduralDiskRenderer`
 * matching the already-factory `createPickRenderer` and the Spec D
 * subsystem factories.  Pre-factory shipped as `class
 * ProceduralDiskRenderer`; the conversion is mechanical — fields →
 * closure-captured `let`/`const`, methods → inline functions on the
 * returned object.  Public API is byte-identical, so the only
 * call-site change is `new ProceduralDiskRenderer(...)` →
 * `createProceduralDiskRenderer(...)`.
 */

import vsCode from '../shaders/proceduralDisks/vertex.wesl?static';
import fsCode from '../shaders/proceduralDisks/fragment.wesl?static';
import type { ProceduralDiskInstance } from '../../../@types/ProceduralDiskInstance';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

const STRIDE_FLOATS = 12; // 3 vec4<f32> per instance
const STRIDE_BYTES = STRIDE_FLOATS * 4;

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export type ProceduralDiskRenderer = {
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
  ): void;
  /** Release the uniform + per-instance vertex buffers. */
  destroy(): void;
};

export function createProceduralDiskRenderer(init: Init): ProceduralDiskRenderer {
  const { device, format } = init;

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'proceduralDisks.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'proceduralDisks.fragment');

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'proceduralDisks-bgl-uniforms',
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
  const uniformBuffer = device.createBuffer({
    label: 'proceduralDisks-uniform-buffer',
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'proceduralDisks-bg-uniforms',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'proceduralDisks-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    label: 'proceduralDisks-pipeline',
    layout: pipelineLayout,
    vertex: {
      module: vsModule,
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
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format,
          // Pure additive — galaxy procedural disks are EMISSIVE.
          // See `quadRenderer.ts` for the full rationale; siblings
          // in the layered render (quads, disks, this) all use
          // additive so they compose cleanly with each other and
          // with the Milky Way impostor underneath without any of
          // them "covering up" the others.
          blend: {
            color: {
              srcFactor: 'one',
              dstFactor: 'one',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Per-instance vertex buffer.  Lazily allocated on first draw with
  // capacity ≥ the requested instance count and grown on demand.  Held
  // as closure-captured `let` because the buffer identity changes when
  // we reallocate.
  let vertexBuffer: GPUBuffer | null = null;
  let vertexBufferCapacity = 0; // in instances

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: [number, number, number],
    pxPerRad: number,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Grow vertex buffer if needed.
    if (vertexBuffer === null || vertexBufferCapacity < instances.length) {
      vertexBuffer?.destroy();
      const cap = Math.max(instances.length, 64);
      vertexBuffer = device.createBuffer({
        label: 'proceduralDisks-vertex-buffer',
        size: cap * STRIDE_BYTES,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      vertexBufferCapacity = cap;
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
    device.queue.writeBuffer(vertexBuffer!, 0, packed);

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
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer!);
    pass.draw(6, instances.length);
  }

  function destroy(): void {
    uniformBuffer.destroy();
    vertexBuffer?.destroy();
    vertexBuffer = null;
  }

  return { draw, destroy };
}
