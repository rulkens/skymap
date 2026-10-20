/**
 * Perseverance at its current Jezero crater position. Leaf data: types, `src/data` constants
 * and makers, pure utils.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { meshGroundOffsetM } from '../../../utils/meshBodies/meshGroundOffsetM';

export const PERSEVERANCE: LayerBody = {
  body: meshBody({
    id: 'perseverance',
    label: 'Perseverance',
    meshKey: 'perseverance',
    presentFromIso: '2021-02-18T20:55:00Z',
  }),
  position: {
    kind: 'site',
    // Sol 1980 end-of-drive (RMC 91_970, ~2026-09-14), Jezero crater:
    // mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints_current.json.
    site: {
      id: 'perseverance',
      hostId: 'mars',
      latDeg: 18.43687,
      lonDeg: 77.23205,
      altitudeM: meshGroundOffsetM('perseverance'),
      seat: 'resting',
    },
  },
  rotation: { kind: 'surfaceLocked', id: 'perseverance', headingDeg: 0 },
};
