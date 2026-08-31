/**
 * flowFieldRenderer — the CF4++ peculiar-velocity flow layer, and the engine's
 * lone compute renderer. It owns the velocity `texture_3d` (via the held
 * `FlowField`), one shared particle buffer set (`part` / `trail` / `acc`), three
 * compute pipelines (`seed` / `advect` / `streamline`) behind one explicit
 * bind-group layout, and the additive ribbon render pipeline. See
 * `FlowFieldRenderer.d.ts` for the public contract and
 * `docs/superpowers/specs/2026-06-04-flow-field-integration-design.md` for the
 * design (§1, §3, §5). Three load-bearing design choices:
 *
 * ### ONE shared buffer set, not two
 *
 * The rejected alternative keeps advect and streamline in entirely separate
 * `{part,trail,acc}` triples so switching modes just shows the other field. We
 * share a single triple across both modes. That is only safe because switching
 * mode (or changing `count`) reseeds — the modes never read each other's stale
 * state because the latch (third choice below) overwrites the buffers before
 * the first integrate. Sharing halves the buffer footprint (the larger tiers
 * are not cheap) and avoids per-mode bookkeeping.
 *
 * ### ONE explicit compute bind-group layout, never layout:'auto'
 *
 * `layout:'auto'` is out: auto-derived layouts are pipeline-SPECIFIC even when
 * the binding declarations are identical (a known WebGPU trap — see project
 * memory). With one shared buffer set we want ONE bind group
 * reused across all three compute pipelines, so we build an explicit
 * `GPUBindGroupLayout` + `GPUPipelineLayout` and create all three pipelines off
 * it. The `acc` buffer at @5 is advect-only state, but the WESL declares it for
 * all three entry points (an unused module-scope binding is legal), so one
 * layout — and one bind group — drives `seed`, `advect`, and `streamline`. The
 * render side gets its own explicit layout (VERTEX-only visibility, because the
 * ribbon shader folds `intensity` into the vertex stage — see flow/vertex.wesl).
 *
 * ### Dedicated `seed` pass; ONE compPrm write serves seed + integrate
 *
 * The rejected alternative dodges the writeBuffer/submit race with a mutable
 * `seedFlag` uniform and a separate out-of-band submit. Instead, the WESL has
 * a dedicated `seed` entry point reading only the `IntegratorParams` subset it shares with
 * the integrators (`n` / `frame` / `bias` — NOT trailStep/headStep/mode/wander).
 * So `encodeCompute` writes `compPrm` ONCE from the live `FlowSettings`, then
 * encodes the `seed` pass (when the latch yields) AND the integrate pass into
 * the SAME frame encoder. WebGPU inserts the storage barrier between the two
 * compute passes; no out-of-band submit, no second writeBuffer. That single-
 * write-serves-both is the whole point — a per-pass uniform write would
 * resurrect the race.
 */

import { mat4, type Mat4 } from 'wgpu-matrix';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec4 } from '../../../../@types/math/Vec4';
import type { ScalarCube } from '../../../../@types/data/volume/ScalarCube';
import type { FlowField } from '../../../../@types/data/flow/FlowField';
import type { FlowSettings } from '../../../../@types/settings/FlowSettings';
import type { FlowFieldRenderer } from '../../../../@types/rendering/FlowFieldRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import { flowFieldFromCube } from '../../resources/flowFieldFromCube';
import { buildCubeModelMatrix } from '../../../../utils/math/buildCubeModelMatrix';
import { clampFlowParams } from '../../../../utils/clampFlowParams';
import { createReseedLatch } from '../../../../utils/createReseedLatch';
import { flowFrameDeltaSec } from '../../../../utils/flowFrameDeltaSec';
import {
  TRAIL,
  MAX_PARTICLES,
  HEAD_SPEED_SCALE,
  RIBBON_WIDTH,
} from '../../../../data/flow/flowFieldConstants';
import flowComputeWgsl from '../../shaders/flow/compute.wesl?static';
import flowVertexWgsl from '../../shaders/flow/vertex.wesl?static';
import flowFragmentWgsl from '../../shaders/flow/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

const WORKGROUP_SIZE = 64;

// Mode codes shared with the WESL `IntegratorParams.mode` / `Cam.mode` u32 fields.
const MODE_ADVECT = 0;
const MODE_STREAMLINE = 1;

// Byte sizes of the two uniform buffers. compPrm uses the first 32 bytes of a
// 48-byte buffer (tail padded — see the IntegratorParams byte-layout in flow/compute.wesl);
// camBuf is 160 bytes (the Cam struct uses through byte 148, padded to a
// 16-byte multiple). The reused scratch arrays mirror these exactly.
const COMP_PRM_BYTES = 48;
const CAM_BYTES = 160;

export function createFlowFieldRenderer(init: {
  device: GPUDevice;
  /**
   * The colour-target format the additive ribbon pipeline writes into — the
   * HDR offscreen (`'rgba16float'`), matching the scalar-volume target. Passed
   * explicitly (never a `GpuContext.format`, which is always the swap format).
   */
  targetFormat: GPUTextureFormat;
}): FlowFieldRenderer {
  const { device, targetFormat } = init;

  // ── One shared particle buffer set (see module header) ────────────────────
  // part:  xyz + age, one vec4 per particle.            STORAGE | COPY_DST
  // trail: ring of (xyz, speed), TRAIL vec4 per particle. STORAGE
  // acc:   advect carried distance, one f32 per particle. STORAGE (unused by streamline)
  const part = device.createBuffer({
    label: 'flow-part',
    size: MAX_PARTICLES * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const trail = device.createBuffer({
    label: 'flow-trail',
    size: MAX_PARTICLES * TRAIL * 16,
    usage: GPUBufferUsage.STORAGE,
  });
  const acc = device.createBuffer({
    label: 'flow-acc',
    size: MAX_PARTICLES * 4,
    usage: GPUBufferUsage.STORAGE,
  });

  const compPrm = device.createBuffer({
    label: 'flow-compPrm',
    size: COMP_PRM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camBuf = device.createBuffer({
    label: 'flow-camBuf',
    size: CAM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Shader modules ────────────────────────────────────────────────────────
  const computeModule = createShaderModuleWithDevLog(device, flowComputeWgsl, 'flow.compute');
  const vertexModule = createShaderModuleWithDevLog(device, flowVertexWgsl, 'flow.vertex');
  const fragmentModule = createShaderModuleWithDevLog(device, flowFragmentWgsl, 'flow.fragment');

  // ── One explicit compute BGL + three pipelines off it ─────────────────────
  // Visibility COMPUTE on every entry; bindings mirror flow/compute.wesl @group(0).
  const computeBgl = device.createBindGroupLayout({
    label: 'flow-compute-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const computePipelineLayout = device.createPipelineLayout({
    label: 'flow-compute-pipeline-layout',
    bindGroupLayouts: [computeBgl],
  });
  const seedPipeline = device.createComputePipeline({
    label: 'flow-seed',
    layout: computePipelineLayout,
    compute: { module: computeModule, entryPoint: 'seed' },
  });
  const advectPipeline = device.createComputePipeline({
    label: 'flow-advect',
    layout: computePipelineLayout,
    compute: { module: computeModule, entryPoint: 'advect' },
  });
  const streamlinePipeline = device.createComputePipeline({
    label: 'flow-streamline',
    layout: computePipelineLayout,
    compute: { module: computeModule, entryPoint: 'streamline' },
  });

  // ── Explicit render BGL + pipeline ────────────────────────────────────────
  // Cam is referenced only from the vertex stage (intensity folded there), so
  // every entry is VERTEX-only — see the flow/vertex.wesl module header.
  const renderBgl = device.createBindGroupLayout({
    label: 'flow-render-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });
  const renderPipelineLayout = device.createPipelineLayout({
    label: 'flow-render-pipeline-layout',
    bindGroupLayouts: [renderBgl],
  });
  const renderPipeline = device.createRenderPipeline({
    label: 'flow-render',
    layout: renderPipelineLayout,
    vertex: { module: vertexModule, entryPoint: 'vsTrail' },
    fragment: {
      module: fragmentModule,
      entryPoint: 'fsTrail',
      targets: [
        {
          format: targetFormat,
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-strip' },
  });

  // Render bind group: all three resources (camBuf, trail, parts) exist now, so
  // it can be built at construction and reused for every draw.
  const renderBindGroup = device.createBindGroup({
    label: 'flow-render-bg',
    layout: renderBgl,
    entries: [
      { binding: 0, resource: { buffer: camBuf } },
      { binding: 1, resource: { buffer: trail } },
      { binding: 2, resource: { buffer: part } },
    ],
  });

  // ── Reused scratch typed arrays (no per-frame allocation) ─────────────────
  // compPrm: f32 view over 48 bytes (12 floats); the u32 view aliases the same
  // ArrayBuffer for the integer fields (n / frame / mode).
  const prmF32 = new Float32Array(COMP_PRM_BYTES / 4);
  const prmU32 = new Uint32Array(prmF32.buffer);
  // camBuf: f32 view over 160 bytes (40 floats); u32 aliases for `mode`.
  const camF32 = new Float32Array(CAM_BYTES / 4);
  const camU32 = new Uint32Array(camF32.buffer);

  // ── Mutable internal state (the one allowed mutable shell) ─────────────────
  const reseed = createReseedLatch();
  let field: FlowField | null = null;
  // mat4.identity() — wgpu-matrix's create() returns zeros, but this default
  // must be identity (it's read by encodeCompute before a field loads).
  let modelMatrix = mat4.identity();
  // Travelling-pulse accumulator for streamline mode; an internal counter
  // advanced by dtSec * flowSpeed (real elapsed seconds), kept off the
  // settings store.
  let phase = 0;
  // Per-frame counter, self-incremented each encodeCompute (mirrors
  // volumeFieldRenderer's internal frame counter — there is no engine-level
  // frame counter to thread). Salts the per-particle RNG so spawn jitter and
  // wander vary frame to frame. Stored as a u32 (wraps at 2^32 via `>>> 0`);
  // the WGSL reads it as `Prm.frame: u32`.
  let frame = 0;
  // Timestamp of the previous encodeCompute; null until the first call. See
  // flowFrameDeltaSec for what that null means.
  let lastNowMs: number | null = null;
  // Built in upload once the velocity texture view + sampler exist.
  let computeBindGroup: GPUBindGroup | null = null;

  function modeCode(flow: FlowSettings): number {
    return flow.mode === 'streamline' ? MODE_STREAMLINE : MODE_ADVECT;
  }

  const renderer: FlowFieldRenderer = {
    label: 'flowFieldRenderer',

    upload(cube: ScalarCube): void {
      // Upload the decoded cube to a 3D texture via the shared loader, using the
      // renderer's own device (the device stays encapsulated — the caller hands
      // us a cube, mirroring volumeFieldRenderer.upload). Idempotent re-set:
      // drop the prior field's texture before adopting the new one.
      if (field) field.dispose();
      const next = flowFieldFromCube(device, cube);
      field = next;

      // Place the cube in world space. Flow cubes ship axis-aligned (identity
      // rotation); the meta carries frame + geometry.
      modelMatrix = buildCubeModelMatrix({
        frameKind: next.meta.frameKind,
        rotation: [0, 0, 0, 1] as Vec4,
        origin: next.meta.origin,
        voxelSize: next.meta.voxelSizeMpc,
        dims: [next.meta.n, next.meta.n, next.meta.n],
      });
      // No invModel is kept: the integrator works entirely in grid [0,1]³ space
      // (the velocity texture's native space), so the inverse model matrix is
      // never needed. IF a future change samples the field along a
      // WORLD-space ray, build invModel there — and note `invModel * unitWorldDir`
      // is NOT unit length when the model has scale, so it MUST be renormalised
      // before its length is used as a distance (a documented project hazard).

      // (Re)build the single shared compute bind group now that the velocity
      // texture view + sampler are available. Reused for all three pipelines.
      computeBindGroup = device.createBindGroup({
        label: 'flow-compute-bg',
        layout: computeBgl,
        entries: [
          { binding: 0, resource: { buffer: part } },
          { binding: 1, resource: next.textureView },
          { binding: 2, resource: next.sampler },
          { binding: 3, resource: { buffer: compPrm } },
          { binding: 4, resource: { buffer: trail } },
          { binding: 5, resource: { buffer: acc } },
        ],
      });

      // A freshly-loaded field must seed before its first integrate.
      reseed.arm();
    },

    maybeReseed(): void {
      reseed.arm();
    },

    fieldLoaded(): boolean {
      return field !== null;
    },

    encodeCompute(encoder: GPUCommandEncoder, flow: FlowSettings, nowMs: number): void {
      if (field === null || !computeBindGroup) return;
      // Clamp every knob to its GPU-safe bound once, at the point of use — the
      // store holds raw intent; this renderer owns its buffer + loop limits.
      const f = clampFlowParams(flow);
      const n = f.count;

      // Elapsed seconds drive the streamline pulse phase (harmless in advect
      // mode) and, below, both the age step and the head march distance — so
      // speed and lifetime read in seconds whatever the render frame rate.
      frame = (frame + 1) >>> 0;
      const dtSec = flowFrameDeltaSec(nowMs, lastNowMs);
      lastNowMs = nowMs;
      phase += dtSec * f.flowSpeed;

      // Write compPrm ONCE — serves both the optional seed pass and the
      // integrate pass (see module header). The seed kernel reads only n / frame / bias;
      // the integrators read the rest. streamline ignores headStep / wander
      // in-shader, so always packing them is harmless.
      //   dt f32@0, trailStep f32@4, headStep f32@8, n u32@12, frame u32@16,
      //   mode u32@20, bias f32@24, wander f32@28 (buffer padded to 48 bytes).
      prmF32[0] = dtSec;
      // trailStep is already floored at MIN_TRAIL_STEP by clampFlowParams — the
      // single home of the GPU-hang guard.
      prmF32[1] = f.trail;
      // Grid units to march this frame = speed-per-second * elapsed seconds.
      // The shader clamps `toGo = min(headStep, trailStep * TRAIL)` (compute.wesl),
      // so a long dtSec after a stall is capped, never spun into a long loop —
      // that clamp is what makes a variable headStep (and so a variable dtSec) safe.
      prmF32[2] = f.flowSpeed * HEAD_SPEED_SCALE * dtSec;
      prmU32[3] = n;
      prmU32[4] = frame;
      prmU32[5] = modeCode(f);
      prmF32[6] = f.densityBias;
      prmF32[7] = f.wander;
      device.queue.writeBuffer(compPrm, 0, prmF32);

      const dispatchCount = Math.ceil(n / WORKGROUP_SIZE);

      // Seed pass — only when a reseed is pending (then cleared). WebGPU
      // inserts the storage barrier between this and the integrate pass below.
      if (reseed.consume()) {
        const seedPass = encoder.beginComputePass();
        seedPass.setPipeline(seedPipeline);
        seedPass.setBindGroup(0, computeBindGroup);
        seedPass.dispatchWorkgroups(dispatchCount);
        seedPass.end();
      }

      // Integrate pass — advect or streamline per flow.mode.
      const integrate = f.mode === 'streamline' ? streamlinePipeline : advectPipeline;
      const pass = encoder.beginComputePass();
      pass.setPipeline(integrate);
      pass.setBindGroup(0, computeBindGroup);
      pass.dispatchWorkgroups(dispatchCount);
      pass.end();
    },

    draw(
      pass: GPURenderPassEncoder,
      viewProj: Mat4,
      viewportPx: Vec2,
      flow: FlowSettings,
      opacity: number,
    ): void {
      if (field === null) return;
      // Clamp at point of use (see encodeCompute) — the draw instance count must
      // never exceed the fixed MAX_PARTICLES-sized buffer.
      const f = clampFlowParams(flow);

      // Cam uniform byte layout (160-byte buffer; struct uses through byte 152):
      //   mvp              mat4 @ 0   (floats 0..15)  = viewProj
      //   model            mat4 @ 64  (floats 16..31) = modelMatrix
      //   width            f32  @ 128 (float 32)      = RIBBON_WIDTH
      //   aspect           f32  @ 132 (float 33)
      //   phase            f32  @ 136 (float 34)
      //   mode             u32  @ 140 (uint 35)
      //   intensity        f32  @ 144 (float 36)
      //   boundaryFadeWidth f32 @ 148 (float 37)
      camF32.set(viewProj, 0);
      camF32.set(modelMatrix, 16);
      camF32[32] = RIBBON_WIDTH;
      camF32[33] = viewportPx[0] / viewportPx[1];
      camF32[34] = phase;
      camU32[35] = modeCode(f);
      // Fold the layer fade opacity into the pre-blend intensity — the vertex
      // stage already multiplies by cam.intensity, so no shader change.
      camF32[36] = f.intensity * opacity;
      camF32[37] = f.boundaryFadeWidth;
      device.queue.writeBuffer(camBuf, 0, camF32);

      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderBindGroup);
      pass.draw(2 * TRAIL, f.count);
    },

    destroy(): void {
      part.destroy();
      trail.destroy();
      acc.destroy();
      compPrm.destroy();
      camBuf.destroy();
      field?.dispose();
    },
  };

  // `satisfies Renderer` confirms the shared label+destroy contract at compile
  // time without widening the static type consumers see.
  renderer satisfies Renderer;
  return renderer;
}
