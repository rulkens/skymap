/**
 * skyEntryChanged — the row's news test: a still or sub-metre-drifting view republishes
 * nothing, while a metre of travel or an altitude-gate flip does.
 */
import { describe, it, expect } from 'vitest';

import { skyEntryChanged } from '../../../src/utils/sky/skyEntryChanged';
import { NO_SKY_ENTRY } from '../../../src/data/sky/noSkyEntry';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { SkyEntryFacts } from '../../../src/@types/engine/SkyEntryFacts';

const at = (x: number, altitudeM: number): SkyEntryFacts => ({
  spot: { body: asSceneBodyId('earth'), lonRad: 0, latRad: 0 },
  pointLocalM: [6_371_000 + x, 0, 0],
  altitudeM,
});

describe('skyEntryChanged', () => {
  it('ignores sub-metre drift and altitude moves on one side of the ceiling', () => {
    expect(skyEntryChanged(at(0, 5_000), at(0.5, 5_100))).toBe(false);
  });

  it('reports a metre of travel', () => {
    expect(skyEntryChanged(at(0, 5_000), at(2, 5_000))).toBe(true);
  });

  it('reports an unmoved spot whose altitude crosses the ceiling', () => {
    expect(skyEntryChanged(at(0, 19_000), at(0, 21_000))).toBe(true);
  });

  it('reports a spot appearing', () => {
    expect(skyEntryChanged({ ...NO_SKY_ENTRY, altitudeM: 5_000 }, at(0, 5_000))).toBe(true);
  });
});
