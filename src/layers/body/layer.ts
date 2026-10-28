/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`,
 * `orbitTrails`), their visibility entries, the Orbit trails toggle row and the
 * Earth, planet and moon body rows. Body render and load code stay in core, so
 * the Layer mints no runtime and contributes no pass.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';
import { BODY_BODY_ROWS } from './bodies/bodyBodyRows';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  bodies: BODY_BODY_ROWS,
  visibility: bodyVisibility,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } }],
});
