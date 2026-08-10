/**
 * createGenerationPipelines — links the two galaxy-generation compute
 * shaders (`generateStars.wesl`, `generateDust.wesl`) into GPU pipelines.
 * Both import `milkyWay/sprites/generate.wesl`'s shared bindings via WESL's
 * `package::` syntax; `?static` (see `vite.config.ts`) resolves that graph
 * at build time into one flat WGSL string per entry point.
 *
 * `layout: 'auto'` derives each pipeline's bind-group layout from its own
 * shader — the two layouts are NOT interchangeable even though both shaders
 * declare identical `@group(0)` bindings; `encodeGeneration.ts` builds a
 * separate bind group per pipeline for that reason.
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
