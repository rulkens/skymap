import { describe, expect, it } from 'vitest';

import {
  dedupeByProximity,
  type ProximityPoint,
} from '../../../tools/curation/dedupeByProximity.js';
import type { Vec3 } from '../../../src/@types/math/Vec3.js';

describe('dedupeByProximity', () => {
  it('applies the floor when anchor radius is smaller than the floor', () => {
    // Anchor radius 0.5, floor 3; candidate 1 Mpc away.
    // Effective threshold = max(0.5, 3) = 3; distance 1 ≤ 3 → dropped.
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 0.5 }];
    const candidates: ProximityPoint[] = [{ worldPos: [1, 0, 0] as Vec3 }];
    expect(dedupeByProximity(featured, candidates, 3)).toEqual([]);
  });

  it('drops candidates exactly at the threshold (boundary is exclusive)', () => {
    // Anchor radius 5, floor 1; candidate exactly 5 Mpc away → dropped
    // ("exceeds" means strictly greater; exactly AT threshold is dropped).
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 5 }];
    const candidates: ProximityPoint[] = [{ worldPos: [5, 0, 0] as Vec3 }];
    expect(dedupeByProximity(featured, candidates, 1)).toEqual([]);
  });

  it('keeps a candidate past the threshold by a hair', () => {
    // Anchor radius 5, candidate 5.001 Mpc away → kept.
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 5 }];
    const candidates: ProximityPoint[] = [{ worldPos: [5.001, 0, 0] as Vec3 }];
    expect(dedupeByProximity(featured, candidates, 1)).toEqual(candidates);
  });
});
