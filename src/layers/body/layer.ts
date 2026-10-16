/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`,
 * `orbitTrails`). Body render and load code stay in core, so the Layer mints
 * no runtime and contributes no pass.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { bodyLayerSettings } from './state/slices';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
});
