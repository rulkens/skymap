/**
 * removeVolumeFieldSetting — unit tests for the copy-on-write field removal helper.
 *
 * The helper is the delete-path for per-field settings entries: it returns a
 * new fields map with the named row absent (never mutates the input).  Tests cover:
 *
 *   1. The named row is removed and the returned object is a new reference.
 *   2. Removing does not mutate the input.
 *   3. Removing an absent id is a no-op that still returns a new object.
 */

import { describe, it, expect } from 'vitest';
import { removeVolumeFieldSetting } from '../../../../src/services/engine/helpers/removeVolumeFieldSetting';
import type { VolumeFieldId } from '../../../../src/@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../src/@types/settings/VolumeFieldSettings';

// A complete VolumeFieldSettings literal used as a stable baseline fixture.
const BASE_SETTINGS: VolumeFieldSettings = {
  enabled: true,
  intensity: 0.5,
  contrast: 1,
  densityScale: 1,
  paletteId: 'inferno' as const,
  trim: 0,
  exposure: 1,
};

describe('removeVolumeFieldSetting', () => {
  it('removes the named row and returns a new object', () => {
    const input: Partial<Record<VolumeFieldId, VolumeFieldSettings>> = {
      mcpm: { ...BASE_SETTINGS },
      'cf4-density': { ...BASE_SETTINGS },
    };

    const result = removeVolumeFieldSetting(input, 'mcpm');

    expect('mcpm' in result).toBe(false);
    expect('cf4-density' in result).toBe(true);
    expect(result).not.toBe(input);
  });

  it('does not mutate the input', () => {
    const input: Partial<Record<VolumeFieldId, VolumeFieldSettings>> = {
      mcpm: { ...BASE_SETTINGS },
      'cf4-density': { ...BASE_SETTINGS },
    };

    removeVolumeFieldSetting(input, 'mcpm');

    expect('mcpm' in input).toBe(true);
  });

  it('removing an absent id is a no-op that still returns a new object', () => {
    const input: Partial<Record<VolumeFieldId, VolumeFieldSettings>> = {
      'cf4-density': { ...BASE_SETTINGS },
    };

    const result = removeVolumeFieldSetting(input, 'mcpm');

    expect(Object.keys(result)).toEqual(Object.keys(input));
    expect(result).not.toBe(input);
  });
});
