import { bodyLayer } from '../../../src/layers/body/layer';
import type { Layer } from '../../../src/@types/engine/layer/Layer';
import type { BodyRuntime } from '../../../src/layers/body/@types/BodyRuntime';

/**
 * The body Layer with a `create` that mints no GPU renderers, for `createLayers` fixtures
 * on a stub device. Its passes read the runtime lazily, so empty slots do.
 */
export const bodyLayerWithoutGpu = {
  ...bodyLayer,
  create: () => ({ textureSlots: new Map(), atlasSlot: {} }) as unknown as BodyRuntime,
  destroy: () => {},
} as unknown as Layer<string, unknown>;
