import { beforeAll, describe, expect, it } from 'vitest';

import type { MissionEvent } from '../../../../src/@types/missions/MissionEvent';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { bodyRelativeState } from '../../../../src/utils/exhibits/mission/bodyRelativeState';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import FLYBY from '../../../fixtures/voyager2NeptuneFlyby.json';

const neptune = MISSION_EVENTS.find((e) => e.id === 'voyager2-neptune') as MissionEvent;
const tc = unixMsToJulianDays(Date.parse(neptune.iso));

beforeAll(() => {
  trajectoryRegistry.set({
    id: 'voyager2',
    tDays: Float64Array.from(FLYBY.track.tDays),
    posKm: Float64Array.from(FLYBY.track.posKm),
    velKmS: Float32Array.from(FLYBY.track.velKmS),
  });
});

describe('bodyRelativeState', () => {
  it('puts Voyager 2 at Neptune within 1% of the measured closest distance', () => {
    const { rKm } = bodyRelativeState('voyager2', 'neptune', tc)!;
    expect(Math.abs(Math.hypot(...rKm) / neptune.closestKm! - 1)).toBeLessThan(0.01);
  });

  it('is null when the craft track is not loaded', () => {
    expect(bodyRelativeState('voyager9', 'neptune', tc)).toBeNull();
  });

  it('gives a flyby-speed relative velocity (tens of km/s)', () => {
    const { vKmS } = bodyRelativeState('voyager2', 'neptune', tc)!;
    expect(Math.hypot(...vKmS)).toBeGreaterThan(10);
    expect(Math.hypot(...vKmS)).toBeLessThan(40);
  });
});
