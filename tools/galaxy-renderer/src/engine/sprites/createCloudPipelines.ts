/**
 * createCloudPipelines — the two sprite-billboard pipelines (additive stars
 * into the aggregate, transmittance dust into `sceneTex`), each its own
 * `layout: 'auto'` bind group over the runtime's own
 * `milkyWay/sprites/{stars,dust}.wesl`. ONE uniform buffer per pass, never
 * shared — two writes before either pass runs would silently hand the star
 * pass the dust pass's viewport. SEPARATE shader modules per pass: a module
 * shared across pipelines whose entry points disagree on a binding's stage
 * visibility fails `layout: 'auto'`'s check.
 */
import { ADDITIVE_BLEND } from '../../../../../src/services/gpu/lib/blendStates';
import { GEN_RECORD_BYTES } from '../../../../../src/services/engine/galaxyGenerator/v1/genRecordBytes';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../../../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer';

import starWgsl from '../shaders/milkyWay/sprites/stars.wesl?static';
import dustWgsl from '../shaders/milkyWay/sprites/dust.wesl?static';

export type CloudPipelineDeps = {
  readonly device: GPUDevice;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
};

export type CloudPipelines = {
  /** Own their own storage — the caller wraps both in its ownership ledger, same idiom as `bakeVolumeTexture`'s returned textures. */
  readonly starUbo: GPUBuffer;
  readonly dustUbo: GPUBuffer;
  readonly starPipe: GPURenderPipeline;
  readonly dustPipe: GPURenderPipeline;
  readonly starBG: GPUBindGroup;
  readonly dustBG: GPUBindGroup;
};

export function createCloudPipelines(deps: CloudPipelineDeps): CloudPipelines {
  const { device, makeShader, hdrFormat } = deps;

  const makeCloudUniformBuffer = (label: string): GPUBuffer =>
    device.createBuffer({
      label,
      size: MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  const starUbo = makeCloudUniformBuffer('galaxy:starUniforms');
  const dustUbo = makeCloudUniformBuffer('galaxy:dustUniforms');

  // ---- star pipeline (additive billboards) ----
  // The instance layout reads `pos@0, color@12, (size, brightness)@24` off
  // `generate.wesl`'s own record, unchanged from the tool's former star pass —
  // which is what makes the shader swap a shader swap and nothing more.
  const starMod = makeShader(starWgsl, 'galaxy:star');
  const starPipe = device.createRenderPipeline({
    label: 'galaxy:starPipe',
    layout: 'auto',
    vertex: {
      module: starMod,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        {
          arrayStride: GEN_RECORD_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' },
            { shaderLocation: 2, offset: 12, format: 'float32x3' },
            { shaderLocation: 3, offset: 24, format: 'float32x2' },
          ],
        },
      ],
    },
    fragment: {
      module: starMod,
      entryPoint: 'fs',
      // The aggregate offscreen is `rgba16float` like `sceneTex`, so one HDR
      // format still describes both cloud pipelines. `ADDITIVE_BLEND` is the
      // runtime's shared descriptor — the same one `milkyWayCloudRenderer`
      // hands its star pipeline, and the same algebra `createAdditiveUpsample`
      // composites the result back with (that pairing is what makes the
      // reduced-res detour mathematically equal to drawing straight into HDR).
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // ---- dust pipeline (transmittance billboards) ----
  // The runtime's `milkyWay/sprites/dust.wesl`, drawn FULL-RES into `sceneTex`
  // (not the aggregate) — the app's split, because multiplicative
  // transmittance has to land on the real accumulation.
  const dustMod = makeShader(dustWgsl, 'galaxy:dust');
  const dustPipe = device.createRenderPipeline({
    label: 'galaxy:dustPipe',
    layout: 'auto',
    vertex: {
      module: dustMod,
      entryPoint: 'vs',
      buffers: [
        { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
        {
          arrayStride: GEN_RECORD_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x3' },
            { shaderLocation: 2, offset: 12, format: 'float32' },
            { shaderLocation: 3, offset: 16, format: 'float32x3' },
            { shaderLocation: 4, offset: 28, format: 'float32' },
          ],
        },
      ],
    },
    fragment: {
      module: dustMod,
      entryPoint: 'fs',
      targets: [
        {
          format: hdrFormat,
          blend: {
            color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Per-pipeline bind groups. `layout: 'auto'` groups are pipeline-specific
  // and never cross pipelines, so each pass needs its own group even where
  // the buffer is the same — and here the buffers differ too (see the module
  // header on why the two passes cannot share one).
  const starBG = device.createBindGroup({
    label: 'galaxy:cloudBG-star',
    layout: starPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: starUbo } }],
  });
  const dustBG = device.createBindGroup({
    label: 'galaxy:cloudBG-dust',
    layout: dustPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: dustUbo } }],
  });

  return { starUbo, dustUbo, starPipe, dustPipe, starBG, dustBG };
}
