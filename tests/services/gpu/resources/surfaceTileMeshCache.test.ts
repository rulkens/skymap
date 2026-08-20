import { describe, it, expect, vi } from 'vitest';

// Mocked so a "did it re-bake" assertion doesn't depend on
// `bakeSurfaceTileMesh`'s own (slow-ish) trig work, and so each call
// returns a fresh, distinguishable object — a cache hit that accidentally
// re-baked would fail a `toBe` identity check even if the numeric content
// happened to match.
vi.mock('../../../../src/utils/scene/bakeSurfaceTileMesh', () => ({
  bakeSurfaceTileMesh: vi.fn(() => ({
    positions: new Float32Array(0),
    uvs: new Float32Array(0),
    tangents: new Float32Array(0),
    indices: new Uint32Array(0),
  })),
}));

import { createSurfaceTileMeshCache } from '../../../../src/services/gpu/resources/surfaceTileMeshCache';
import { bakeSurfaceTileMesh } from '../../../../src/utils/scene/bakeSurfaceTileMesh';

const RESOLUTION = 4;

describe('surfaceTileMeshCache', () => {
  it('bakes on miss, returns the cached reference on a hit', () => {
    const cache = createSurfaceTileMeshCache(8, RESOLUTION);
    const id = { z: 5, x: 3, y: 2 };

    const first = cache.get(id, 1);
    expect(vi.mocked(bakeSurfaceTileMesh)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bakeSurfaceTileMesh)).toHaveBeenCalledWith(id, RESOLUTION);

    const second = cache.get(id, 2);
    expect(second).toBe(first);
    expect(vi.mocked(bakeSurfaceTileMesh)).toHaveBeenCalledTimes(1);
  });

  it('evicts the LRU entry when full, re-baking it on its next request', () => {
    vi.mocked(bakeSurfaceTileMesh).mockClear();
    const cache = createSurfaceTileMeshCache(2, RESOLUTION);
    const idA = { z: 5, x: 0, y: 0 };
    const idB = { z: 5, x: 1, y: 0 };
    const idC = { z: 5, x: 2, y: 0 };

    const meshA1 = cache.get(idA, 1);
    const meshB1 = cache.get(idB, 2);
    // Touching A again makes B the least-recently-touched of the two.
    expect(cache.get(idA, 3)).toBe(meshA1);

    // Capacity 2, both slots occupied (A touched @3, B touched @2): C forces
    // an eviction, and B — the one NOT re-touched — is the LRU victim.
    cache.get(idC, 4);
    expect(vi.mocked(bakeSurfaceTileMesh)).toHaveBeenCalledTimes(3);

    // A survived the eviction (still the same cached object, no rebake)...
    expect(cache.get(idA, 5)).toBe(meshA1);
    expect(vi.mocked(bakeSurfaceTileMesh)).toHaveBeenCalledTimes(3);
    // ...but B did not: its next request is a fresh bake, not the original.
    const meshB2 = cache.get(idB, 6);
    expect(meshB2).not.toBe(meshB1);
    expect(vi.mocked(bakeSurfaceTileMesh)).toHaveBeenCalledTimes(4);
  });
});
