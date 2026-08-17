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
 * against the per-instance sun direction (the Sun's direction rotated into the
 * body's local frame, baked into the instance record) plus a small ambient
 * floor — see `planet/fragment.wesl` and the shared `lib/bodyLighting.wesl`.
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
import {
  BODY_SPHERE_RINGS,
  BODY_SPHERE_SEGMENTS,
} from '../../../../data/bodies/sphereTessellation';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import vsCode from '../../shaders/bodies/planet/vertex.wesl?static';
import fsCode from '../../shaders/bodies/planet/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/**
 * Float32 slots per per-instance record: four `vec4<f32>` MVP columns (16) +
 * one `vec4<f32>` albedo (rgb + 1 pad float, 4) + one `vec4<f32>` sunDirLocal
 * (xyz + 1 pad float, 4) = 24. The caller writes each body's record at
 * `i * INSTANCE_FLOATS`, and `draw` uploads `count` records in one
 * `writeBuffer`.
 */
export const INSTANCE_FLOATS = 24;

/**
 * Per-instance byte stride: 24 × 4 = 96. Declared here AND in the pipeline's
 * instance-buffer descriptor; a mismatch either validate-errors or silently
 * reads garbage.
 */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 96 bytes

/**
 * Per-instance vertex attributes — the four MVP columns (reassembled into a
 * `mat4x4<f32>` in the shader), the albedo, then the body-local sun direction,
 * at `@location`s 1..6 (location 0 is the per-vertex sphere position). Byte
 * offsets must match `planet/vertex.wesl` exactly.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // mvp column 0
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // mvp column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // mvp column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // mvp column 3
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // albedo (rgb + pad)
  { shaderLocation: 6, offset: 80, format: 'float32x4' }, // sunDirLocal (xyz + pad)
];

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`
 *   so this renderer never hardcodes the occlusion direction.
 */
export function createPlanetRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): PlanetRenderer {
  // ── Geometry upload (positions + indices; the lambert term needs no uvs) ──
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

  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'planet.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'planet.fragment');

  // ── Render pipeline (opaque foreground profile, same as earthRenderer) ────
  //
  // No bind groups: the MVP + albedo + sunDirLocal are per-instance vertex
  // attributes and the ambient floor is a WESL `const` (in `lib/bodyLighting`),
  // so the shader reads nothing from the uniform address space. An explicit
  // empty pipeline layout keeps this off the 'auto'-layout path entirely.
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
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // ── Planet instance buffer (grown on demand, never replaced wholesale) ────
  //
  // Mirrors `starPointRenderer.setStars`, and `orbitTrailRenderer` alongside
  // it. A fixed capacity sized to today's roster is the tempting alternative
  // and the wrong one: the count it guards is an authored-data fact, so the day
  // the table outgrows it the excess bodies vanish with no error.
  // There is no fixed cap to size
  // against up front, so the buffer starts unallocated and grows to fit the
  // largest `count` any `draw` call has passed; a later smaller frame reuses
  // the larger buffer and draws the smaller subset. `destroy()` on the
  // outgoing buffer is safe even if a prior frame referenced it — WebGPU
  // defers the actual release until in-flight work completes.
  let instanceBuffer: GPUBuffer | null = null;
  let capacityPlanets = 0;

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void {
    if (count === 0) return;
    // `count` must be backed by that many records in the caller's packed
    // array. Clamping a mismatch to fit would hide the caller's bug in a
    // dropped body; throwing surfaces it at the call that got the count wrong
    // instead of a few files away as a mis-rendered scene.
    if (count < 0 || count * INSTANCE_FLOATS > instances.length) {
      throw new Error(
        `planetRenderer.draw: count (${count}) does not fit the packed instances array (${instances.length} floats, needs ${count * INSTANCE_FLOATS})`,
      );
    }

    if (instanceBuffer === null || count > capacityPlanets) {
      instanceBuffer?.destroy();
      capacityPlanets = count;
      instanceBuffer = device.createBuffer({
        label: 'planet-instance-vbo',
        size: capacityPlanets * INSTANCE_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    // One upload of exactly the first `count` records. The typed-array
    // overload takes the data offset + size in ELEMENTS (floats), not bytes.
    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, count * INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount, count);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    instanceBuffer?.destroy();
    instanceBuffer = null;
    capacityPlanets = 0;
  }

  const renderer: PlanetRenderer = {
    label: 'planetRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
