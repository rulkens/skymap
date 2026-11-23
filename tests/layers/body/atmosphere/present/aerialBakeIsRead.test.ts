/**
 * aerialBakeIsRead — the CPU twin of the apply shader's shell hand-off. If the two
 * drift, either the bake runs unread (cost) or the apply samples a stale volume (a
 * visible fog error), so the threshold constant is pinned to the shader's.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { ATMOSPHERE_PARAMS } from '../../../../../src/layers/body/atmosphere/data/atmosphereParams';
import { HANDOFF_HORIZON_END } from '../../../../../src/layers/body/atmosphere/data/froxelVolume';
import { aerialBakeIsRead } from '../../../../../src/layers/body/atmosphere/present/aerialBakeIsRead';
import type { AtmosphereDrawEntry } from '../../../../../src/layers/body/atmosphere/@types/AtmosphereDrawEntry';

function entryAt(bodyId: 'earth' | 'mars', altitudeKm: number): AtmosphereDrawEntry {
  const params = ATMOSPHERE_PARAMS[bodyId]!;
  const camRadius = (params.planetRadiusKm + altitudeKm) / params.atmosphereTopKm;
  return { params, camLocal: [0, camRadius, 0] } as unknown as AtmosphereDrawEntry;
}

describe('aerialBakeIsRead', () => {
  it('reads the volume while the horizon is within twice its 256 km reach', () => {
    // Earth's horizon is 512 km away at ~20.5 km up; Mars's at ~38 km.
    expect(aerialBakeIsRead(entryAt('earth', 0))).toBe(true);
    expect(aerialBakeIsRead(entryAt('earth', 19))).toBe(true);
    expect(aerialBakeIsRead(entryAt('earth', 22))).toBe(false);
    expect(aerialBakeIsRead(entryAt('mars', 36))).toBe(true);
    expect(aerialBakeIsRead(entryAt('mars', 40))).toBe(false);
  });

  it('shares its threshold with the apply shader', () => {
    const wesl = readFileSync(
      join(process.cwd(), 'src/services/gpu/shaders/atmosphere/aerialPerspective/fragment.wesl'),
      'utf-8',
    );
    const match = /const HANDOFF_HORIZON_END: f32 = ([0-9.]+);/.exec(wesl);
    expect(match, 'HANDOFF_HORIZON_END is missing from fragment.wesl').not.toBeNull();
    expect(parseFloat(match![1]!)).toBe(HANDOFF_HORIZON_END);
  });
});
