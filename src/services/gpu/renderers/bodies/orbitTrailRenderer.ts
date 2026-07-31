/**
 * orbitTrailRenderer — Keplerian orbit trails as screen-space conics in the
 * depthless HDR accumulation (spec 2026-07-11 §6; ribbon impostor spec
 * 2026-07-31 §2.2/§2.4). Two pipelines share ONE fragment module and ONE
 * instance VBO: `vsRibbon` draws the cheap bounded-projection ribbon, `vs`
 * the fullscreen-triangle fallback. Same profile as `planetRenderer`
 * otherwise — additive, depthless, cull-none, explicit empty layout, no
 * bind groups (every quantity rides the per-instance record).
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { OrbitTrailRenderer } from '../../../../@types/rendering/OrbitTrailRenderer';
import vsCode from '../../shaders/bodies/orbitTrail/vertex.wesl?static';
import fsCode from '../../shaders/bodies/orbitTrail/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';
import { RIBBON_SEGMENTS } from '../../../../data/bodies/orbitTrailConstants';

/**
 * Float32 slots per per-instance record: three `Ginv` columns (12) + colour
 * + eccentricity (4) + mean anomaly + fade + pad (4) + two gradient-minor
 * triples (8) + three clip-basis vec4s `Cc`/`Ac`/`Bc` (12, the ribbon
 * impostor's addition — centre/semi-major/semi-minor of the world ellipse,
 * projected) = 40. The caller writes each orbit's record at
 * `i * INSTANCE_FLOATS`.
 */
export const INSTANCE_FLOATS = 40;

/** Per-instance byte stride: 40 × 4 = 160. Must match the pipeline's
 * instance-buffer descriptor AND `orbitTrail/io.wesl`'s `OrbitInstance`. */
export const INSTANCE_STRIDE = INSTANCE_FLOATS * 4; // 160 bytes

/**
 * Per-instance vertex attributes at `@location`s 1..10 — the three `Ginv`
 * columns, colour+eccentricity, mean anomaly+fade, the two gradient-minor
 * triples, then the three clip-basis vec4s. There is no `@location(0)`:
 * both pipelines generate their own geometry from `@builtin(vertex_index)`,
 * so this instance buffer is the pipeline's ONLY vertex buffer. Byte
 * offsets must match `orbitTrail/io.wesl`'s `OrbitInstance` exactly.
 */
const INSTANCE_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 1, offset: 0, format: 'float32x4' }, // Ginv column 0 (.xyz + pad)
  { shaderLocation: 2, offset: 16, format: 'float32x4' }, // Ginv column 1
  { shaderLocation: 3, offset: 32, format: 'float32x4' }, // Ginv column 2
  { shaderLocation: 4, offset: 48, format: 'float32x4' }, // color.rgb + eccentricity
  { shaderLocation: 5, offset: 64, format: 'float32x4' }, // meanAnomalyRad + fadeAlpha + viewportPx
  { shaderLocation: 6, offset: 80, format: 'float32x4' }, // gradient minors M1/M2/M3 + pad
  { shaderLocation: 7, offset: 96, format: 'float32x4' }, // gradient minors M4/M5/M6 + pad
  { shaderLocation: 8, offset: 112, format: 'float32x4' }, // clip basis centre Cc
  { shaderLocation: 9, offset: 128, format: 'float32x4' }, // clip basis semi-major Ac
  { shaderLocation: 10, offset: 144, format: 'float32x4' }, // clip basis semi-minor Bc
];

export function createOrbitTrailRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): OrbitTrailRenderer {
  // ONE vertex module (two entry points), ONE fragment module — both shared.
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'orbitTrail.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'orbitTrail.fragment');

  const pipelineLayout = device.createPipelineLayout({
    label: 'orbit-trail-pipeline-layout',
    bindGroupLayouts: [],
  });

  // Shared across both pipelines — same instance record, same profile.
  // Spread because `@webgpu/types` declares `attributes` mutable while the
  // module-level export is readonly.
  const vertexBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: INSTANCE_STRIDE,
      stepMode: 'instance',
      attributes: [...INSTANCE_ATTRIBUTES],
    },
  ];
  const fragmentTargets: GPUColorTargetState[] = [
    { format: targetFormat, blend: ADDITIVE_BLEND },
  ];
  const primitive: GPUPrimitiveState = { topology: 'triangle-list', cullMode: 'none' };

  // NO depthStencil on either pipeline: the hdr target has no depth
  // attachment, and declaring a depth format for a depthless pass errors.
  const ribbonPipeline = device.createRenderPipeline({
    label: 'orbit-trail-ribbon-pipeline',
    layout: pipelineLayout,
    vertex: { module: vsModule, entryPoint: 'vsRibbon', buffers: vertexBuffers },
    fragment: { module: fsModule, entryPoint: 'fs', targets: fragmentTargets },
    primitive,
  });

  const fallbackPipeline = device.createRenderPipeline({
    label: 'orbit-trail-fallback-pipeline',
    layout: pipelineLayout,
    vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
    fragment: { module: fsModule, entryPoint: 'fs', targets: fragmentTargets },
    primitive,
  });

  // The `debug.showOrbitTrailImpostor` overlay's pair, over the SAME vertex
  // stages/buffers/profile as the production pipelines but the constant-
  // colour `fsImpostor*` entry points. Built LAZILY on first enable — the
  // overlay is off in production, so an unused pipeline pair is pure init
  // cost nobody pays for.
  let debugRibbonPipeline: GPURenderPipeline | null = null;
  let debugFallbackPipeline: GPURenderPipeline | null = null;
  function ensureDebugPipelines(): void {
    if (debugRibbonPipeline !== null) return;
    debugRibbonPipeline = device.createRenderPipeline({
      label: 'orbit-trail-debug-ribbon-pipeline',
      layout: pipelineLayout,
      vertex: { module: vsModule, entryPoint: 'vsRibbon', buffers: vertexBuffers },
      fragment: { module: fsModule, entryPoint: 'fsImpostorRibbon', targets: fragmentTargets },
      primitive,
    });
    debugFallbackPipeline = device.createRenderPipeline({
      label: 'orbit-trail-debug-fallback-pipeline',
      layout: pipelineLayout,
      vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: { module: fsModule, entryPoint: 'fsImpostorFallback', targets: fragmentTargets },
      primitive,
    });
  }

  // Grown on demand, sized by SLOTS (`instances.length / INSTANCE_FLOATS`),
  // not by either draw count — the buffer must hold every record either
  // partition might reference, including the unwritten middle. No fixed
  // cap, mirroring starPointRenderer's instance buffer.
  let instanceBuffer: GPUBuffer | null = null;
  let capacitySlots = 0;

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(
    pass: GPURenderPassEncoder,
    instances: Float32Array,
    ribbonCount: number,
    fallbackCount: number,
    showImpostor = false,
  ): void {
    // Both zero is a whole-call no-op — no upload, no draw.
    if (ribbonCount === 0 && fallbackCount === 0) return;

    // The partition contract: ribbon records occupy the front of
    // `instances`, fallback records the back, with unwritten slots between.
    // A count pair the caller's own packed array cannot back is a
    // programming error, not a runtime condition to paper over — throw
    // rather than read past the array or silently drop a partition.
    const slots = instances.length / INSTANCE_FLOATS;
    if (ribbonCount < 0 || fallbackCount < 0 || ribbonCount + fallbackCount > slots) {
      throw new Error(
        `orbitTrailRenderer.draw: ribbonCount (${ribbonCount}) + fallbackCount (${fallbackCount}) does not fit the packed instances array (${instances.length} floats, ${slots} slots)`,
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

    // ONE upload of every slot, including the unwritten middle — simpler
    // than tracking two upload ranges, and cheap (60 records ≈ 9.6 kB).
    device.queue.writeBuffer(instanceBuffer, 0, instances, 0, instances.length);
    pass.setVertexBuffer(0, instanceBuffer);

    if (ribbonCount > 0) {
      pass.setPipeline(ribbonPipeline);
      pass.draw(RIBBON_SEGMENTS * 6, ribbonCount, 0, 0);
    }
    if (fallbackCount > 0) {
      pass.setPipeline(fallbackPipeline);
      // firstInstance = slots - fallbackCount: fallback records sit at the
      // BACK of the shared VBO, so this is what lets both partitions read
      // one buffer with no compaction pass.
      pass.draw(3, fallbackCount, 0, slots - fallbackCount);
    }

    // The debug overlay is a LENS over the real trails, not a replacement —
    // these draws are IN ADDITION to the production pair above, reusing the
    // exact same vertex counts and firstInstance offsets so the overlay lands
    // on the real geometry rather than some independently-derived footprint.
    if (showImpostor) {
      ensureDebugPipelines();
      if (ribbonCount > 0) {
        pass.setPipeline(debugRibbonPipeline!);
        pass.draw(RIBBON_SEGMENTS * 6, ribbonCount, 0, 0);
      }
      if (fallbackCount > 0) {
        pass.setPipeline(debugFallbackPipeline!);
        pass.draw(3, fallbackCount, 0, slots - fallbackCount);
      }
    }
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
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
