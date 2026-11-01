/**
 * planetRenderer: flat-lit albedo planets in the opaque near-field foreground
 * target. The uploaded `uvSphereMesh` is NOT the surface: the vertex stage inflates
 * it into a shell circumscribing the body and the fragment recovers the analytic
 * sphere per pixel (`shaders/lib/analyticSphere.wesl`), as `texturedBodyRenderer`
 * and `bodyPickRenderer` do. The atmosphere shell rays against a perfectly round
 * ground radius, so a polygon inscribed 0.2-0.4% inside it leaves a limb sliver
 * neither rasterises; every body gets the ray test, textured or not.
 *
 * Shading: one lambert dot against the per-instance body-local sun direction plus
 * an ambient floor (`planet/fragment.wesl`, `lib/bodyLighting.wesl`). MVP, albedo,
 * sun and camera ride a per-instance vertex record. `planetsPass` calls `draw` once
 * per body-m slab row inside ONE submit, so each `hostId` gets its OWN instance
 * buffer; a shared one would let a later row's `writeBuffer` clobber an earlier.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PlanetRenderer } from '../@types/PlanetRenderer';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import { BODY_SPHERE_RINGS, BODY_SPHERE_SEGMENTS } from '../../../data/bodies/sphereTessellation';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import vsCode from '../../../services/gpu/shaders/bodies/planet/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/planet/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import type { PositionedId } from '../../../@types/scene/PositionedId';

/**
 * Float32 slots in the instance record: four `vec4` MVP columns, then `vec4`s of
 * albedo, sunDirLocal and camPosLocal (xyz + 1 pad each) = 28. `camPosLocal` is the
 * analytic sphere test's ray ORIGIN; the pipeline has no bind group, so it rides the
 * record.
 */
export const INSTANCE_FLOATS = 28;

/** Per-instance byte stride; a mismatch with the descriptor validate-errors or silently reads garbage. */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 112 bytes

/**
 * Per-instance attributes at `@location`s 1..7 (0 is the vertex position). Byte
 * offsets must match `planet/vertex.wesl` exactly. `camPosLocal` takes a whole
 * `vec4` slot: packing it into the free `.w` lanes would split it across two
 * attributes to save 16 bytes per body.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // mvp column 0
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // mvp column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // mvp column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // mvp column 3
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // albedo (rgb + pad)
  { shaderLocation: 6, offset: 80, format: 'float32x4' }, // sunDirLocal (xyz + pad)
  { shaderLocation: 7, offset: 96, format: 'float32x4' }, // camPosLocal (xyz + pad)
];

/** @param reversedZ this slab's depth convention (`SLAB_REVERSED_Z`), resolved by `resolveDepthCompare`. */
export function createPlanetRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): PlanetRenderer {
  const mesh = uvSphereMesh(BODY_SPHERE_SEGMENTS, BODY_SPHERE_RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'planet-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'planet-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'planet.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'planet.fragment');

  // No bind groups (every per-body value is a vertex attribute; ambient is a WESL
  // const). An explicit empty layout keeps this off the 'auto'-layout path.
  const pipeline = device.createRenderPipeline({
    label: 'planet-pipeline',
    layout: device.createPipelineLayout({
      label: 'planet-pipeline-layout',
      bindGroupLayouts: [],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position (per-vertex)
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
        {
          arrayStride: INSTANCE_STRIDE,
          stepMode: 'instance',
          // Spread: `@webgpu/types` declares the field mutable, the export is readonly.
          attributes: [...INSTANCE_ATTRIBUTES],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // matches uvSphereMesh winding
      // Keep the proxy's FAR hemisphere: front faces would vanish once the camera
      // crossed inside the 5% shell (a legal close approach) and take the body
      // with them; the far hemisphere still covers the disc from in there.
      cullMode: 'front',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // One fixed one-instance buffer per `hostId` (see the module header).
  const bodies = new Map<PositionedId, GPUBuffer>();

  function draw(pass: GPURenderPassEncoder, hostId: PositionedId, instance: Float32Array): void {
    let buffer = bodies.get(hostId);
    if (buffer === undefined) {
      buffer = device.createBuffer({
        label: `planet-instance-vbo-${hostId}`,
        size: INSTANCE_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      bodies.set(hostId, buffer);
    }

    device.queue.writeBuffer(buffer, 0, instance, 0, INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, buffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount, 1);
  }

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    for (const buffer of bodies.values()) buffer.destroy();
    bodies.clear();
  }

  const renderer: PlanetRenderer = {
    label: 'planetRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
