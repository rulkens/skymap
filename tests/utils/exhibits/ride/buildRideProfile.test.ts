import { beforeAll, describe, expect, it } from 'vitest';

import type { MissionEvent } from '../../../../src/@types/missions/MissionEvent';
import { RIDE_HALF_WINDOW_DAYS } from '../../../../src/data/exhibits/ride/rideHalfWindowDays';
import { RIDE_WALL_MS } from '../../../../src/data/exhibits/ride/rideWallMs';
import { MISSION_EVENTS } from '../../../../src/data/missions/missionEvents.generated';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { buildRideProfile } from '../../../../src/utils/exhibits/ride/buildRideProfile';
import { unixMsToJulianDays } from '../../../../src/utils/time/unixMsToJulianDays';
import FLYBY from '../../../fixtures/voyager2NeptuneFlyby.json';

const neptune = MISSION_EVENTS.find((e) => e.id === 'voyager2-neptune') as MissionEvent;
const tc = unixMsToJulianDays(Date.parse(neptune.iso));

let profile: NonNullable<ReturnType<typeof buildRideProfile>>;

beforeAll(() => {
  trajectoryRegistry.set({
    id: 'voyager2',
    tDays: Float64Array.from(FLYBY.track.tDays),
    posKm: Float64Array.from(FLYBY.track.posKm),
    velKmS: Float32Array.from(FLYBY.track.velKmS),
  });
  profile = buildRideProfile(neptune, 1234)!;
});

describe('buildRideProfile', () => {
  it('keeps the caller wall clock', () => {
    expect(profile.startWallMs).toBe(1234);
  });

  it('is strictly monotone in both columns', () => {
    for (let i = 1; i < profile.wallMs.length; i++) {
      expect(profile.wallMs[i]!).toBeGreaterThan(profile.wallMs[i - 1]!);
      expect(profile.simDays[i]!).toBeGreaterThan(profile.simDays[i - 1]!);
    }
  });

  it('lasts RIDE_WALL_MS and spans closest -/+ 2 days', () => {
    const last = profile.wallMs.length - 1;
    expect(profile.wallMs[0]).toBe(0);
    expect(Math.abs(profile.wallMs[last]! - RIDE_WALL_MS)).toBeLessThanOrEqual(1);
    expect(profile.simDays[0]).toBeCloseTo(tc - RIDE_HALF_WINDOW_DAYS, 9);
    expect(profile.simDays[last]).toBeCloseTo(tc + RIDE_HALF_WINDOW_DAYS, 9);
  });

  it('runs slowest within one sample of closest approach', () => {
    const speed = (i: number): number =>
      (profile.simDays[i + 1]! - profile.simDays[i]!) /
      (profile.wallMs[i + 1]! - profile.wallMs[i]!);
    let slowest = 0;
    for (let i = 1; i < profile.wallMs.length - 1; i++) if (speed(i) < speed(slowest)) slowest = i;
    const closest = profile.simDays.findIndex((d) => d >= tc);
    expect(Math.abs(slowest - closest)).toBeLessThanOrEqual(2);
  });

  it('is null when the craft track is not loaded', () => {
    expect(buildRideProfile({ ...neptune, bodyId: 'voyager9' }, 0)).toBeNull();
  });
});
