import { bodyLayer } from '../../../src/layers/body/layer';
import { bodyPickCodes } from '../../support/layerPickCodes';
import type { Layer } from '../../../src/@types/engine/layer/Layer';
import type { LayerCoreDeps } from '../../../src/@types/engine/layer/LayerCoreDeps';
import type { BodyRuntime } from '../../../src/layers/body/@types/BodyRuntime';

/**
 * The body Layer with a `create` that mints no GPU renderers, for `createLayers` fixtures
 * on a stub device. Its passes read the runtime lazily, so empty slots do.
 */
export const bodyLayerWithoutGpu = {
  ...bodyLayer,
  create: (deps: LayerCoreDeps) =>
    ({
      textureSlots: new Map(),
      atlasSlot: {},
      pickCodes: bodyPickCodes(),
      meshBodies: deps.meshBodies,
    }) as unknown as BodyRuntime,
  destroy: () => {},
} as unknown as Layer<string, unknown>;
