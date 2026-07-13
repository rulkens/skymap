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
 * three `vec4<f32>` columns, followed by `(color.rgb, eccentricity)` and
 * `(meanAnomalyRad, pad×3)`. Same rationale as the ring twin: each orbit reads
 * its OWN baked record via `@builtin(instance_index)`, so there is no mid-frame
 * uniform for a later write to clobber (the writeBuffer-vs-submit landmine).
 * One `writeBuffer`, one `draw`, no bind group at all.
 *
 * @module
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { OrbitTrailRenderer } from '../../../@types/rendering/OrbitTrailRenderer';
import vsCode from '../shaders/orbitTrail/vertex.wesl?static';
import fsCode from '../shaders/orbitTrail/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** Upper bound on orbit trails drawn per frame. 22 orbits ship today (the eight
 *  major planets + the Moon + Mars/Jupiter/Saturn's major moons); the cap sizes
 *  the instance buffer with headroom for further satellites/dwarfs. */
export const MAX_ORBITS = 24;

/**
 * Float32 slots per per-instance record: three `vec4<f32>` `Ginv` columns (12)
 * + one `vec4<f32>` `(color.rgb, eccentricity)` (4) + one `vec4<f32>`
 * `(meanAnomalyRad, pad, pad, pad)` (4) = 20. The caller writes each orbit's
 * record at `i * INSTANCE_FLOATS`, and `draw` uploads `count` records in one
 * `writeBuffer`. Same 20-float stride the ring renderer used (a different
 * payload — three matrix columns + trail params rather than four MVP columns +
 * colour — at the same size), so the instance-buffer sizing carries over.
 */
export const INSTANCE_FLOATS = 20;

/**
 * Per-instance byte stride: 20 × 4 = 80. Declared here AND in the pipeline's
 * instance-buffer descriptor; a mismatch either validate-errors or silently
 * reads garbage.
 */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 80 bytes

/**
 * Per-instance vertex attributes — the three `Ginv` columns (reassembled into a
 * `mat3x3<f32>` in the fragment) followed by the colour+eccentricity and the
 * mean anomaly, at `@location`s 1..5. There is no `@location(0)` — the
 * fullscreen triangle is generated from `@builtin(vertex_index)`, so this
 * instance buffer is the pipeline's ONLY vertex buffer. Byte offsets must match
 * `orbitTrail/vertex.wesl` exactly.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv column 0 (.xyz + pad)
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color.rgb + eccentricity
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomalyRad + pad
];

export function createOrbitTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): OrbitTrailRenderer {
  // ── Instance vertex buffer ────────────────────────────────────────────────
  //
  // Holds up to MAX_ORBITS 80-byte records (three Ginv columns + trail params).
  // `draw` overwrites the first `count` records each frame with one
  // `writeBuffer`; the instance step means every orbit renders with its OWN
  // matrix — no per-orbit bind, no per-draw uniform for a later write to
  // clobber. There is no position/index buffer: the geometry is a fullscreen
  // triangle from `@builtin(vertex_index)` (see the module header).
  const instanceBuffer = device.createBuffer({
    label: 'orbit-trail-instance-vbo',
    size: MAX_ORBITS * INSTANCE_STRIDE,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

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
    // Clamp to the cap so an over-count caller draws MAX_ORBITS rather than off
    // the end of the buffer. Nothing to do for a zero-length batch.
    const n = Math.min(Math.max(count, 0), MAX_ORBITS);
    if (n === 0) return;

    // One upload of exactly the first `n` records. The typed-array overload
    // takes the data offset + size in ELEMENTS (floats), not bytes.
    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, n * INSTANCE_FLOATS);

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, instanceBuffer);
    // Three verts (the oversized triangle), n instances (one per orbit).
    pass.draw(3, n);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    instanceBuffer.destroy();
  }

  const renderer: OrbitTrailRenderer = {
    label: 'orbitTrailRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
