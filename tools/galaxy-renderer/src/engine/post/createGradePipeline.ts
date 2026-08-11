/**
 * createGradePipeline — the one tool-only post pipeline: saturation /
 * vignette / optional gamma encode (`shaders/grade.wesl`), none of which the
 * app has. `encodePost` skips the pass entirely at identity settings (the
 * default — see `gradeIsActive`), so it costs nothing in the app-parity
 * configuration.
 */
import gradeWgsl from '../shaders/grade.wesl?static';

export type GradePipelineDeps = {
  readonly device: GPUDevice;
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly swapFormat: GPUTextureFormat;
};

export type GradePipeline = {
  readonly gradePipe: GPURenderPipeline;
  readonly gradeSampler: GPUSampler;
};

export function createGradePipeline(deps: GradePipelineDeps): GradePipeline {
  const { device, makeShader, swapFormat } = deps;
  const gradeMod = makeShader(gradeWgsl, 'galaxy:grade');
  const gradePipe = device.createRenderPipeline({
    label: 'galaxy:gradePipe',
    layout: 'auto',
    vertex: { module: gradeMod, entryPoint: 'vs' },
    fragment: { module: gradeMod, entryPoint: 'fs', targets: [{ format: swapFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  const gradeSampler = device.createSampler({
    label: 'galaxy:gradeSampler',
    magFilter: 'nearest',
    minFilter: 'nearest',
  });
  return { gradePipe, gradeSampler };
}
