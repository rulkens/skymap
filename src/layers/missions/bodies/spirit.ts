/**
 * Spirit at its final resting place in Gusev crater.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { meshGroundOffsetM } from '../../../utils/meshBodies/meshGroundOffsetM';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { asSurfaceSiteId } from '../../../utils/scene/asSurfaceSiteId';

export const SPIRIT: LayerBody = {
  body: meshBody({
    id: 'spirit',
    label: 'Spirit',
    meshKey: 'mer',
    presentFromIso: '2004-01-04T04:35:00Z',
  }),
  position: {
    kind: 'site',
    // Final resting place at Troy, on Home Plate's west edge, Gusev crater
    // (Arvidson et al. 2010, doi:10.1029/2010JE003633). A proxy — no lat/lon
    // fix is published: the rover's bright dot in JPL PIA12205 (HiRISE
    // ESP_013499_1650), matched by eye onto the baked Gusev ortho.
    site: {
      id: asSurfaceSiteId('spirit'),
      hostId: asSceneBodyId('mars'),
      latDeg: -14.60036,
      lonDeg: 175.52576,
      altitudeM: meshGroundOffsetM('mer'),
      seat: 'resting',
    },
  },
  rotation: { kind: 'surfaceLocked', id: 'spirit', headingDeg: 180 },
};
