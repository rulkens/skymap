/**
 * The body Layer: owns the body settings clusters (`bodies`, `earth`,
 * `orbitTrails`), their visibility entries, the Orbit trails toggle row, the
 * Earth, planet and moon body rows, their Planet and Earth source rows, the `body`
 * selection kind with its card, their palette rows, name captions, orbit trails and
 * the Solar System exhibit. Body render and load code stay in core, so the Layer
 * mints no runtime and contributes no pass.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { bodyLayerSettings } from './state/slices';
import { bodyVisibility } from './visibility';
import { BODY_BODY_ROWS } from './bodies/bodyBodyRows';
import { BODY_SOURCE_ROWS } from './sources/bodySourceRows';
import { bodySelectionRow } from './present/bodySelectionRow';
import { bodySearch } from './present/bodySearch';
import { BODY_TRAIL_ELEMENTS } from './present/bodyTrailElements';
import { produceSceneBodyCaptions } from './present/produceSceneBodyCaptions';
import { bodyLayerExhibits } from './exhibits/exhibits';
import { NEAR0 } from '../../services/engine/frame/slabs';
import BodyDetailCardContainer from '../../components/containers/BodyDetailCardContainer';
import CompactBodyCard from '../../components/InfoCard/CompactBodyCard/CompactBodyCard';

export const bodyLayer = defineLayer({
  name: 'body',
  settings: bodyLayerSettings,
  bodies: BODY_BODY_ROWS,
  sources: BODY_SOURCE_ROWS,
  visibility: bodyVisibility,
  exhibits: bodyLayerExhibits,
  create: () => undefined,
  destroy: () => {},
  passes: () => [],
  guides: () => ({
    screenLabels: [
      {
        slab: NEAR0,
        id: 'sceneBodyCaptions',
        label: 'body',
        produceLabels: produceSceneBodyCaptions,
      },
    ],
    orbitTrails: { show: 'orbitTrails', rows: BODY_TRAIL_ELEMENTS },
  }),
  selection: () => [bodySelectionRow()],
  search: () => bodySearch(),
  ui: [
    { slot: 'labelsAndGuides', content: { toggle: 'orbitTrails', label: 'Orbit trails' } },
    {
      slot: 'detailCard',
      content: { type: 'body', Detail: BodyDetailCardContainer, Compact: CompactBodyCard },
    },
  ],
});
