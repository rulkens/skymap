import type { RenderResources } from '../render/renderResources';

/**
 * WorkbenchSagaContext — the engine-side capabilities a saga reaches for via
 * `getContext`, mirroring `src/store/types.ts`'s `SagaContext` at workbench
 * scale. `resources` is the `RenderResources` bag later saga tasks (6+) keep
 * in place of Viewport's closure locals.
 */
export type WorkbenchSagaContext = {
  canvas: HTMLCanvasElement;
  resources: RenderResources;
};
