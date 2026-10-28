/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`,
 * `orbitTrails`), their visibility entries, the Orbit trails toggle row and the
 * Earth and planet slab rows. Body render and load code stay in core, so the
 * Layer mints no runtime and contributes no pass.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { BODY_SLAB_ROWS } from './present/bodySlabRows';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  visibility: bodyVisibility,
  slabs: BODY_SLAB_ROWS,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } }],
});
