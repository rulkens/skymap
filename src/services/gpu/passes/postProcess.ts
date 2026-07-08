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
 * companion texture so the Milky Way layer could be occluded by
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
 * The JS twins of every WGSL curve (`linearClamp`, `reinhardExtended`,
 * ...) — plus the `DEFAULT_WHITEPOINT` / `DEFAULT_ASINH_SOFTNESS`
 * constants this pass packs into its uniform — now live in
 * `compositor.ts`, the module that owns the tone-map draw. This pass
 * imports the two constants transitionally until Task 4 folds its draw
 * into the compositor and this file goes away.
 */

// `?static` runs the WESL linker at build time and returns a flat WGSL
// string. The tone-map pass is split into vertex + fragment source
// files (mirroring the points/ and milkyWay/ splits) so each stage
// compiles a strictly-smaller GPUShaderModule from disjoint source.
// Both modules import their shared structs from `shaders/toneMap/io.wesl`
// so the vertex-to-fragment interface stays byte-identical.
import vsCode from '../shaders/toneMap/vertex.wesl?static';
import fsCode from '../shaders/toneMap/fragment.wesl?static';
import { ToneMapCurve } from '../../../data/toneMapCurve';
import { clampExposure } from '../../../utils/clampExposure';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
// Transitional import: the tone-map curve mirror + these two default
// constants moved to compositor.ts (the module that now owns the
// tone-map draw). This pass still packs its own uniform until Task 4
// folds it into the compositor, at which point this import is deleted.
import { DEFAULT_WHITEPOINT, DEFAULT_ASINH_SOFTNESS } from './compositor';
import type { Size } from '../../../@types/rendering/Size';
import type { PostProcess } from '../../../@types/rendering/PostProcess';

// ─── Aggregate factory ────────────────────────────────────────────────────

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
      label: 'hdr-target',
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
  // The helper additionally dumps the linked WGSL on compile errors in
  // dev mode — see `shaderCompileLogger.ts` for the rationale (Chrome's
  // WGSL compiler reports error line numbers against the linked output
  // that wesl-plugin produces, so the only way to map them back to a
  // source file is to read the linked string ourselves).
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'toneMap.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'toneMap.fragment');

  // Why nearest, not linear?  The HDR texture is the same resolution
  // as the swap chain (we resize it in lockstep) so the fullscreen
  // pass samples each texel exactly once at its centre.  Linear
  // filtering would just average a texel with itself — pointless
  // work, and on some GPUs `linear` requires `'float32-filterable'`
  // even on rgba16float.  `nearest` is universally supported.
  const sampler = device.createSampler({
    label: 'toneMap-sampler',
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  // Uniform layout: [exposure: f32, whitepointSq: f32, asinhSoftness: f32,
  // curve: u32] — 16 bytes total, naturally 16-byte aligned.
  const uniformBuffer = device.createBuffer({
    label: 'toneMap-uniform-buffer',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'toneMap-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'toneMap-pipeline',
    layout: device.createPipelineLayout({
      label: 'toneMap-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
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
    draw(encoder, swapView, exposure, curve, timingDescriptor): void {
      // Clamp at point of use: the store holds raw intent, this pass owns the
      // HDR-buffer / black-frame limits (see clampExposure).
      uniformF32[0] = clampExposure(exposure);
      uniformF32[1] = DEFAULT_WHITEPOINT * DEFAULT_WHITEPOINT;
      uniformF32[2] = DEFAULT_ASINH_SOFTNESS;
      uniformU32[3] = curve >>> 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      // Bind group is recreated per draw because `hdrView` can change
      // when the HDR target is resized — caching across resize would
      // bind a stale (destroyed) view.  The cost is one allocation
      // per frame; trivial compared to the actual fullscreen blit.
      const bindGroup = device.createBindGroup({
        label: 'toneMap-bg',
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
        // Per-pass GPU timing.  When `timingDescriptor` is undefined
        // (no `?gpuTimings` gate active), the field is omitted and
        // WebGPU treats it as "no timing requested".  The spread
        // pattern preserves byte-identity for the timing-disabled
        // path so the visual baseline snapshot is unchanged.
        ...(timingDescriptor ? { timestampWrites: timingDescriptor } : {}),
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
