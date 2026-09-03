import type { RenderResources } from '../render/renderResources';

/** SceneSagaContext — the engine-side capabilities a saga reaches for via
 *  `getContext`, mirroring `src/store/types.ts`'s `SagaContext`. */
export type SceneSagaContext = {
  resources: RenderResources;
};
