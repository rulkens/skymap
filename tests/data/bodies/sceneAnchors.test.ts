import { describe, it, expect } from 'vitest';
import { SCENE_ANCHORS } from '../../../src/data/bodies/sceneAnchors';

describe('SCENE_ANCHORS', () => {
  it('the Sun anchor is heliocentric zero', () => {
    const sun = SCENE_ANCHORS.find((anchor) => anchor.id === 'sun');
    expect(sun?.positionMpc).toEqual([0, 0, 0]);
  });
});
