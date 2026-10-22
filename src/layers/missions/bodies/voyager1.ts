/**
 * Voyager 1: the one source of its launch instant, read for both `presentFromIso`
 * and the sampled position.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { VOYAGER_1_LIME } from '../../../data/bodies/palette';
import { CAPE_CANAVERAL_LC41 } from '../../../data/missions/capeCanaveralLc41';
import { launchIsoOf } from '../../../utils/missions/launchIsoOf';

const LAUNCH = launchIsoOf('voyager1');

export const VOYAGER_1: LayerBody = {
  // The real missions. No `captionRevealM`: these are
  // real objects on the default caption reach, not easter eggs to stumble on.
  // Half a radius: the 13 m magnetometer boom sets the bounding sphere, so two
  // radii would park the camera 29 m from a 4 m bus.
  body: meshBody({
    id: 'voyager1',
    label: 'Voyager 1',
    meshKey: 'voyager',
    standoffRadii: 0.5,
    presentFromIso: LAUNCH,
  }),
  position: {
    kind: 'sampled',
    sampled: {
      id: 'voyager1',
      trailColor: VOYAGER_1_LIME,
      launchIso: LAUNCH,
      launchPad: CAPE_CANAVERAL_LC41,
    },
  },
  // Both probes keep the high-gain dish on Earth — the real pointing constraint,
  // and the only one that stays true at any epoch as the geometry opens up.
  rotation: { kind: 'lookAt', id: 'voyager1', targetId: 'earth' },
};
