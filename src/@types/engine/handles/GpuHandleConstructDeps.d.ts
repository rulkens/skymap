import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { GpuContext } from '../../rendering/GpuContext';
import type { LoadedFontAtlases } from '../../rendering/LoadedFontAtlases';

// Shared prerequisites every row's `construct` may read — and ONLY what a
// row may read: a `construct` closure must close over nothing but its
// `state`/`deps` parameters (no capturing an outer `device` local, say),
// so every row's real inputs stay legible from its own signature. Cross-handle
// dependencies (the one real case: starCatalogPickRenderer reading
// starCatalogRenderer) are NOT threaded through this bag — `construct`
// takes `state` directly and reads `state.gpu.<earlierKey>`, exactly like
// today's initGpu.ts body, so an earlier row's result is visible to a
// later row's construct without a second mechanism.
//
// `ctx` bundles device/context/canvas/format/hdrCapable as one `GpuContext`
// rather than four+ separate fields: most renderer factories already take a
// `GpuContext` first argument, so rows pass `deps.ctx` straight through
// instead of re-spreading it from parts.
export type GpuHandleConstructDeps = {
  readonly ctx: GpuContext;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  readonly fontAtlases: LoadedFontAtlases;
};
