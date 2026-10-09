import { beforeAll, describe, expect, it } from 'vitest';

import type { MissionEvent } from '../../../../src/@types/missions/MissionEvent';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { flybyNormal } from '../../../../src/utils/exhibits/mission/flybyNormal';
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

describe('flybyNormal', () => {
  it('is a unit vector perpendicular to r and v', () => {
    const n = flybyNormal(neptune)!;
    const { rKm, vKmS } = bodyRelativeState('voyager2', 'neptune', tc)!;
    const dot = (a: readonly number[], b: readonly number[]): number =>
      a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(Math.hypot(...n)).toBeCloseTo(1, 12);
    expect(dot(n, rKm) / Math.hypot(...rKm)).toBeCloseTo(0, 9);
    expect(dot(n, vKmS) / Math.hypot(...vKmS)).toBeCloseTo(0, 9);
  });
});
