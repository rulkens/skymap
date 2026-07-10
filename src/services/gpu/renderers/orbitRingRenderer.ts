/**
 * orbitRingRenderer — the debug orbit rings as analytic SDF annuli, drawn
 * additively into the depthless HDR accumulation with ONE instanced draw.
 *
 * Structural twin of `planetRenderer` on the instancing side (per-instance
 * MVP columns + colour, one `writeBuffer` + one draw, no bind group) crossed
 * with `starPointRenderer` on the pipeline profile (the caller's rgba16float
 * `hdr` target, one/one additive blend, NO depthStencil — the hdr row has no
 * depth attachment, and declaring a depth format for a depthless pass is a
 * validation error).
 *
 * ### Why an SDF quad, not line geometry
 *
 * The rings span 12+ orders of magnitude of zoom (a lunar orbit at ~1e-14 Mpc
 * radius up to Jupiter's ~2.5e-11, viewed from metres to megaparsecs). Line
 * geometry would need per-zoom tessellation LOD to stay smooth AND a
 * screen-space width recomputation to stay visible. A single quad whose
 * fragment evaluates the analytic circle SDF gets both for free: the fragment
 * derivative (`fwidth`) measures how fast the local coordinate changes per
 * PIXEL, so thresholding the distance field against it yields a constant
 * ~1.5 px stroke at any scale — no vertices to re-tessellate, ever. See
 * `orbitRing/fragment.wesl`.
 *
 * ### Geometry — a quad slightly larger than the unit circle
 *
 * Four vertices at local xy = ±1.1, z = 0, two triangles. The 1.1 margin
 * leaves the SDF's anti-aliased falloff room OUTSIDE the unit circle — a
 * quad cut exactly at ±1.0 would clip the outer half of the smoothstep edge
 * on the ring's outermost points. `cullMode: 'none'` because an orbital
 * plane is viewed from both sides.
 *
 * ### Why GPU instancing — one write + one draw for N rings
 *
 * Same rationale as `planetRenderer` (see its header for the rejected
 * alternatives): each ring's MVP + colour rides in a per-instance vertex
 * record stepped by `@builtin(instance_index)`, so every instance reads its
 * OWN baked record and no mid-frame uniform exists for a later write to
 * clobber (the writeBuffer-vs-submit landmine). One `writeBuffer`, one
 * `drawIndexed`, no bind group at all.
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { OrbitRingRenderer } from '../../../@types/rendering/OrbitRingRenderer';
import vsCode from '../shaders/orbitRing/vertex.wesl?static';
import fsCode from '../shaders/orbitRing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** Upper bound on rings drawn per frame. Three orbits ship today (Earth,
 *  Jupiter, Moon); the cap sizes the instance buffer with headroom. */
export const MAX_ORBITS = 8;

/**
 * Float32 slots per per-instance record: four `vec4<f32>` MVP columns (16) +
 * one `vec4<f32>` colour (rgb + 1 pad float, 4) = 20. The caller writes each
 * ring's record at `i * INSTANCE_FLOATS`, and `draw` uploads `count` records
 * in one `writeBuffer`. Identical layout to `planetRenderer`'s.
 */
export const INSTANCE_FLOATS = 20;

/**
 * Per-instance byte stride: 20 × 4 = 80. Declared here AND in the pipeline's
 * instance-buffer descriptor; a mismatch either validate-errors or silently
 * reads garbage.
 */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 80 bytes

/**
 * Per-instance vertex attributes — the four MVP columns (reassembled into a
 * `mat4x4<f32>` in the shader) followed by the colour, at `@location`s 1..5
 * (location 0 is the per-vertex quad corner). Byte offsets must match
 * `orbitRing/vertex.wesl` exactly.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // mvp column 0
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // mvp column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // mvp column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // mvp column 3
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // color (rgb + pad)
];

export function createOrbitRingRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): OrbitRingRenderer {
  // ── Geometry upload — one quad, local xy in [-1.1, 1.1], z = 0 ────────────
  //
  // The 1.1 margin gives the SDF's anti-aliased edge room outside the unit
  // circle (see the module header). Two CCW triangles over four vertices.
  const QUAD_EXTENT = 1.1;
  const positions = new Float32Array([
    -QUAD_EXTENT,
    -QUAD_EXTENT,
    0,
    QUAD_EXTENT,
    -QUAD_EXTENT,
    0,
    QUAD_EXTENT,
    QUAD_EXTENT,
    0,
    -QUAD_EXTENT,
    QUAD_EXTENT,
    0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const indexCount = indices.length;

  const positionBuffer = device.createBuffer({
    label: 'orbit-ring-position-vbo',
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, positions);

  const indexBuffer = device.createBuffer({
    label: 'orbit-ring-index-ibo',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // ── Instance vertex buffer ────────────────────────────────────────────────
  //
  // Holds up to MAX_ORBITS 80-byte records (four MVP columns + colour). `draw`
  // overwrites the first `count` records each frame with one `writeBuffer`;
  // the instance step means every ring renders with its OWN matrix — no
  // per-ring bind, no per-draw uniform for a later write to clobber.
  const instanceBuffer = device.createBuffer({
    label: 'orbit-ring-instance-vbo',
    size: MAX_ORBITS * INSTANCE_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'orbitRing.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'orbitRing.fragment');

  // ── Render pipeline (additive, depthless — the hdr profile) ──────────────
  //
  // No bind groups: the MVP + colour are per-instance vertex attributes and
  // the lobe constants are WESL consts, so the shader reads nothing from the
  // uniform address space. An explicit empty pipeline layout keeps this off
  // the 'auto'-layout path entirely.
  const pipeline = device.createRenderPipeline({
    label: 'orbit-ring-pipeline',
    layout: device.createPipelineLayout({
      label: 'orbit-ring-pipeline-layout',
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
          // Spread because `@webgpu/types` declares the field mutable while
          // the module-level export is readonly.
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
          // One/one additive blend — overlapping rings brighten, matching
          // the HDR convention every additive layer shares.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      // The orbital plane is viewed from both sides — never cull.
      cullMode: 'none',
    },
    // NO depthStencil: the hdr target has no depth attachment.
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void {
    // Clamp to the cap so an over-count caller draws MAX_ORBITS rather than
    // off the end of the buffer. Nothing to do for a zero-length batch.
    const n = Math.min(Math.max(count, 0), MAX_ORBITS);
    if (n === 0) return;

    // One upload of exactly the first `n` records. The typed-array overload
    // takes the data offset + size in ELEMENTS (floats), not bytes.
    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, n * INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount, n);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    instanceBuffer.destroy();
  }

  const renderer: OrbitRingRenderer = {
    label: 'orbitRingRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
