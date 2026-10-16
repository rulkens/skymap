/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`,
 * `orbitTrails`) and their visibility entries. Body render and load code stay in core, so the Layer mints
 * no runtime and contributes no pass.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  visibility: bodyVisibility,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
});
