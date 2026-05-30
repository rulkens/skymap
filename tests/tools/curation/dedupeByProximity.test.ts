import { describe, expect, it } from 'vitest';

import { dedupeByProximity, type ProximityPoint } from '../../../tools/curation/dedupeByProximity.js';
import type { Vec3 } from '../../../src/@types/math/Vec3.js';

describe('dedupeByProximity', () => {
  it('drops a candidate inside a featured anchor radius', () => {
    // Anchor at origin, radius 6 Mpc; candidate 2 Mpc away — well inside.
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 6 }];
    const candidates: ProximityPoint[] = [{ worldPos: [2, 0, 0] as Vec3 }];
    expect(dedupeByProximity(featured, candidates, 1)).toEqual([]);
  });

  it('keeps a candidate beyond all anchors', () => {
    // Anchor at origin radius 6, candidate 50 Mpc away — safely outside.
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 6 }];
    const candidates: ProximityPoint[] = [{ worldPos: [50, 0, 0] as Vec3 }];
    expect(dedupeByProximity(featured, candidates, 1)).toEqual(candidates);
  });

  it('applies the floor when anchor radius is smaller than the floor', () => {
    // Anchor radius 0.5, floor 3; candidate 1 Mpc away.
    // Effective threshold = max(0.5, 3) = 3; distance 1 ≤ 3 → dropped.
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 0.5 }];
    const candidates: ProximityPoint[] = [{ worldPos: [1, 0, 0] as Vec3 }];
    expect(dedupeByProximity(featured, candidates, 3)).toEqual([]);
  });

  it('preserves input order of kept candidates', () => {
    // All candidates far from the anchor; check they come back in original order.
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 5 }];
    const candidates: ProximityPoint[] = [
      { worldPos: [100, 0, 0] as Vec3 },
      { worldPos: [200, 0, 0] as Vec3 },
      { worldPos: [150, 0, 0] as Vec3 },
      { worldPos: [300, 0, 0] as Vec3 },
    ];
    const result = dedupeByProximity(featured, candidates, 1);
    expect(result).toEqual(candidates);
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

  it('returns all candidates when featured list is empty', () => {
    const candidates: ProximityPoint[] = [
      { worldPos: [0, 0, 0] as Vec3 },
      { worldPos: [10, 0, 0] as Vec3 },
    ];
    expect(dedupeByProximity([], candidates, 1)).toEqual(candidates);
  });

  it('returns empty array when candidates list is empty', () => {
    const featured = [{ worldPos: [0, 0, 0] as Vec3, radiusMpc: 5 }];
    expect(dedupeByProximity(featured, [], 1)).toEqual([]);
  });
});
