/**
 * What an app hands `createEngine`: which Layers it is made of, and where it boots.
 * `Layer<string, unknown>` is the erased constraint — `never` does NOT work in its place,
 * since `Runtime` is covariant in `create`'s return.
 */

import type { Layer } from './layer/Layer';
import type { EngineHomeConfig } from './EngineHomeConfig';

export type EngineComposition<Layers extends readonly Layer<string, unknown>[]> = {
  readonly layers: Layers;
  readonly home: EngineHomeConfig;
};
