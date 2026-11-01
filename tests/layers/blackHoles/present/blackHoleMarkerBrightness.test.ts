/**
 * blackHoleMarkerBrightness — the marker yields through its own fade, measured
 * from its anchor: no `cam.distance` gate turns it off, so the fade must.
 */

import { describe, it, expect } from 'vitest';

import { blackHoleMarkerBrightness } from '../../../../src/layers/blackHoles/present/blackHoleMarkerBrightness';
import { BLACK_HOLES } from '../../../../src/layers/blackHoles/data/blackHoles';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const ANCHOR = GALACTIC_CENTRE_ANCHOR.positionMpc as Vec3;
const STATES: ReadonlyMap<string, BodyState> = new Map([
  [GALACTIC_CENTRE_ANCHOR.id, { positionMpc: ANCHOR, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
]);
const eyeAt = (offsetMpc: number): Vec3 => [ANCHOR[0] + offsetMpc, ANCHOR[1], ANCHOR[2]];

describe('blackHoleMarkerBrightness', () => {
  it('marker brightness is 0 at the foreground cutoff from its anchor and unchanged at 1 kpc', () => {
    const row = BLACK_HOLES[0]!;
    expect(blackHoleMarkerBrightness(row, eyeAt(FOREGROUND_MAX_DISTANCE_MPC), STATES)).toBe(0);
    expect(blackHoleMarkerBrightness(row, eyeAt(SCALE_UNITS.KPC_TO_MPC), STATES)).toBe(
      row.glintBaseIntensity,
    );
  });
});
