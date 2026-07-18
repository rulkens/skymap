import { describe, it, expect } from 'vitest';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';

describe('SCENE_BODIES registry', () => {
  it('includes Earth, the seeded stars, and the seeded planets', () => {
    const ids = new Set(SCENE_BODIES.map((b) => b.id));
    expect(ids.has('earth')).toBe(true);
    expect(ids.has('sun')).toBe(true);
    expect(ids.has('sirius')).toBe(true);
    expect(ids.has('moon')).toBe(true);
    expect(ids.has('jupiter')).toBe(true);
  });
});
