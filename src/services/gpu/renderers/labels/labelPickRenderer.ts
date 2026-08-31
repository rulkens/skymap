/**
 * labelPickRenderer — the r32uint pick provider for rendered text labels: one
 * instanced screen-space rectangle per legible label, stamping the label
 * subject's packed identity so clicking a name selects the thing it names.
 *
 * Records into an ALREADY-BEGUN pick pass owned by the pick program and owns
 * no pass, texture, or readback — the same shape as `bodyPickRenderer`. Draws
 * at most once per slab per frame, so unlike that renderer it needs no
 * per-pass slot cursor.
 */

import type { LabelPickQuad } from '../../../../@types/rendering/LabelPickQuad';
import type { LabelPickRenderer } from '../../../../@types/rendering/LabelPickRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import pickCode from '../../shaders/labels/pick.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/** `LabelPickUniforms` (pick.wesl): vec2<f32> viewportPx + 2 pad f32. */
const UNIFORM_BYTES = 16;

/** Per-instance stride: rectPx (float32x4, 16) + packedId (u32, 4). */
const INSTANCE_STRIDE = 20;
/** Word count per instance (4 f32 + 1 u32). */
const INSTANCE_WORDS = 5;

/**
 * @param depthFormat the pick target's depth attachment format for this slab
 *   (`depth24plus` on COSMO, `depth32float` on NEAR0) — a pipeline in a pass
 *   with a depth attachment must declare the matching format.
 * @param reversedZ the slab's depth convention (`SLAB_REVERSED_Z`). It selects
 *   BOTH the compare direction and the shader's forced-depth entry point, so
 *   the band and the test can never end up pointing at opposite ends.
 */
export function createLabelPickRenderer(
  device: GPUDevice,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): LabelPickRenderer {
  const uniformBuffer = device.createBuffer({
    label: 'label-pick-uniform',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new Float32Array(UNIFORM_BYTES / 4);

  const bgl = device.createBindGroupLayout({
    label: 'label-pick-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });
  const bindGroup = device.createBindGroup({
    label: 'label-pick-bg',
    layout: bgl,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const module = createShaderModuleWithDevLog(device, pickCode, 'labelPick.pick');
  const pipeline = device.createRenderPipeline({
    label: 'label-pick-pipeline',
    layout: device.createPipelineLayout({
      label: 'label-pick-pipeline-layout',
      bindGroupLayouts: [bgl],
    }),
    vertex: {
      module,
      entryPoint: reversedZ ? 'vsReversed' : 'vs',
      buffers: [
        {
          arrayStride: INSTANCE_STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' }, // rectPx
            { shaderLocation: 1, offset: 16, format: 'uint32' }, // packedId
          ],
        },
      ],
    },
    // r32uint: integer formats cannot blend; the depth band resolves overlaps.
    fragment: { module, entryPoint: 'fsPick', targets: [{ format: 'r32uint' }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: {
      format: depthFormat,
      // Writing depth is what makes the label's priority independent of where
      // its layer sits in the registry: a geometry row recorded AFTER this one
      // still loses the pixel to the band already stamped there.
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  let instanceBuffer: GPUBuffer | null = null;
  let byteCapacity = 0;

  function draw(
    pass: GPURenderPassEncoder,
    quads: readonly LabelPickQuad[],
    viewportPx: Vec2,
  ): void {
    const n = quads.length;
    if (n === 0) return;

    uniformScratch[0] = viewportPx[0];
    uniformScratch[1] = viewportPx[1];
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    const interleaved = new ArrayBuffer(n * INSTANCE_STRIDE);
    const f32 = new Float32Array(interleaved);
    const u32 = new Uint32Array(interleaved);
    for (let i = 0; i < n; i++) {
      const q = quads[i]!;
      const base = i * INSTANCE_WORDS;
      f32[base + 0] = q.rect.x0;
      f32[base + 1] = q.rect.y0;
      f32[base + 2] = q.rect.x1;
      f32[base + 3] = q.rect.y1;
      u32[base + 4] = q.packedId >>> 0;
    }

    const requiredBytes = n * INSTANCE_STRIDE;
    if (instanceBuffer === null || requiredBytes > byteCapacity) {
      instanceBuffer?.destroy();
      byteCapacity = requiredBytes;
      instanceBuffer = device.createBuffer({
        label: 'label-pick-instance-vbo',
        size: byteCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    device.queue.writeBuffer(instanceBuffer, 0, interleaved);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, instanceBuffer);
    // Six vertices per quad (lib/billboard's quadCorner triangle list).
    pass.draw(6, n);
  }

  function destroy(): void {
    uniformBuffer.destroy();
    instanceBuffer?.destroy();
    instanceBuffer = null;
    byteCapacity = 0;
  }

  const renderer: LabelPickRenderer = { label: 'labelPickRenderer', draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
