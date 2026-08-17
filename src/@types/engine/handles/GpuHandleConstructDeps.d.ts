import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { GpuContext } from '../../rendering/GpuContext';
import type { LoadedFontAtlases } from '../../rendering/LoadedFontAtlases';

// Shared prerequisites every row's `construct` may read. Cross-handle
// dependencies (the one real case: starCatalogPickRenderer reading
// starCatalogRenderer) are NOT threaded through this bag — `construct`
// takes `state` directly and reads `state.gpu.<earlierKey>`, exactly like
// today's initGpu.ts body, so an earlier row's result is visible to a
// later row's construct without a second mechanism.
export type GpuHandleConstructDeps = {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvas: HTMLCanvasElement;
  readonly format: GPUTextureFormat;
  readonly hdrCapable: boolean;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  readonly uiCtx: Omit<GpuContext, 'format'>;
  readonly fontAtlases: LoadedFontAtlases;
};
