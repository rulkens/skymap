/**
 * sgrAStarLensingRenderer — the Sgr A* lens pass: one billboard draw per
 * frame classifying capture/escape/annulus rays against the Task 9 LUT and
 * the Task 11 sky cubemap. Structural precedent: `bodyGlintRenderer.ts` (a
 * small single-draw body renderer, explicit non-'auto' bind group layout,
 * `label:` on every resource).
 *
 * ### The LUT texture — `Infinity` encoding (Task 13's brief, decided here)
 *
 * `buildSchwarzschildDeflectionLut`'s captured samples are IEEE `Infinity`.
 * That round-trips through an `r32float` texel's raw bits exactly, but a
 * fast-math shader compiler is not guaranteed to preserve Infinity
 * arithmetic (this codebase already treats float edge-case flushing as a
 * live landmine — see the renderer landmines). Rather than ship raw
 * Infinity through the upload and rely on GPU-side comparisons behaving,
 * this helper replaces every `Infinity` sample with `CAPTURE_SENTINEL_RAD`
 * — a large finite value comfortably separated from any real (finite)
 * quadrature result — before `writeTexture`. The fragment's
 * `CAPTURE_THRESHOLD_RAD` (half the sentinel) is the GPU-side counterpart;
 * the two constants don't need to agree exactly, only that the threshold
 * sits between the largest real bend angle and the sentinel.
 *
 * ### Why a `texture_2d<f32>` of height 1, not `texture_1d`
 *
 * docs/RENDERER.md's iOS/WebKit landmine: `textureSampleLevel` has no 1D
 * overload, and WebKit rejects `texture_1d` sampling Chrome accepts. Every
 * 1D LUT in this codebase is an N×1 `texture_2d` instead — this one follows
 * the same convention.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { SgrAStarLensingRenderer } from '../../../../@types/rendering/SgrAStarLensingRenderer';
import type { SchwarzschildDeflectionLut } from '../../../../@types/lensing/SchwarzschildDeflectionLut';
import vsCode from '../../shaders/bodies/sgrAStarLensing/vertex.wesl?static';
import fsCode from '../../shaders/bodies/sgrAStarLensing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';
import { buildSchwarzschildDeflectionLut } from '../../../../utils/lensing/buildSchwarzschildDeflectionLut';

/**
 * LUT texel count: dense enough that the fragment's 2-tap lerp reads as
 * smooth across the escape region without the strong near-critical
 * curvature aliasing (Simpson quadrature is cheap CPU-side and this runs
 * once at construction, so there is no reason to skimp).
 */
export const LUT_SAMPLE_COUNT = 512;

/**
 * Stand-in for a captured LUT sample once uploaded to the `r32float`
 * texture — see the module header's "Infinity encoding" section. Comfortably
 * larger than any finite bend angle `buildSchwarzschildDeflectionLut` can
 * produce (the quadrature stays a low-two-digit-radian value even one grid
 * step from the critical impact parameter) and comfortably smaller than
 * `f32`'s own range, so the value survives the GPU upload with no risk of
 * becoming `inf` itself.
 */
export const CAPTURE_SENTINEL_RAD = 1000;

function createLutTexture(device: GPUDevice, lut: SchwarzschildDeflectionLut): GPUTexture {
  const texture = device.createTexture({
    label: 'sgr-a-star-lensing-lut-texture',
    format: 'r32float',
    dimension: '2d',
    size: { width: lut.samples.length, height: 1 },
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // Infinity -> CAPTURE_SENTINEL_RAD, everything else passes through
  // unchanged — see the module header.
  const uploadable = new Float32Array(lut.samples.length);
  for (let i = 0; i < lut.samples.length; i++) {
    const sample = lut.samples[i]!;
    uploadable[i] = Number.isFinite(sample) ? sample : CAPTURE_SENTINEL_RAD;
  }
  // No 256-byte bytesPerRow alignment requirement here — that constraint is
  // copyBufferToTexture/copyTextureToBuffer only; queue.writeTexture is exempt.
  device.queue.writeTexture(
    { texture },
    uploadable,
    { bytesPerRow: lut.samples.length * 4 },
    { width: lut.samples.length, height: 1 },
  );
  return texture;
}

export function createSgrAStarLensingRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): SgrAStarLensingRenderer {
  const lut = buildSchwarzschildDeflectionLut(LUT_SAMPLE_COUNT);
  const lutTexture = createLutTexture(device, lut);
  const lutView = lutTexture.createView({ label: 'sgr-a-star-lensing-lut-view' });

  // ── Uniform buffer (176 bytes, byte-exact with SgrAStarLensingUniforms —
  // TEMPORARILY grown from 144 for Task 15's Tier-2 DebugPanel knobs; shrinks
  // back at the removal step once Task 17 converges) ──
  const uniformBuffer = device.createBuffer({
    label: 'sgr-a-star-lensing-uniform-buffer',
    size: 176,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const skySampler = device.createSampler({
    label: 'sgr-a-star-lensing-sky-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'sgr-a-star-lensing-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        // r32float is not sampler-filterable by default — 'unfilterable-float'
        // matches the fragment's textureLoad-only access (see the module header).
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'unfilterable-float' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: 'cube' },
      },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'sgrAStarLensing.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'sgrAStarLensing.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'sgr-a-star-lensing-pipeline',
    layout: device.createPipelineLayout({
      label: 'sgr-a-star-lensing-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat, blend: PREMULTIPLIED_OVER_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
    // NO depthStencil: the hdr target has no depth attachment.
  });

  function draw(
    pass: GPURenderPassEncoder,
    uniforms: Float32Array,
    skyCubemapView: GPUTextureView,
  ): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Rebuilt every draw because `skyCubemapView` is the caller's fresh
    // per-frame read of `RenderTargets.cubeViewOf` — the SAME reason
    // `additiveUpsample`'s bind group is rebuilt per draw rather than cached
    // (a cached bind group risks binding a view a `reconcile()` replaced).
    // The LUT view and sampler are stable renderer-owned resources; rebuilding
    // the whole group anyway keeps this one call site simple, and one
    // bind-group alloc per frame for a single-draw pass is negligible.
    const bindGroup = device.createBindGroup({
      label: 'sgr-a-star-lensing-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: lutView },
        { binding: 2, resource: skyCubemapView },
        { binding: 3, resource: skySampler },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // Six vertices, one billboard quad — the vertex stage maps
    // vertex_index 0..5 through lib/billboard's quadCorner.
    pass.draw(6);
  }

  function destroy(): void {
    lutTexture.destroy();
    uniformBuffer.destroy();
  }

  const renderer: SgrAStarLensingRenderer = {
    label: 'sgrAStarLensingRenderer',
    lut,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
