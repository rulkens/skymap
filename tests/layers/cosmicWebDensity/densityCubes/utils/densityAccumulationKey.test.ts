import { describe, it, expect } from 'vitest';
import type { Tier } from '../../../../../packages/shared/src/@types/data/Tier';
import type { VolumeFieldSettings } from '../../../../../src/@types/settings/VolumeFieldSettings';
import type { DetailRegionDraw } from '../../../../../src/@types/rendering/DetailRegionDraw';
import { densityAccumulationKey } from '../../../../../src/layers/cosmicWebDensity/densityCubes/utils/densityAccumulationKey';

type Id = 'a' | 'b';
const IDS: readonly Id[] = ['a', 'b'];

const settings = (): VolumeFieldSettings => ({
  enabled: true,
  intensity: 0.5,
  contrast: 1.7,
  densityScale: 2,
  paletteId: 'magma',
  trim: 0.3,
  exposure: 4,
  showLevels: false,
});

const region = (): DetailRegionDraw => ({
  settledLo: [0.2, 0.2, 0.2],
  settledHi: [0.6, 0.6, 0.6],
  texScale: [1.25, 1.25, 0.9],
  voxelMpc: 0.78,
  fade: {
    intoLo: [0.25, 0.2, 0.2],
    intoHi: [0.65, 0.6, 0.6],
    outLo: [0.2, 0.2, 0.2],
    outHi: [0.6, 0.6, 0.6],
    w: 0.25,
  },
});

const keyOf = (
  over: {
    a?: VolumeFieldSettings;
    opacity?: number;
    stamp?: number | null;
    region?: DetailRegionDraw | null;
    tier?: Tier;
  } = {},
): string => {
  const a = over.a ?? settings();
  const b = settings();
  return densityAccumulationKey<Id>(
    IDS,
    (id) => (id === 'a' ? a : b),
    (id) => (id === 'a' ? (over.opacity ?? 1) : 1),
    (id) => (id === 'a' ? (over.stamp === undefined ? 1000 : over.stamp) : 2000),
    (id) => (id === 'a' ? (over.region ?? null) : null),
    over.tier ?? 'medium',
  );
};

describe('densityAccumulationKey', () => {
  it('equal inputs give equal keys', () => {
    expect(keyOf()).toBe(keyOf());
  });

  it('every settings member moves the key', () => {
    // A member missing from the key freezes the converged image on a slider change at rest;
    // the literal's keys, which TS forces complete, cover a member added later.
    const base = keyOf();
    for (const member of Object.keys(settings()) as (keyof VolumeFieldSettings)[]) {
      const changed: Record<string, unknown> = { ...settings() };
      const v = changed[member];
      if (typeof v === 'number') changed[member] = v + 0.01;
      else if (typeof v === 'boolean') changed[member] = !v;
      else changed[member] = 'viridis';
      expect(keyOf({ a: changed as VolumeFieldSettings }), member).not.toBe(base);
    }
  });

  it('opacity, cube stamp and tier each move the key', () => {
    const base = keyOf();
    // A fade in flight moves by tiny steps: the key must not round them away.
    expect(keyOf({ opacity: 0.9999 })).not.toBe(base);
    expect(keyOf({ stamp: 1001 })).not.toBe(base);
    expect(keyOf({ stamp: null })).not.toBe(base);
    expect(keyOf({ tier: 'large' })).not.toBe(base);
  });

  it('structurally equal region values give the same key', () => {
    // An identity compare would restart the mean every frame and never converge.
    expect(keyOf({ region: region() })).toBe(keyOf({ region: region() }));
  });

  it('a fade step or a moved settled box gives a new key', () => {
    // A region change the key missed would keep the old box's converged image at rest.
    const base = keyOf({ region: region() });
    const fade = region().fade!;
    expect(keyOf({ region: { ...region(), fade: { ...fade, w: 0.5 } } })).not.toBe(base);
    expect(keyOf({ region: { ...region(), settledHi: [0.7, 0.6, 0.6] } })).not.toBe(base);
  });
});
