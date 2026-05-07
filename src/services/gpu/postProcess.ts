/**
 * postProcess — single module owning the HDR offscreen target and the
 * tone-map post-process that writes its contents into the swap chain.
 *
 * ### Why one module
 *
 * Pre-Phase-4, the HDR texture and the tone-map pipeline lived in two
 * separate modules (`hdrTarget.ts`, `toneMapPass.ts`) and two separate
 * engine-state fields.  They are conceptually one pipeline stage —
 * "every visible draw pass writes into a shared rgba16float target,
 * then the post-process tone-maps it into the swap chain".  Wiring
 * them through the engine as two pieces meant two construction sites,
 * two destroy sites, two resize calls (only one of which was actually
 * needed — the tone-map pass holds no size-dependent state), and two
 * arguments through `renderFrame`.  Collapsing them removes that
 * ceremony without losing any of the rationale, which is why this
 * docstring carries forward the multi-paragraph "why" comments from
 * the merged modules verbatim.
 *
 * ### Why the HDR target lives here at all
 *
 * The HDR target's lifetime is "as long as the canvas size is
 * constant" — it gets thrown away and recreated on resize.  Keeping
 * that lifecycle outside the renderer classes (which own pipelines,
 * vertex buffers, and other long-lived resources) avoids tangling
 * re-creation paths.  The engine's resize handler calls
 * `postProcess.resize(...)` once per resize and the new view
 * propagates through the per-frame `draw(...)` calls.
 *
 * ### Why rgba16float and not rgba32float
 *
 * 16-bit half-float is the WebGPU minimum for sampleable + renderable
 * floating-point textures; 32-bit float requires the
 * `float32-filterable` feature on most platforms.  Half-float gives us
 * ~5 decimal digits of precision and a range of ±65 504, which is more
 * than enough for our additive billboard math (per-fragment alpha
 * contributions in [0, 1], accumulating to peaks of maybe a few hundred
 * in the densest cluster cores before tone-mapping).
 *
 * ### Why TEXTURE_BINDING + RENDER_ATTACHMENT
 *
 * RENDER_ATTACHMENT lets the points/quads/disks pipelines write into
 * it.  TEXTURE_BINDING lets the tone-map fragment shader sample from
 * it.  Both flags are required on the same texture — they're set as a
 * bitmask because WebGPU descriptors don't support "sample-or-render"
 * tagging after creation.
 *
 * ### Why no depth attachment
 *
 * An earlier revision (commit `716eb6b`) added a `depth24plus`
 * companion texture so the Milky Way impostor could be occluded by
 * per-galaxy thumbnail / disk overlays via depth-test.  Commit
 * `28aced5` then switched every overlay pipeline to pure additive
 * blending (`srcFactor: 'one', dstFactor: 'one'`) with
 * `depthWriteEnabled: false`, which makes ordering moot: A+B = B+A,
 * so no occlusion is needed.  At that point the depth buffer became
 * dead infrastructure — every frame cleared it to 1.0 and nothing
 * ever wrote a different value.  Removed the attachment to drop the
 * per-frame clear, the GPU memory, and the cross-cutting "every
 * pipeline must declare matching depthStencil state" constraint that
 * already bit us once during HMR.  If a future pass needs depth
 * (e.g. a truly opaque overlay), it can be added back at that point.
 *
 * ### Why post-process tone-map, not in-shader per pipeline
 *
 * Every renderer (point, quad, disk) writes its own HDR contribution
 * into the same target with additive blending.  Doing tone-mapping in
 * each renderer's fragment stage would tone-map *each contribution*
 * independently — but tone-mapping is a non-linear operation, so
 * `tonemap(a + b) ≠ tonemap(a) + tonemap(b)`.  The whole point of the
 * HDR pass is to let contributions accumulate linearly and *then*
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

// `?static` runs the WESL linker at build time and returns a flat WGSL
// string. For toneMap there are no `import` statements yet, so the
// linker output is byte-identical to the previous `?raw` import — but
// wiring `?static` here first makes this the smoke test for the whole
// wesl-plugin tooling chain. Later tasks add real imports.
import toneMapWgsl from './shaders/toneMap.wesl?static';
import { ToneMapCurve } from '../../data/toneMapCurve';

/**
 * Plain `{ width, height }` pair, kept local to this module.  We
 * deliberately don't reuse a DOM type like `DOMRectReadOnly` — those
 * carry extra fields (x, y, top, ...) the GPU descriptor doesn't
 * want, and the pinhole-explicit name makes the resize call site
 * ("`resize({ width, height })`") read like English.
 */
export type Size = { readonly width: number; readonly height: number };

/** Default whitepoint for Reinhard-extended — input value where the curve reaches 1.0. */
const DEFAULT_WHITEPOINT = 4.0;

/** Default softness for asinh stretch — higher = more aggressive low-end lift. */
const DEFAULT_ASINH_SOFTNESS = 10.0;

// ─── JS-mirror tone-map curves ────────────────────────────────────────────
//
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

// ─── Aggregate factory ────────────────────────────────────────────────────

export type PostProcess = {
  /** Current HDR colour-attachment view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /** Recreate the HDR texture at a new size.  Old view becomes invalid. */
  resize(size: Size): void;
  /**
   * Encode the fullscreen tone-map blit `hdrView → swapView` onto the
   * caller's command encoder.  Begins+ends its own render pass.  The
   * HDR view used as the input is the one the aggregate currently
   * owns — callers no longer pass it explicitly, which prevents a
   * stale-after-resize view from leaking back in.
   */
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
  ): void;
  /** Tear down — releases both the HDR texture and the tone-map uniform buffer. */
  destroy(): void;
};

export function createPostProcess(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  size: Size,
): PostProcess {
  // ── HDR target (lifecycle-controlled by resize/destroy) ───────────────
  let hdrTexture: GPUTexture | null = null;
  let hdrView: GPUTextureView | null = null;

  function allocateHdr(s: Size): void {
    if (hdrTexture) hdrTexture.destroy();
    hdrTexture = device.createTexture({
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    hdrView = hdrTexture.createView();
  }

  allocateHdr(size);

  // ── Tone-map pipeline (built once, lives until destroy) ───────────────
  //
  // `label` shows up in `getCompilationInfo` diagnostics and in
  // browser-devtools error reports, which makes it much easier to tell
  // *which* shader broke when several modules fail in the same frame.
  const module = device.createShaderModule({ code: toneMapWgsl, label: 'toneMap' });

  // Why log the linked WGSL here, only in dev?
  //
  // Chrome's WGSL compiler reports error line numbers against the
  // *linked* output that wesl-plugin produces, not the source `.wesl`
  // module. Until wesl-plugin gains sourcemap support, the only way to
  // map "error at line 142" back to a source file is to read the linked
  // string ourselves — so we dump it on any compile error. We dump it
  // only in dev (gated by `import.meta.env.DEV`) because production
  // bundles strip dead branches under that flag and we don't want to
  // ship the shader source twice (once as the module, once as a console
  // log) in the prod build. `getCompilationInfo` is a Promise; we don't
  // await it so module creation stays synchronous.
  if (import.meta.env.DEV) {
    void module.getCompilationInfo().then((info) => {
      if (info.messages.some((m) => m.type === 'error')) {
        console.groupCollapsed('[toneMap] linked WGSL (for error line lookup)');
        console.log(toneMapWgsl);
        console.groupEnd();
      }
    });
  }

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
    get view(): GPUTextureView {
      if (!hdrView) throw new Error('postProcess: view accessed after destroy');
      return hdrView;
    },
    resize(s: Size): void {
      allocateHdr(s);
    },
    draw(encoder, swapView, exposure, curve): void {
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
          { binding: 0, resource: hdrView! },
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
      if (hdrTexture) hdrTexture.destroy();
      hdrTexture = null;
      hdrView = null;
      uniformBuffer.destroy();
    },
  };
}
