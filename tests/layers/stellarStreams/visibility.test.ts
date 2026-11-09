import { describe, expect, it } from 'vitest';

import { stellarStreamsVisibility } from '../../../src/layers/stellarStreams/visibility';
import { bandValueOf } from '../../../src/services/engine/presentation/bandValueOf';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const [entry] = stellarStreamsVisibility;
const valueAt = (distanceMpc: number) =>
  bandValueOf(entry, undefined, {
    drawCamPos: [distanceMpc, 0, 0],
    snapshot: { bodyStates: new Map() },
  });

describe('stellarStreams visibility', () => {
  it('the streams band is 0 at 2 kpc, 1 at 20 kpc and 0 past the foreground gate', () => {
    expect(valueAt(2 * SCALE_UNITS.KPC_TO_MPC)).toBe(0);
    expect(valueAt(20 * SCALE_UNITS.KPC_TO_MPC)).toBe(1);
    expect(valueAt(FOREGROUND_MAX_DISTANCE_MPC * 1.01)).toBe(0);
  });
});
