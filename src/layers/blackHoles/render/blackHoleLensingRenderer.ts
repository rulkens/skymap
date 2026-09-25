/**
 * blackHoleLensingRenderer — the black-hole lens pass: one fullscreen-triangle
 * draw per view classifying capture/escape/annulus rays against the
 * deflection LUT and the sky cubemap. Structural precedent: `bodyGlintRenderer.ts`.
 *
 * LANDMINE — the LUT's captured samples are IEEE `Infinity`, which a
 * fast-math compiler need not preserve, so they upload as
 * `CAPTURE_SENTINEL_RAD` and the fragment threshold-tests instead.
 *
 * LANDMINE — the LUT is an N×1 `texture_2d`: `textureSampleLevel` has no 1D
 * overload and WebKit rejects the `texture_1d` Chrome accepts.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { BlackHoleLensingRenderer } from '../@types/BlackHoleLensingRenderer';
import type { SchwarzschildDeflectionLut } from '../../../@types/lensing/SchwarzschildDeflectionLut';
import vsCode from '../../../services/gpu/shaders/bodies/blackHoleLensing/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/blackHoleLensing/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { PREMULTIPLIED_OVER_BLEND } from '../../../services/gpu/lib/blendStates';
import { buildSchwarzschildDeflectionLut } from '../../../utils/lensing/buildSchwarzschildDeflectionLut';
import { BLACK_HOLE_LENSING_UNIFORM_FLOATS } from '../../../utils/gpu/packBlackHoleLensingUniforms';

// Dense enough for the fragment's 2-tap lerp to look smooth near the critical
// impact parameter; quadrature is cheap CPU-side, so no reason to skimp.
const LUT_SAMPLE_COUNT = 512;

// 1000 rad: finite, and far beyond any bend angle the LUT can produce.
const CAPTURE_SENTINEL_RAD = 1000;

function createLutTexture(device: GPUDevice, lut: SchwarzschildDeflectionLut): GPUTexture {
  const texture = device.createTexture({
    label: 'black-hole-lensing-lut-texture',
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

export function createBlackHoleLensingRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): BlackHoleLensingRenderer {
  const lut = buildSchwarzschildDeflectionLut(LUT_SAMPLE_COUNT);
  const lutTexture = createLutTexture(device, lut);
  const lutView = lutTexture.createView({ label: 'black-hole-lensing-lut-view' });

  // Sized off the packer's own float count, so a new struct field can't leave
  // this buffer one `writeBuffer` validation error short at runtime.
  const uniformBuffer = device.createBuffer({
    label: 'black-hole-lensing-uniform-buffer',
    size: BLACK_HOLE_LENSING_UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const skySampler = device.createSampler({
    label: 'black-hole-lensing-sky-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'black-hole-lensing-bgl',
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

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'blackHoleLensing.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'blackHoleLensing.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'black-hole-lensing-pipeline',
    layout: device.createPipelineLayout({
      label: 'black-hole-lensing-pipeline-layout',
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

    // skyCubemapView changes every frame (see BlackHoleLensingRenderer.d.ts);
    // rebuilding the whole group here keeps this one call site simple.
    const bindGroup = device.createBindGroup({
      label: 'black-hole-lensing-bg',
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
    // Three vertices, one fullscreen triangle — the vertex stage derives
    // each corner's ray from this view's own frustum tangents.
    pass.draw(3);
  }

  function destroy(): void {
    lutTexture.destroy();
    uniformBuffer.destroy();
  }

  const renderer: BlackHoleLensingRenderer = {
    label: 'blackHoleLensingRenderer',
    lut,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
