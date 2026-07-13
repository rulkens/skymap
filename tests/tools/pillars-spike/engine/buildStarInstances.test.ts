import { describe, expect, it } from 'vitest';

import { buildStarInstances } from '../../../../tools/pillars-spike/src/engine/buildStarInstances';
import { LIGHT_STARS } from '../../../../tools/pillars-spike/src/data/lightStars';

describe('buildStarInstances', () => {
  it('emits 32-byte-stride instances: light stars first, at their catalog positions', () => {
    const out = buildStarInstances(LIGHT_STARS, 5, 42);
    expect(out.length).toBe((3 + 5) * 8);
    // The billboards for the 3 LIGHTING stars must sit exactly at the
    // positions the bake lights from — a drift here shows a glow point
    // detached from its own shadows.
    LIGHT_STARS.forEach((s, i) => {
      expect(out[i * 8 + 0]).toBeCloseTo(s.position[0]);
      expect(out[i * 8 + 1]).toBeCloseTo(s.position[1]);
      expect(out[i * 8 + 2]).toBeCloseTo(s.position[2]);
      expect(out[i * 8 + 4]).toBeCloseTo(s.color[0]);
    });
  });

  it('is deterministic per seed and varies across seeds', () => {
    const a1 = buildStarInstances(LIGHT_STARS, 8, 7);
    const a2 = buildStarInstances(LIGHT_STARS, 8, 7);
    const b = buildStarInstances(LIGHT_STARS, 8, 8);
    expect(Array.from(a1)).toEqual(Array.from(a2));
    expect(Array.from(a1)).not.toEqual(Array.from(b));
  });
});
