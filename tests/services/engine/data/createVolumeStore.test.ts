import { describe, it, expect } from 'vitest';
import { createVolumeStore } from '../../../../src/services/engine/data/createVolumeStore';
import type { VolumeFieldSettings } from '../../../../src/@types/settings/VolumeFieldSettings';

const params = (over: Partial<VolumeFieldSettings> = {}): VolumeFieldSettings => ({
  enabled: false,
  intensity: 1,
  contrast: 1,
  densityScale: 1,
  paletteId: 'viridis',
  trim: 0,
  exposure: 1,
  ...over,
});

describe('createVolumeStore', () => {
  it('starts with no registered fields', () => {
    const s = createVolumeStore();
    expect(s.registered()).toEqual([]);
    expect(s.params('mcpm')).toBeUndefined();
  });

  it('setParams registers + stores; params reads back', () => {
    const s = createVolumeStore();
    s.setParams('mcpm', params({ enabled: true }));
    expect(s.registered()).toEqual(['mcpm']);
    expect(s.params('mcpm')?.enabled).toBe(true);
    expect(s.fields.get('mcpm')?.enabled).toBe(true);
  });
});
