import { describe, it, expect } from 'vitest';

import { isSceneBodyId } from '../../../src/utils/scene/isSceneBodyId';

describe('isSceneBodyId', () => {
  it('accepts a planet, a seeded star and a Layer-owned craft', () => {
    expect(['mars', 'sirius', 'hubble'].every(isSceneBodyId)).toBe(true);
  });

  // A set built from the body-state keys would admit the Galactic Centre: it is
  // positioned, so it has a state, but it is a place, not a body.
  it('rejects a place and an unknown id', () => {
    expect(isSceneBodyId('galactic-centre')).toBe(false);
    expect(isSceneBodyId('bogus')).toBe(false);
  });
});
