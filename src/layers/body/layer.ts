/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`,
 * `orbitTrails`), their visibility entries, the Orbit trails toggle row, the
 * Earth, planet and moon body rows, their Planet and Earth source rows and the
 * `body` selection kind with its card. Body render and load code stay in core, so
 * the Layer mints no runtime and contributes no pass.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';
import { BODY_BODY_ROWS } from './bodies/bodyBodyRows';
import { BODY_SOURCE_ROWS } from './sources/bodySourceRows';
import { bodySelectionRow } from './present/bodySelectionRow';
import BodyDetailCardContainer from '../../components/containers/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  bodies: BODY_BODY_ROWS,
  sources: BODY_SOURCE_ROWS,
  visibility: bodyVisibility,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
  selection: () => [bodySelectionRow()],
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } },
    {
      slot: 'detailCard',
      content: { type: 'body', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});
