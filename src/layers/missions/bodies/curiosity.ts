/**
 * Curiosity at its current Gale crater position.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { meshGroundOffsetM } from '../../../utils/meshBodies/meshGroundOffsetM';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { asSurfaceSiteId } from '../../../utils/scene/asSurfaceSiteId';

export const CURIOSITY: LayerBody = {
  // `presentFromIso`: the rover's landing (UTC).
  body: meshBody({
    id: 'curiosity',
    label: 'Curiosity',
    meshKey: 'curiosity',
    presentFromIso: '2012-08-06T05:17:00Z',
  }),
  position: {
    kind: 'site',
    // Sol 5016 end-of-drive (RMC 125_198, ~2026-09-15), Gale crater:
    // mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints_current.json.
    site: {
      id: asSurfaceSiteId('curiosity'),
      hostId: asSceneBodyId('mars'),
      latDeg: -4.8246,
      lonDeg: 137.38848,
      altitudeM: meshGroundOffsetM('curiosity'),
      seat: 'resting',
    },
  },
  // Rover headings are AUTHORED presentation, not surveyed landing azimuths:
  // they only spread the four so no two face the same way, and the visual pass
  // is their only gate.
  rotation: { kind: 'surfaceLocked', id: 'curiosity', headingDeg: 90 },
};
