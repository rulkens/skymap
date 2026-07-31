/**
 * compositor — the single 'merge one offscreen texture into a target'
 * primitive. Every historical variant of that operation collapses into
 * one draw through this factory:
 *
 *   - HDR → swap chain with tone-mapping   (blend 'replace', tone set)
 *   - foreground LDR layer OVER the swap    (blend 'over', tone set)
 *   - additive field contribution → HDR     (blend 'additive', tone null)
 *
 * Tone-null is the general pass-through for a source that is already
 * display-ready; the foreground-over composite is the one exception — it
 * shares the HDR composite's tone object, so it runs tone-enabled too.
 *
 * Before this primitive, each of those lived in its own bespoke pass
 * (`postProcess.ts`, a foreground compositor, `additiveUpsample.ts`) with
 * three copies of the covering-triangle vertex stage, three sampler
 * declarations, and three near-identical pipeline builds. The compositor
 * unifies the pipeline plumbing while keeping the parts that genuinely
 * differ — blend mode and dst format — as *data* in a table.
 *
 * ### Why a pipeline cache keyed by (blend, dstFormat)
 *
 * A render pipeline is immutable once built: its blend state and target
 * format are baked in. The compositor may be asked for any (blend,
 * dstFormat) combination, so it builds each on first use and caches it.
 * The key includes the dst format because 'replace' into the swap chain
 * and 'replace' into the HDR target are two distinct pipelines even
 * though they share a blend mode — the format is part of the pipeline's
 * immutable identity. The alternative — pre-building every combination
 * at construction — wastes GPU objects on combinations no consumer uses.
 *
 * ### Why one uniform buffer PER cache entry, not one shared buffer
 *
 * A single shared uniform buffer would make two composite draws in the
 * same frame race: `queue.writeBuffer` + `submit` ordering is not
 * guaranteed to interleave, so the second draw's uniform write can land
 * before the first draw reads it — last-write-wins garbage (the exact
 * bite documented in CLAUDE.md 'Things that have bitten us'). Giving
 * each (blend, dstFormat) pipeline its own buffer means a frame that
 * does 'replace' then 'over' writes two independent buffers with no
 * cross-contamination, because 'replace' and 'over' are distinct cache
 * keys.
 *
 * That guarantee is per-key, not per-draw: two composite draws that
 * share one (blend, dstFormat) key in the same frame still share that
 * key's single buffer, so the second `writeBuffer` overwrites the first
 * before either draw's commands execute at `submit` — both draws run
 * with whichever uniforms were written last. Every current caller draws
 * each key at most once per frame, so this hasn't bitten yet. A future
 * consumer that draws the same key more than once per frame — e.g.
 * several additive field composites that all key to `additive:hdr` —
 * will need a per-draw ring or pool of buffers for that key before it
 * can share it safely within a frame.
 *
 * ### JS-mirror curves for unit tests
 *
 * Each WGSL tone-map curve has a JS twin exported below (`linearClamp`,
 * `reinhardExtended`, ...). Their math matches `lib/tonemap.wesl`
 * byte-for-byte so a Vitest unit test catches a shader regression
 * without booting WebGPU. The shader owner (this module, now that the
 * tone-map draw lives here) owns the mirror — keep them in sync: if the
 * WGSL changes, the JS must change. `tests/services/gpu/passes/toneMap.test.ts`
 * exercises monotonicity, asymptotic behaviour, and curve-specific shape.
 */

// `?static` runs the WESL linker at build time and returns a flat WGSL
// string. Vertex + fragment are split (mirroring the toneMap/ and
// milkyWay/ splits) so each stage compiles a strictly-smaller
// GPUShaderModule from disjoint source; both import their shared structs
// from `shaders/compositor/io.wesl` so the vertex-to-fragment interface
// stays byte-identical.
import vsCode from '../shaders/compositor/vertex.wesl?static';
import fsCode from '../shaders/compositor/fragment.wesl?static';
import { clampExposure } from '../../../utils/tonemap/clampExposure';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import { REINHARD_WHITEPOINT, ASINH_SOFTNESS } from '../../../data/toneMapCurve';
import type { Compositor } from '../../../@types/rendering/Compositor';
import type { CompositeBlend } from '../../../@types/rendering/CompositeBlend';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import type { Renderer } from '../../../@types/rendering/Renderer';

// ─── JS-mirror tone-map curves ────────────────────────────────────────────
//
// JS-mirrors of every WGSL curve in `lib/tonemap.wesl`.  Kept
// by-hand-in-sync so the unit tests catch shader regressions before they
// ship.

export function linearClamp(c: number, exposure: number): number {
  return Math.max(0, Math.min(1, c * exposure));
}

export function reinhardExtended(
  c: number,
  exposure: number,
  whitepoint: number = REINHARD_WHITEPOINT,
): number {
  const x = c * exposure;
  const wsq = whitepoint * whitepoint;
  // The classic Reinhard-extended formula c·(1 + c/W²) / (1 + c) reaches
  // exactly 1.0 at the whitepoint; *above* the whitepoint it grows
  // unboundedly toward c/W² (~6.25 at c=100, W=4).  We clamp for safety
  // so a runaway peak doesn't produce a supersaturated swap-chain pixel
  // which (depending on the platform's `bgra8unorm` clipping behaviour)
  // can end up as a flat white tile rather than a smooth roll-off.
  const y = (x * (1 + x / wsq)) / (1 + x);
  return Math.max(0, Math.min(1, y));
}

export function asinhStretch(
  c: number,
  exposure: number,
  softness: number = ASINH_SOFTNESS,
): number {
  const x = c * exposure;
  // The Lupton formula `asinh(k·c) / asinh(k)` reaches 1.0 at c=1; for
  // c>1 it grows logarithmically (slowly, but unbounded).  Clamp so a
  // bright outlier doesn't produce a >1 swap-chain value — same safety
  // contract as every other curve here.
  return Math.max(0, Math.min(1, Math.asinh(softness * x) / Math.asinh(softness)));
}

export function gamma2(c: number, exposure: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, c * exposure)));
}

export function acesFilmic(c: number, exposure: number): number {
  // Narkowicz 2015 closed-form ACES approximation.
  const x = c * exposure;
  const a = 2.51;
  const b = 0.03;
  const d = 2.43;
  const e = 0.59;
  const f = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (d * x + e) + f)));
}

// ─── Blend-state table ────────────────────────────────────────────────────
//
// Blend semantics are DATA, not branches: each mode maps to its GPU
// blend state (or `undefined` = no blending) and the `preserveAlpha`
// flag the shader reads.  Alpha is a *column* of this table, derived
// from the blend at pack time — never a separate draw argument, because
// coverage handling is a property of the blend mode, not of the caller.

const BLEND_TABLE: Record<
  CompositeBlend,
  { readonly blend: GPUBlendState | undefined; readonly preserveAlpha: 0 | 1 }
> = {
  // Overwrite the destination — no blending. The fragment forces alpha
  // 1.0 (preserveAlpha 0): the swap chain is premultiplied-alphaMode and
  // the tone-map consumer relies on an opaque result.
  replace: { blend: undefined, preserveAlpha: 0 },
  // Straight-alpha Porter-Duff OVER. The fragment emits un-premultiplied
  // colour and the blend hardware applies the src-alpha coverage multiply
  // — premultiplying in the shader too would double-multiply and darken
  // edges. Alpha composites so stacked translucent layers accumulate
  // coverage correctly (preserveAlpha 1).
  over: {
    blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    },
    preserveAlpha: 1,
  },
  // Additive — matches the scalar-volume pipeline's blend byte-for-byte
  // (see additiveUpsample.ts). Source coverage is carried straight
  // (preserveAlpha 1) so the sum of contributions is order-independent.
  additive: {
    blend: ADDITIVE_BLEND,
    preserveAlpha: 1,
  },
};

/**
 * createCompositor — build the unified composite primitive.
 *
 * `swapFormat` / `hdrFormat` are accepted for call-site stability but are no
 * longer used to derive the dst format: each draw now carries its own
 * `dstFormat`, resolved by the caller from the composite's dest target (see
 * `draw`). A blend no longer implies a single format — `over` can target the
 * swap chain OR the HDR buffer — so the format has to ride in per draw.
 *
 * @param init.device      GPU device (mockable in tests).
 * @param init.swapFormat  Retained for signature stability; unused here.
 * @param init.hdrFormat   Retained for signature stability; unused here.
 */
export function createCompositor(init: {
  device: GPUDevice;
  swapFormat: GPUTextureFormat;
  hdrFormat: GPUTextureFormat;
}): Compositor {
  const { device } = init;

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'compositor.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'compositor.fragment');

  // Why nearest, not linear?  The source and dst are the same resolution
  // (the HDR target resizes in lockstep with the swap chain), so the
  // fullscreen pass samples each texel exactly once at its centre.
  // Linear filtering would just average a texel with itself — pointless
  // work, and on some GPUs `linear` requires `'float32-filterable'` even
  // on rgba16float.  `nearest` is universally supported.
  const sampler = device.createSampler({
    label: 'compositor-sampler',
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'compositor-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'compositor-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  // Lazy pipeline + per-entry uniform-buffer cache. See module header for
  // both the key composition and the one-buffer-per-entry rationale. The dst
  // format is no longer derived from the blend — it arrives per draw from the
  // dest target, so the same blend can key two entries for two formats.
  const cache = new Map<string, { pipeline: GPURenderPipeline; uniformBuffer: GPUBuffer }>();

  // Mixed f32/u32 uniform — pack via two views over one 32-byte
  // ArrayBuffer. Lanes 6 and 7 (bytes 24..31) carry the extended-range
  // `hdrKnee` / `hdrHeadroom` — see the `if (tone)` / `else` branches
  // below. They stay zero in the tone-null / SDR case (a fresh ArrayBuffer
  // is zero-filled), satisfying the uniform 16-byte-stride requirement with
  // no unused padding left in the buffer.
  const uniformBytes = new ArrayBuffer(32);
  const uniformF32 = new Float32Array(uniformBytes);
  const uniformU32 = new Uint32Array(uniformBytes);

  function entryFor(
    blend: CompositeBlend,
    dstFormat: GPUTextureFormat,
  ): {
    pipeline: GPURenderPipeline;
    uniformBuffer: GPUBuffer;
  } {
    const key = `${blend}:${dstFormat}`;
    const existing = cache.get(key);
    if (existing) return existing;

    const pipeline = device.createRenderPipeline({
      label: `compositor-pipeline-${key}`,
      layout: pipelineLayout,
      vertex: { module: vsModule, entryPoint: 'vs' },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [{ format: dstFormat, blend: BLEND_TABLE[blend].blend }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const uniformBuffer = device.createBuffer({
      label: `compositor-uniform-${key}`,
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const entry = { pipeline, uniformBuffer };
    cache.set(key, entry);
    return entry;
  }

  const compositor: Compositor = {
    label: 'compositor',
    draw(
      pass: GPURenderPassEncoder,
      src: GPUTextureView,
      blend: CompositeBlend,
      tone: ToneMap | null,
      dstFormat: GPUTextureFormat,
    ): void {
      const entry = entryFor(blend, dstFormat);

      if (tone) {
        // Clamp at point of use: the store holds raw intent, this pass
        // owns the HDR-buffer / black-frame limits (see clampExposure).
        uniformF32[0] = clampExposure(tone.exposure);
        uniformF32[1] = REINHARD_WHITEPOINT * REINHARD_WHITEPOINT;
        uniformF32[2] = ASINH_SOFTNESS;
        uniformU32[3] = tone.curve >>> 0;
        uniformU32[4] = 1;
        // 0 unless the caller opted a swap chain into HDR (`renderFrame` only
        // sets these non-zero when `hdrActiveOf(ctx.renderTargets)` is true).
        uniformF32[6] = tone.hdrKnee;
        uniformF32[7] = tone.hdrHeadroom;
      } else {
        // No tone-map: exposure 1.0, curve params zeroed, toneEnabled 0.
        // The fragment takes the raw pass-through branch.
        uniformF32[0] = 1.0;
        uniformF32[1] = 0;
        uniformF32[2] = 0;
        uniformU32[3] = 0;
        uniformU32[4] = 0;
        uniformF32[6] = 0;
        uniformF32[7] = 0;
      }
      // preserveAlpha comes from the blend table, NOT the caller — alpha
      // handling is a property of the blend mode.
      uniformU32[5] = BLEND_TABLE[blend].preserveAlpha;
      device.queue.writeBuffer(entry.uniformBuffer, 0, uniformBytes);

      // Bind group is rebuilt per draw because `src` is recreated on
      // resize — caching across resize would bind a destroyed view (same
      // rationale as additiveUpsample.ts). One alloc per draw is trivial
      // against the fullscreen blit it carries.
      const bindGroup = device.createBindGroup({
        label: `compositor-bg-${blend}`,
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: entry.uniformBuffer } },
        ],
      });

      // No beginRenderPass here — the caller owns the pass (and its
      // timestampWrites). draw() only encodes into it.
      pass.setPipeline(entry.pipeline);
      pass.setBindGroup(0, bindGroup);
      // Three vertices, one instance — the covering triangle.
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      for (const { uniformBuffer } of cache.values()) {
        uniformBuffer.destroy();
      }
      cache.clear();
    },
  };

  compositor satisfies Renderer;
  return compositor;
}
