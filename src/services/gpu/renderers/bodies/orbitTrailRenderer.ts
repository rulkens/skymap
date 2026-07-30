/**
 * orbitTrailRenderer — the accurate Keplerian orbit trails as screen-space
 * conics, drawn additively into the depthless HDR accumulation with ONE
 * instanced draw (spec `2026-07-11-conic-orbit-trails.md` §6).
 *
 * Shares its pipeline profile with `planetRenderer` and `starPointRenderer`
 * (the caller's rgba16float `hdr` target, one/one additive blend, NO
 * depthStencil — the hdr row has no depth attachment, and declaring a depth
 * format for a depthless pass is a validation error; `cullMode: 'none'`
 * because an orbital plane is viewed from both sides; an explicit EMPTY
 * pipeline layout keeps this off the 'auto'-layout path). Two deliberate
 * divergences from that shared profile:
 *
 * ### Geometry is a fullscreen triangle, generated in the vertex shader
 *
 * A Keplerian ellipse under perspective is a general conic, and when the orbit
 * plane sweeps near the camera the projection becomes a hyperbola open to
 * infinity — a finite screen-space bounding quad is then wrong or needs a
 * special case exactly at the degeneracy (spec §2). So each orbit covers the
 * whole viewport with one oversized triangle emitted from `@builtin(vertex_index)`
 * (`vertex.wesl`); there is NO position VBO and NO index buffer. The draw is
 * `pass.draw(3, n)` — 3 verts, n instances — not `drawIndexed`. The fragment
 * back-projects each pixel through `Ginv` and discards everything off the
 * stroke, so the fullscreen cost is fragment-only and cheap for a near-field
 * scene of a few additive orbits (spec §6).
 *
 * ### The per-instance record is `Ginv` + trail params, not an MVP
 *
 * The pixel→plane inverse homography `Ginv` (a padded `mat3x3<f32>`) streams as
 * three `vec4<f32>` columns, followed by `(color.rgb, eccentricity)`,
 * `(meanAnomalyRad, fadeAlpha, pad×2)`, and the two `vec4<f32>` gradient-minor
 * triples `(M1, M2, M3, pad)` / `(M4, M5, M6, pad)` that make the fragment's
 * Sampson gradient affine (see `composeOrbitConic`'s header). Same rationale as
 * the ring twin: each orbit reads its OWN baked record via
 * `@builtin(instance_index)`, so there is no mid-frame uniform for a later write
 * to clobber (the writeBuffer-vs-submit landmine). One `writeBuffer`, one
 * `draw`, no bind group at all.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { OrbitTrailRenderer } from '../../../../@types/rendering/OrbitTrailRenderer';
import vsCode from '../../shaders/bodies/orbitTrail/vertex.wesl?static';
import fsCode from '../../shaders/bodies/orbitTrail/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

/**
 * Float32 slots per per-instance record: three `vec4<f32>` `Ginv` columns (12)
 * + one `vec4<f32>` `(color.rgb, eccentricity)` (4) + one `vec4<f32>`
 * `(meanAnomalyRad, fadeAlpha, pad, pad)` (4) + two `vec4<f32>` gradient-minor
 * triples `(M1, M2, M3, pad)` / `(M4, M5, M6, pad)` (8) = 28. The caller writes
 * each orbit's record at `i * INSTANCE_FLOATS`, and `draw` uploads `count`
 * records in one `writeBuffer`. The two minor triples are the CPU-f64 hoist that
 * makes the fragment's Sampson gradient affine (see `composeOrbitConic`).
 */
export const INSTANCE_FLOATS = 28;

/**
 * Per-instance byte stride: 28 × 4 = 112. Declared here AND in the pipeline's
 * instance-buffer descriptor; a mismatch either validate-errors or silently
 * reads garbage.
 */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 112 bytes

/**
 * Per-instance vertex attributes — the three `Ginv` columns (reassembled into a
 * `mat3x3<f32>` in the fragment) followed by the colour+eccentricity, the mean
 * anomaly+fade, and the two gradient-minor triples, at `@location`s 1..7. There
 * is no `@location(0)` — the fullscreen triangle is generated from
 * `@builtin(vertex_index)`, so this instance buffer is the pipeline's ONLY
 * vertex buffer. Byte offsets must match `orbitTrail/vertex.wesl` exactly.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv column 0 (.xyz + pad)
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color.rgb + eccentricity
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomalyRad + fadeAlpha + pad
  { shaderLocation: 6, offset: 80, format: 'float32x4' }, // gradient minors M1/M2/M3 + pad
  { shaderLocation: 7, offset: 96, format: 'float32x4' }, // gradient minors M4/M5/M6 + pad
];

export function createOrbitTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): OrbitTrailRenderer {
  // ── Shader modules ────────────────────────────────────────────────────────
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'orbitTrail.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'orbitTrail.fragment');

  // ── Render pipeline (additive, depthless — the hdr profile) ──────────────
  //
  // No bind groups: `Ginv` + trail params are per-instance vertex attributes
  // and the stroke/trail constants are WESL consts, so the shader reads nothing
  // from the uniform address space. An explicit empty pipeline layout keeps
  // this off the 'auto'-layout path entirely.
  const pipeline = device.createRenderPipeline({
    label: 'orbit-trail-pipeline',
    layout: device.createPipelineLayout({
      label: 'orbit-trail-pipeline-layout',
      bindGroupLayouts: [],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      // ONE vertex buffer: the per-instance record. The fullscreen triangle is
      // generated from `@builtin(vertex_index)`, so there is no per-vertex
      // position buffer at location 0.
      buffers: [
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
          // One/one additive blend — overlapping orbits brighten, matching the
          // HDR convention every additive layer shares.
          blend: ADDITIVE_BLEND,
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

  // ── Orbit instance buffer (grown on demand, never replaced wholesale) ─────
  //
  // Mirrors `starPointRenderer.setStars`. A fixed capacity sized to today's
  // table is the tempting alternative and the wrong one: the count it guards is
  // an authored-data fact, so the day the table outgrows it the excess trails
  // vanish with no error. Growth has no such edge.
  // There is no fixed cap to size against up front, so the buffer starts
  // unallocated and grows to fit the largest `count` any `draw` call has
  // passed; a later smaller frame reuses the larger buffer and draws the
  // smaller subset. `destroy()` on the outgoing buffer is safe even if a prior
  // frame referenced it — WebGPU defers the actual release until in-flight
  // work completes.
  let instanceBuffer: GPUBuffer | null = null;
  let capacityOrbits = 0;

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void {
    if (count === 0) return;
    // `count` must be backed by that many records in the caller's packed
    // array. Clamping a mismatch to fit would hide the caller's bug in a
    // dropped trail; throwing surfaces it at the call that got the count wrong
    // instead of a few files away as a mis-rendered scene.
    if (count < 0 || count * INSTANCE_FLOATS > instances.length) {
      throw new Error(
        `orbitTrailRenderer.draw: count (${count}) does not fit the packed instances array (${instances.length} floats, needs ${count * INSTANCE_FLOATS})`,
      );
    }

    if (instanceBuffer === null || count > capacityOrbits) {
      instanceBuffer?.destroy();
      capacityOrbits = count;
      instanceBuffer = device.createBuffer({
        label: 'orbit-trail-instance-vbo',
        size: capacityOrbits * INSTANCE_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    // One upload of exactly the first `count` records. The typed-array
    // overload takes the data offset + size in ELEMENTS (floats), not bytes.
    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, count * INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, instanceBuffer);
    // Three verts (the oversized triangle), count instances (one per orbit).
    pass.draw(3, count);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    instanceBuffer?.destroy();
    instanceBuffer = null;
    capacityOrbits = 0;
  }

  const renderer: OrbitTrailRenderer = {
    label: 'orbitTrailRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
