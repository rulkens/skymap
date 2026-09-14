/**
 * prefilterCubeGgx — fill a probe cube's mips 1..N-1 from mip 0 with the GGX
 * lobe of roughness mip / (N - 1) (split-sum, Karis 2013): the mesh fragment
 * reads specular by mip and diffuse from the coarsest, so the chain must run
 * to the roughness-1 level. One render pass per (mip, face) in one command
 * buffer. The per-pass parameters sit in ONE dynamic-offset uniform buffer,
 * written once before the submit — a buffer rewritten between passes of the
 * same submit hands every pass the last write (`docs/RENDERER.md`).
 */

import prefilterCode from '../shaders/prefilterCube/prefilterCube.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// Hammersley taps per texel. The source is 128 px faces, so the roughness-1
// mip integrates a hemisphere of ~100k texels into one; fewer taps let a
// single bright sky texel swing the diffuse term the fragment reads there.
const PREFILTER_SAMPLES = 512;
// Dynamic uniform offsets must be multiples of the device's alignment limit,
// which WebGPU caps at 256.
const PARAMS_STRIDE_BYTES = 256;
// `PrefilterParams` in the shader: face u32, roughness f32, sampleCount u32, pad.
const PARAMS_BYTES = 16;
const CUBE_FACES = 6;

export function prefilterCubeGgx(device: GPUDevice, cube: GPUTexture): void {
  const levels = cube.mipLevelCount;
  if (levels <= 1) return;

  const module = createShaderModuleWithDevLog(device, prefilterCode, 'prefilterCube');

  // Filtering across the source's 128 px texels is what the taps rely on:
  // a nearest sampler would turn every lobe into a texel-shaped stipple.
  const sampler = device.createSampler({
    label: 'prefilterCube-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'prefilterCube-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: 'cube' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: PARAMS_BYTES },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'prefilterCube-pipeline',
    layout: device.createPipelineLayout({
      label: 'prefilterCube-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: cube.format }] },
    primitive: { topology: 'triangle-list' },
  });

  const passCount = (levels - 1) * CUBE_FACES;
  const params = new ArrayBuffer(passCount * PARAMS_STRIDE_BYTES);
  const paramsU32 = new Uint32Array(params);
  const paramsF32 = new Float32Array(params);
  for (let mip = 1; mip < levels; mip++) {
    for (let face = 0; face < CUBE_FACES; face++) {
      const base = (((mip - 1) * CUBE_FACES + face) * PARAMS_STRIDE_BYTES) / 4;
      paramsU32[base] = face;
      paramsF32[base + 1] = mip / (levels - 1);
      paramsU32[base + 2] = PREFILTER_SAMPLES;
    }
  }
  const paramsBuffer = device.createBuffer({
    label: 'prefilterCube-params',
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuffer, 0, params);

  const bindGroup = device.createBindGroup({
    label: 'prefilterCube-bg',
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: cube.createView({
          label: 'prefilterCube-src',
          dimension: 'cube',
          baseMipLevel: 0,
          mipLevelCount: 1,
        }),
      },
      { binding: 1, resource: sampler },
      { binding: 2, resource: { buffer: paramsBuffer, offset: 0, size: PARAMS_BYTES } },
    ],
  });

  const encoder = device.createCommandEncoder({ label: 'prefilterCube-encoder' });
  for (let mip = 1; mip < levels; mip++) {
    for (let face = 0; face < CUBE_FACES; face++) {
      const pass = encoder.beginRenderPass({
        label: `prefilterCube-pass-${mip}-${face}`,
        colorAttachments: [
          {
            view: cube.createView({
              label: `prefilterCube-dst-${mip}-${face}`,
              dimension: '2d',
              baseMipLevel: mip,
              mipLevelCount: 1,
              baseArrayLayer: face,
              arrayLayerCount: 1,
            }),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup, [((mip - 1) * CUBE_FACES + face) * PARAMS_STRIDE_BYTES]);
      pass.draw(3, 1, 0, 0);
      pass.end();
    }
  }
  device.queue.submit([encoder.finish()]);
  // Submitted work keeps its own reference; destroying here frees the buffer
  // once the passes retire instead of leaking one per probe refresh.
  paramsBuffer.destroy();
}
