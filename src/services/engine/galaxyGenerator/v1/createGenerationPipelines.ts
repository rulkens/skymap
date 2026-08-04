/**
 * createGenerationPipelines — links the two galaxy-generation compute
 * shaders (`generateStars.wesl`, `generateDust.wesl`) into GPU pipelines.
 *
 * This is the first place either shader gets linked and compiled: both
 * import `milkyWay/sprites/generate.wesl`'s shared bindings/helpers via WESL's
 * `package::` syntax, and the `?static` suffix (wired in `vite.config.ts`)
 * resolves that import graph at BUILD time into one flat WGSL string per
 * entry point — same shape as the plain `.wesl?static` imports
 * `createGalaxyEngine.ts` already uses for the render pipelines. Any linker
 * or compile error in the shared lib surfaces here, through
 * `createShaderModuleWithDevLog`'s dev-mode `getCompilationInfo()` dump,
 * exactly like every other shader module in this renderer.
 *
 * `layout: 'auto'` mirrors the render pipelines' convention: WebGPU derives
 * each pipeline's bind-group layout from its own shader, so the layout is
 * guaranteed to match what the shader actually declares. The house-rule cost
 * of `'auto'` is that the derived layout is pipeline-specific — it can't be
 * reused to build a bind group for the OTHER pipeline, even though both
 * shaders declare the identical `@group(0)` bindings in `milkyWay/sprites/generate.wesl`.
 * `encodeGeneration.ts` is where that's handled: it builds one bind group per
 * pipeline, at dispatch time, rather than trying to share one.
 */
import { createShaderModuleWithDevLog } from '../../../gpu/shaderCompileLogger';
import generateStarsWgsl from '../../../gpu/shaders/milkyWay/sprites/generateStars.wesl?static';
import generateDustWgsl from '../../../gpu/shaders/milkyWay/sprites/generateDust.wesl?static';
import type { GenerationPipelines } from '../../../../@types/galaxy/GenerationPipelines';

export function createGenerationPipelines(device: GPUDevice): GenerationPipelines {
  const starsModule = createShaderModuleWithDevLog(device, generateStarsWgsl, 'galaxy:genStars');
  const stars = device.createComputePipeline({
    label: 'galaxy:genStarsPipe',
    layout: 'auto',
    compute: { module: starsModule, entryPoint: 'cs' },
  });

  const dustModule = createShaderModuleWithDevLog(device, generateDustWgsl, 'galaxy:genDust');
  const dust = device.createComputePipeline({
    label: 'galaxy:genDustPipe',
    layout: 'auto',
    compute: { module: dustModule, entryPoint: 'cs' },
  });

  return { stars, dust };
}
