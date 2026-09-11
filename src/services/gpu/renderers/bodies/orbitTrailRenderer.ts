/**
 * orbitTrailRenderer — Keplerian orbit trails as screen-space conics in the
 * depthless HDR accumulation (spec 2026-07-11 §6; ribbon impostor spec
 * 2026-07-31 §2.2/§2.4/§Task 12). ONE production pipeline (`vsRibbon` + `fs`)
 * over one fragment module and one instance VBO — the CPU clips every orbit
 * to its in-front-of-camera arc, so the vertex stage never needs a second
 * fallback pipeline for the behind-camera case. Same profile as
 * `planetRenderer` otherwise — additive, depthless, cull-none. Every per-orbit
 * quantity rides the instance record; the one bind group is the frame's
 * occluder spheres, written once per draw.
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { OrbitTrailRenderer } from '../../../../@types/rendering/OrbitTrailRenderer';
import vsCode from '../../shaders/bodies/orbitTrail/vertex.wesl?static';
import fsCode from '../../shaders/bodies/orbitTrail/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { MAX_ORBIT_OCCLUDERS, RIBBON_SEGMENTS } from '../../../../data/bodies/orbitTrailConstants';

/**
 * Float32 slots per per-instance record: three `Ginv` columns (12) + colour
 * + eccentricity (4) + mean anomaly + fade + viewport (4) + three clip-basis
 * vec4s `Cc`/`Ac`/`Bc` (12, the ribbon impostor's addition —
 * centre/semi-major/semi-minor of the world ellipse, projected), the
 * CPU-clipped visible arc `eStart`/`eSpan` (2), then the eye-relative 3D
 * basis the occlusion test rebuilds orbit points from (12, see
 * `eyeRelativeOrbitBasisKm`) = 46. The caller writes each orbit's record at
 * `i * INSTANCE_FLOATS`.
 */
export const INSTANCE_FLOATS = 46;

/** Per-instance byte stride: 46 × 4 = 184. Must match the pipeline's
 * instance-buffer descriptor AND `orbitTrail/io.wesl`'s `OrbitInstance`. */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 184 bytes

/**
 * Per-instance vertex attributes at `@location`s 1..12 — the three `Ginv`
 * columns, colour+eccentricity, mean anomaly+fade, the three clip-basis
 * vec4s, the visible-arc interval, then the three eye-relative basis vec4s.
 * There is no `@location(0)`: `vsRibbon` generates its own geometry from
 * `@builtin(vertex_index)`, so this instance buffer is the pipeline's ONLY
 * vertex buffer. Byte offsets must match `orbitTrail/io.wesl`'s
 * `OrbitInstance` exactly — pinned against that struct by
 * orbitTrailConstants.parity.test.ts.
 */
export const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv column 0 (.xyz + pad)
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color.rgb + eccentricity
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomalyRad + fadeAlpha + viewportPx
  { shaderLocation: 6, offset: 80, format: 'float32x4' }, // clip basis centre Cc
  { shaderLocation: 7, offset: 96, format: 'float32x4' }, // clip basis semi-major Ac
  { shaderLocation: 8, offset: 112, format: 'float32x4' }, // clip basis semi-minor Bc
  { shaderLocation: 9, offset: 128, format: 'float32x2' }, // visible arc eStart, eSpan
  { shaderLocation: 10, offset: 136, format: 'float32x4' }, // eye-relative ellipse centre (km)
  { shaderLocation: 11, offset: 152, format: 'float32x4' }, // eye-relative semi-major A (km)
  { shaderLocation: 12, offset: 168, format: 'float32x4' }, // eye-relative semi-minor B (km)
];

/**
 * The occluder uniform's layout: `count` (u32) + three pad words, then
 * MAX_ORBIT_OCCLUDERS vec4s. The ONE TS home for the byte offsets, mirroring
 * `OcclusionUniforms` in orbitTrail/fragment.wesl — pinned against that struct
 * by orbitTrailConstants.parity.test.ts, since a silent drift here writes the
 * spheres where the shader reads padding.
 */
export const OCCLUDER_COUNT_OFFSET = 0;
export const OCCLUDER_SPHERES_OFFSET = 16;
export const OCCLUDER_UNIFORM_BYTES = OCCLUDER_SPHERES_OFFSET + MAX_ORBIT_OCCLUDERS * 16;

export function createOrbitTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): OrbitTrailRenderer {
  // ONE vertex module, ONE fragment module — both shared with the debug pair.
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'orbitTrail.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'orbitTrail.fragment');

  // The frame's occluder spheres: the ONE uniform, per frame not per orbit,
  // read by the fragment stage only. Explicit layout, never 'auto'.
  const occluderBuffer = device.createBuffer({
    label: 'orbit-trail-occluder-uniform',
    size: OCCLUDER_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const occluderScratch = new ArrayBuffer(OCCLUDER_UNIFORM_BYTES);
  const occluderCount = new Uint32Array(occluderScratch, OCCLUDER_COUNT_OFFSET, 1);
  const occluderSpheres = new Float32Array(occluderScratch, OCCLUDER_SPHERES_OFFSET);
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'orbit-trail-bgl',
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const bindGroup = device.createBindGroup({
    label: 'orbit-trail-bg',
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: occluderBuffer } }],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: 'orbit-trail-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  // Shared with the debug pipeline below — same instance record, same
  // profile. Spread because `@webgpu/types` declares `attributes` mutable
  // while the module-level export is readonly.
  const vertexBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: INSTANCE_STRIDE,
      stepMode: 'instance',
      attributes: [...INSTANCE_ATTRIBUTES],
    },
  ];
  const fragmentTargets: GPUColorTargetState[] = [{ format: targetFormat, blend: ADDITIVE_BLEND }];
  const primitive: GPUPrimitiveState = { topology: 'triangle-list', cullMode: 'none' };

  // NO depthStencil: the hdr target has no depth attachment, and declaring a
  // depth format for a depthless pass errors. Production and debug share
  // every field but label and fragment entry point — one factory for both.
  function makeRibbonPipeline(label: string, fsEntryPoint: string): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: pipelineLayout,
      vertex: { module: vsModule, entryPoint: 'vsRibbon', buffers: vertexBuffers },
      fragment: { module: fsModule, entryPoint: fsEntryPoint, targets: fragmentTargets },
      primitive,
    });
  }

  const ribbonPipeline = makeRibbonPipeline('orbit-trail-ribbon-pipeline', 'fs');

  // The `debug.overlays['orbit-trail-impostor']` overlay, over the SAME vertex stage/
  // buffers/profile as the production pipeline but the constant-colour
  // `fsImpostorRibbon` entry point. Built LAZILY on first enable — the
  // overlay is off in production, so an unused pipeline is pure init cost
  // nobody pays for.
  let debugRibbonPipeline: GPURenderPipeline | null = null;
  function ensureDebugPipelines(): void {
    if (debugRibbonPipeline !== null) return;
    debugRibbonPipeline = makeRibbonPipeline(
      'orbit-trail-debug-ribbon-pipeline',
      'fsImpostorRibbon',
    );
  }

  // Grown on demand, sized by SLOTS (`instances.length / INSTANCE_FLOATS`),
  // not by `count` — mirrors starPointRenderer's instance buffer. No fixed
  // cap.
  let instanceBuffer: GPUBuffer | null = null;
  let capacitySlots = 0;

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(
    pass: GPURenderPassEncoder,
    instances: Float32Array,
    count: number,
    occluders: { readonly count: number; readonly spheresKm: Float32Array },
    showImpostor = false,
  ): void {
    // Zero is a whole-call no-op — no upload, no draw.
    if (count === 0) return;

    // A count the caller's own packed array cannot back is a programming
    // error, not a runtime condition to paper over — throw rather than read
    // past the array.
    const slots = instances.length / INSTANCE_FLOATS;
    if (count < 0 || count > slots) {
      throw new Error(
        `orbitTrailRenderer.draw: count (${count}) does not fit the packed instances array (${instances.length} floats, ${slots} slots)`,
      );
    }

    if (instanceBuffer === null || slots > capacitySlots) {
      instanceBuffer?.destroy();
      capacitySlots = slots;
      instanceBuffer = device.createBuffer({
        label: 'orbit-trail-instance-vbo',
        size: capacitySlots * INSTANCE_STRIDE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, instances.length);
    pass.setVertexBuffer(0, instanceBuffer);

    const spheres = Math.min(occluders.count, MAX_ORBIT_OCCLUDERS);
    occluderCount[0] = spheres;
    occluderSpheres.set(occluders.spheresKm.subarray(0, spheres * 4));
    device.queue.writeBuffer(occluderBuffer, 0, occluderScratch);
    pass.setBindGroup(0, bindGroup);

    pass.setPipeline(ribbonPipeline);
    pass.draw(RIBBON_SEGMENTS * 6, count, 0, 0);

    // The debug overlay is a LENS over the real trail, not a replacement —
    // this draw is IN ADDITION to the production one above, reusing the
    // exact same vertex count so the overlay lands on the real geometry
    // rather than some independently-derived footprint.
    if (showImpostor) {
      ensureDebugPipelines();
      pass.setPipeline(debugRibbonPipeline!);
      pass.draw(RIBBON_SEGMENTS * 6, count, 0, 0);
    }
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    occluderBuffer.destroy();
    instanceBuffer?.destroy();
    instanceBuffer = null;
    capacitySlots = 0;
  }

  const renderer: OrbitTrailRenderer = {
    label: 'orbitTrailRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
