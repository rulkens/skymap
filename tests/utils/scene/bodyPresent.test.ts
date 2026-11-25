import { describe, expect, it, vi } from 'vitest';

// Fixture rows in place of the composition's: one launched body, one never launched, one whose
// track never loads. Hubble keeps its real `presentFromIso`; Earth is every other body.
vi.mock('../../../src/data/bodies/sampledBodies', () => ({
  SAMPLED_BODIES: [
    { id: 'launched', launch: { iso: '2030-01-01T00:00:00Z', pad: { latDeg: 0, lonDeg: 0 } } },
    { id: 'unlaunched' },
    { id: 'unloaded' },
  ],
}));

import { trajectoryRegistry } from '../../../src/services/bodies/trajectoryRegistry';
import { bodyPresent } from '../../../src/utils/scene/bodyPresent';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';

const daysOf = (iso: string): number => unixMsToJulianDays(Date.parse(iso));
const LAUNCH = daysOf('2030-01-01T00:00:00Z');
const FIRST = LAUNCH + 1;
const LAST = LAUNCH + 11;

for (const id of ['launched', 'unlaunched']) {
  trajectoryRegistry.set({
    id,
    tDays: Float64Array.of(FIRST, LAST),
    posKm: Float64Array.of(1e8, 0, 0, 1e8, 1e6, 0),
    velKmS: Float32Array.of(0, 1, 0, 0, 1, 0),
  });
}

describe('bodyPresent', () => {
  it('holds a row with presentFromIso absent before it', () => {
    const from = daysOf('1990-04-25T19:38:00Z');
    expect(bodyPresent('hubble', from - 1)).toBe(false);
    expect(bodyPresent('hubble', from + 1)).toBe(true);
  });

  it('holds a sampled body with no loaded track absent at every instant', () => {
    expect(bodyPresent('unloaded', FIRST + 1)).toBe(false);
  });

  it('opens a launched body at its launch and closes it after its last sample', () => {
    expect(bodyPresent('launched', LAUNCH - 0.01)).toBe(false);
    expect(bodyPresent('launched', LAUNCH + 0.01)).toBe(true);
    expect(bodyPresent('launched', LAST)).toBe(true);
    expect(bodyPresent('launched', LAST + 0.01)).toBe(false);
  });

  it('opens a body never launched at its first sample and closes it after its last', () => {
    expect(bodyPresent('unlaunched', LAUNCH + 0.01)).toBe(false);
    expect(bodyPresent('unlaunched', FIRST)).toBe(true);
    expect(bodyPresent('unlaunched', LAST + 0.01)).toBe(false);
  });

  it('never holds any other body absent', () => {
    expect(bodyPresent('earth', -1e9)).toBe(true);
  });
});
