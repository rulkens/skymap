import { describe, it, expect } from 'vitest';
import { SCENE_RINGS } from '../../../src/data/bodies/sceneRings';
import { BODY_TEXTURE_REGISTRY } from '../../../src/data/bodies/bodyTextureRegistry';

describe('SCENE_RINGS', () => {
  it('structural invariants', () => {
    // Every ring rides a textured body's orientation + position, so its bodyId
    // MUST key BODY_TEXTURE_REGISTRY — a ring pointing at an un-textured (or
    // typo'd) body would have no frame to inherit and nothing else catches it.
    for (const ring of SCENE_RINGS) {
      expect(ring.bodyId in BODY_TEXTURE_REGISTRY).toBe(true);
    }

    // A ring is an annulus: the inner edge must sit inside the outer edge, or the
    // draw-time radii resolve to a degenerate (or inverted) strip.
    for (const ring of SCENE_RINGS) {
      expect(ring.innerRadiusKm).toBeLessThan(ring.outerRadiusKm);
    }

    // Only Saturn's ring is modelled today; its strip texture is the single
    // RingTextureId member.
    const saturn = SCENE_RINGS.find((ring) => ring.bodyId === 'saturn');
    expect(saturn).toBeDefined();
    expect(saturn?.textureId).toBe('saturn-ring');
  });
});
