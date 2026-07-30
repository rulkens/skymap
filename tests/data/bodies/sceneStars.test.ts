import { describe, it, expect } from 'vitest';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';

const findStar = (id: string) => {
  const star = SCENE_STARS.find((s) => s.id === id);
  if (!star) throw new Error(`missing seeded star: ${id}`);
  return star;
};

describe('SCENE_STARS', () => {
  it('carries the Sun with its real radius', () => {
    expect(findStar('sun').radiusKm).toBe(696340);
  });

  it('the local map covers the neighbourhood', () => {
    expect(SCENE_STARS.length).toBeGreaterThanOrEqual(20);
    for (const star of SCENE_STARS) {
      expect(Number.isFinite(star.absMag)).toBe(true);
      for (const c of star.color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
