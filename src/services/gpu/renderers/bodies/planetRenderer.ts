/**
 * planetRenderer — flat-lit albedo planets drawn into the opaque near-field
 * foreground target with ONE instanced draw.
 *
 * Structural twin of `starRenderer` (same `uvSphereMesh` geometry, same opaque
 * depth-tested pipeline profile against the caller's foreground `targetFormat`
 * / `depthFormat`); the difference is the shader pair AND that this renderer
 * draws N planets in a single `drawIndexed(indexCount, count)`. The planet's
 * vertex stage forwards the unit-sphere local position (== outward normal) and
 * the fragment modulates the per-instance albedo by ONE lambert dot product
 * against a fixed light direction plus a small ambient floor — see
 * `planet/fragment.wesl` for why the fixed direction is a documented stand-in
 * for real sun-relative lighting, not a lighting system.
 *
 * No texture machinery: a per-instance albedo is enough at the descent's
 * fly-past distances. If a body ever earns imagery it would grow the Earth's
 * placeholder-texture + `setTexture` pattern; starting textureless keeps this
 * renderer at exactly the surface the plan's contract names.
 *
 * ### Why GPU instancing — one write + one draw for N planets
 *
 * Each seeded planet's MVP + albedo rides in a per-instance vertex-buffer
 * record, stepped by `@builtin(instance_index)`. The caller packs every
 * body's record into one Float32Array and `draw` uploads it with a SINGLE
 * `queue.writeBuffer`, then issues ONE `drawIndexed` with `instanceCount = N`.
 *
 * This is the house idiom (`pointRenderer`), chosen over the alternatives:
 *
 *   - N per-body draws each rebinding a uniform — multiplies binds and pushes a
 *     "which body am I" frame concern into the wiring.
 *   - A shared single-slot uniform written once per draw — does NOT work:
 *     `queue.writeBuffer` is ordered against submit, not against the draws
 *     recorded between writes, so every draw would read the last-written block
 *     and all planets would collapse onto the final body (the writeBuffer-vs-
 *     submit landmine).
 *   - Dynamic-offset uniform slots — works, but costs a 256-byte-aligned slot
 *     per body and a per-draw dynamic bind; instancing needs neither.
 *
 * Instancing sidesteps the writeBuffer-vs-submit race by construction: every
 * instance reads its OWN baked record, so there is no mid-frame uniform for a
 * later write to clobber. One `writeBuffer` + one draw, no bind group at all.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { PlanetRenderer } from '../../../../@types/rendering/PlanetRenderer';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import vsCode from '../../shaders/planet/vertex.wesl?static';
import fsCode from '../../shaders/planet/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/** UV-sphere tessellation counts — matches `earthRenderer` /
 *  `starRenderer` so every sphere body shares a mesh shape. */
const SEGMENTS = 48;
const RINGS = 24;

/** Upper bound on planet/moon spheres drawn per frame. 21 bodies ship today
 *  (the seven non-Earth major planets + the Moon + Mars/Jupiter/Saturn's major
 *  moons); this caps the instance buffer size with headroom for more. */
export const MAX_PLANETS = 24;

/**
 * Float32 slots per per-instance record: four `vec4<f32>` MVP columns (16) +
 * one `vec4<f32>` albedo (rgb + 1 pad float, 4) = 20. The caller writes each
 * body's record at `i * INSTANCE_FLOATS`, and `draw` uploads `count` records
 * in one `writeBuffer`.
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
 * `mat4x4<f32>` in the shader) followed by the albedo, at `@location`s 1..5
 * (location 0 is the per-vertex sphere position). Byte offsets must match
 * `planet/vertex.wesl` exactly.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // mvp column 0
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // mvp column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // mvp column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // mvp column 3
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // albedo (rgb + pad)
];

export function createPlanetRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): PlanetRenderer {
  // ── Geometry upload (positions + indices; the lambert term needs no uvs) ──
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
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

  // ── Instance vertex buffer ────────────────────────────────────────────────
  //
  // Holds up to MAX_PLANETS 80-byte records (four MVP columns + albedo). `draw`
  // overwrites the first `count` records each frame with one `writeBuffer`; the
  // instance step means `@builtin(instance_index)` selects a body's record, so
  // every planet renders with its OWN matrix — no per-body bind, no per-draw
  // uniform for a later write to clobber (see the module header).
  const instanceBuffer = device.createBuffer({
    label: 'planet-instance-vbo',
    size: MAX_PLANETS * INSTANCE_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'planet.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'planet.fragment');

  // ── Render pipeline (opaque foreground profile, same as earthRenderer) ────
  //
  // No bind groups: the MVP + albedo are per-instance vertex attributes and the
  // lighting constants are WESL `const`s, so the shader reads nothing from the
  // uniform address space. An explicit empty pipeline layout keeps this off the
  // 'auto'-layout path entirely.
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
          // Spread because `@webgpu/types` declares the field mutable while the
          // module-level export is readonly.
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
          // No blend descriptor = opaque replace; the fragment emits alpha=1
          // and the foreground composite blends the whole layer.
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // CCW = outward-facing (matches uvSphereMesh winding)
      cullMode: 'back', // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void {
    // Clamp to the cap so an over-count caller draws MAX_PLANETS rather than off
    // the end of the buffer (a silently-dropped tail beats a GPU validation
    // error). Nothing to do for a zero-length batch.
    const n = Math.min(Math.max(count, 0), MAX_PLANETS);
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

  const renderer: PlanetRenderer = {
    label: 'planetRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
