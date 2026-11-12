import { describe, expect, it } from 'vitest';
import { SATELLITE_CLASSES } from '../../../../../src/data/satellites/satelliteClasses';
import { SATELLITE_PROFILE_CAPACITY } from '../../../../../src/layers/satellites/points/data/satelliteProfileCapacity';
import { SATELLITE_PROFILES } from '../../../../../src/layers/satellites/points/data/satelliteProfiles';
import { satelliteProfileCode } from '../../../../../src/layers/satellites/points/subsystems/satelliteProfileCode';
import type { SatelliteProfileInput } from '../../../../../src/layers/satellites/points/@types/SatelliteProfileInput';

const active = SATELLITE_CLASSES.indexOf('active');
const debris = SATELLITE_CLASSES.indexOf('debris');
const other = SATELLITE_CLASSES.indexOf('other');

function idOf(over: Partial<SatelliteProfileInput>): string {
  const code = satelliteProfileCode({
    name: 'TBA',
    cosparId: '',
    classCode: active,
    meanMotion: 15.5,
    eccentricity: 0.001,
    ...over,
  });
  return SATELLITE_PROFILES[code]?.id ?? 'missing';
}

describe('satelliteProfileCode', () => {
  it('debris class wins over a constellation name', () => {
    expect(idOf({ name: 'STARLINK-1234', classCode: debris })).toBe('debris');
  });

  it('a DEB token in an active object is debris, but DEBUT-1 is not', () => {
    expect(idOf({ name: 'STARLINK-1234 DEB' })).toBe('debris');
    expect(idOf({ name: 'DEBUT-1' })).not.toBe('debris');
  });

  it('a rocket body is other, whatever its class', () => {
    expect(idOf({ name: 'SL-4 R/B' })).toBe('other');
  });

  it('an unnamed object with no designator is other', () => {
    expect(idOf({ name: 'UNKNOWN', cosparId: '', classCode: other })).toBe('other');
  });

  it('the V2 Mini boundary is launch 2023-026', () => {
    expect(idOf({ name: 'STARLINK-1', cosparId: '2023-025A' })).toBe('starlink-v1');
    expect(idOf({ name: 'STARLINK-1', cosparId: '2023-026A' })).toBe('starlink-v2-mini');
    expect(idOf({ name: 'STARLINK-1', cosparId: '2019-074A' })).toBe('starlink-v1');
  });

  it('a Starlink with a blank designator is V2 Mini', () => {
    expect(idOf({ name: 'STARLINK-1', cosparId: '' })).toBe('starlink-v2-mini');
  });

  it('Hulianwang and Guowang names share a row', () => {
    expect(idOf({ name: 'HULIANWANG DIGUI-01' })).toBe('guowang');
    expect(idOf({ name: 'GUOWANG-01' })).toBe('guowang');
  });

  it('regimes classify real orbits', () => {
    expect(idOf({ meanMotion: 15.5, eccentricity: 0.001 })).toBe('leo');
    expect(idOf({ meanMotion: 2.005, eccentricity: 0.01 })).toBe('meo');
    expect(idOf({ meanMotion: 1.0027, eccentricity: 0.0002 })).toBe('geo');
    expect(idOf({ meanMotion: 2.0, eccentricity: 0.74 })).toBe('heo');
  });

  it('profile ids are unique and fit the GPU table', () => {
    const ids = SATELLITE_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(SATELLITE_PROFILE_CAPACITY);
  });
});
