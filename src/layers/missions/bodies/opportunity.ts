/**
 * Opportunity at its final resting place on Endeavour's rim.
 */

import type { LayerBody } from '../../../@types/engine/layer/LayerBody';
import { meshBody } from '../../../data/bodies/makers/meshBody';
import { meshGroundOffsetM } from '../../../utils/meshBodies/meshGroundOffsetM';

export const OPPORTUNITY: LayerBody = {
  body: meshBody({
    id: 'opportunity',
    label: 'Opportunity',
    meshKey: 'mer',
    presentFromIso: '2004-01-25T05:05:00Z',
  }),
  position: {
    kind: 'site',
    // Final resting place, Perseverance Valley on Endeavour's rim: the centre
    // of HiRISE ESP_087985_1780 "Opportunity Rover Position" (uahirise.org). A
    // proxy — no official lat/lon fix is published.
    site: {
      id: 'opportunity',
      hostId: 'mars',
      latDeg: -2.336,
      lonDeg: 354.619,
      altitudeM: meshGroundOffsetM('mer'),
      seat: 'resting',
    },
  },
  rotation: { kind: 'surfaceLocked', id: 'opportunity', headingDeg: 270 },
};
