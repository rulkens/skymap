/**
 * Identity at runtime; it exists so a Layer literal infers its own `Runtime` from
 * `create`'s return while still being checked against `Layer`.
 */

import type { Layer } from '../../../@types/engine/layer/Layer';

export function defineLayer<const Name extends string, Runtime>(
  layer: Layer<Name, Runtime>,
): Layer<Name, Runtime> {
  return layer;
}
