/**
 * Voyager 2: the one source of its launch instant, read for both `presentFromIso`
 * and the sampled position.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { VOYAGER_2_GREEN } from '../../../data/bodies/palette';
import { CAPE_CANAVERAL_LC41 } from '../../../data/missions/capeCanaveralLc41';
import { launchIsoOf } from '../../../utils/missions/launchIsoOf';

const LAUNCH = launchIsoOf('voyager2');

export const VOYAGER_2: LayerBody = {
  body: meshBody({
    id: 'voyager2',
    label: 'Voyager 2',
    meshKey: 'voyager',
    standoffRadii: 0.5,
    presentFromIso: LAUNCH,
  }),
  position: {
    kind: 'sampled',
    sampled: {
      id: 'voyager2',
      trailColor: VOYAGER_2_GREEN,
      launchIso: LAUNCH,
      launchPad: CAPE_CANAVERAL_LC41,
    },
  },
  rotation: { kind: 'lookAt', id: 'voyager2', targetId: 'earth' },
};
