/**
 * Voyager 2, on its sampled track from the launch pad.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { CAPE_CANAVERAL_LC41 } from '../craft/data/capeCanaveralLc41';
import { launchIsoOf } from '../events/utils/launchIsoOf';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';

const LAUNCH = launchIsoOf('voyager2');

export const VOYAGER_2: LayerBody = {
  body: meshBody({
    id: 'voyager2',
    label: 'Voyager 2',
    meshKey: 'voyager',
    standoffRadii: 0.5,
  }),
  position: {
    kind: 'sampled',
    sampled: {
      id: asSceneBodyId('voyager2'),
      launch: { iso: LAUNCH, pad: CAPE_CANAVERAL_LC41 },
    },
  },
  rotation: { kind: 'lookAt', id: 'voyager2', targetId: 'earth' },
};
