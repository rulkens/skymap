/**
 * toneMapPass — fullscreen post-process that compresses HDR values
 * from the rgba16float offscreen target into the displayable [0, 1]
 * range of the swap chain.
 *
 * ### Why post-process, not in-shader per pipeline
 *
 * Every renderer (point, quad, disk) writes its own HDR contribution
 * into the same target with additive blending.  Doing tone-mapping
 * in each renderer's fragment stage would tone-map *each contribution*
 * independently — but tone-mapping is a non-linear operation, so
 * `tonemap(a + b) ≠ tonemap(a) + tonemap(b)`.  The whole point of
 * the HDR pass is to let contributions accumulate linearly and *then*
 * compress.  Hence: one post-process at the end of the frame.
 *
 * ### Five curves, one pass
 *
 * The shader branches on a `curve: u32` uniform between five curves
 * (Linear, Reinhard-extended, Asinh, Gamma 2.0, ACES filmic).
 * Switching curves at runtime is a single `device.queue.writeBuffer`
 * of 4 bytes — no pipeline rebuild, no shader recompile, no
 * perceptible lag.  See the WGSL shader's header comment for the
 * rationale on each curve.
 *
 * ### JS-mirror curves for unit tests
 *
 * Each WGSL curve has a JS twin exported below (`linearClamp`,
 * `reinhardExtended`, ...).  Their math matches the shader byte-for-
 * byte so a Vitest unit test catches a regression without booting
 * WebGPU.  Keep them in sync — if the WGSL changes, the JS must
 * change.  The shared `tests/services/gpu/toneMap.test.ts` exercises
 * monotonicity, asymptotic behaviour, and curve-specific shape.
 */

import toneMapWgsl from './shaders/toneMap.wgsl?raw';
import { ToneMapCurve } from '../../data/toneMapCurve';

/** Default whitepoint for Reinhard-extended — input value where the curve reaches 1.0. */
const DEFAULT_WHITEPOINT = 4.0;

/** Default softness for asinh stretch — higher = more aggressive low-end lift. */
const DEFAULT_ASINH_SOFTNESS = 10.0;

// JS-mirrors of every WGSL curve.  Kept by-hand-in-sync so the unit
// tests catch shader regressions before they ship.

export function linearClamp(c: number, exposure: number): number {
  return Math.max(0, Math.min(1, c * exposure));
}

export function reinhardExtended(
  c: number,
  exposure: number,
  whitepoint: number = DEFAULT_WHITEPOINT,
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
  softness: number = DEFAULT_ASINH_SOFTNESS,
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

export type ToneMapPass = {
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    hdrView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
  ): void;
  destroy(): void;
};

export function createToneMapPass(device: GPUDevice, swapFormat: GPUTextureFormat): ToneMapPass {
  const module = device.createShaderModule({ code: toneMapWgsl });

  // Why nearest, not linear?  The HDR texture is the same resolution
  // as the swap chain (we resize it in lockstep) so the fullscreen
  // pass samples each texel exactly once at its centre.  Linear
  // filtering would just average a texel with itself — pointless
  // work, and on some GPUs `linear` requires `'float32-filterable'`
  // even on rgba16float.  `nearest` is universally supported.
  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  // Uniform layout: [exposure: f32, whitepointSq: f32, asinhSoftness: f32,
  // curve: u32] — 16 bytes total, naturally 16-byte aligned.
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      targets: [{ format: swapFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Mixed f32/u32 uniform — pack via two views over the same ArrayBuffer.
  const uniformBytes = new ArrayBuffer(16);
  const uniformF32 = new Float32Array(uniformBytes);
  const uniformU32 = new Uint32Array(uniformBytes);

  return {
    draw(encoder, swapView, hdrView, exposure, curve) {
      uniformF32[0] = exposure;
      uniformF32[1] = DEFAULT_WHITEPOINT * DEFAULT_WHITEPOINT;
      uniformF32[2] = DEFAULT_ASINH_SOFTNESS;
      uniformU32[3] = curve >>> 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      // Bind group is recreated per draw because `hdrView` can change
      // when the HDR target is resized — caching across resize would
      // bind a stale (destroyed) view.  The cost is one allocation
      // per frame; trivial compared to the actual fullscreen blit.
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: hdrView },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      // Three vertices, one instance — the covering-triangle.
      pass.draw(3, 1, 0, 0);
      pass.end();
    },
    destroy(): void {
      uniformBuffer.destroy();
    },
  };
}
