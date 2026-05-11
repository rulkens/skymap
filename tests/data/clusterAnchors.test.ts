import { describe, expect, it } from 'vitest';
import {
  CLUSTER_ANCHORS,
  raDecDistToEqCart,
  type ClusterAnchor,
} from '../../src/data/clusterAnchors';

describe('raDecDistToEqCart', () => {
  it('places Virgo at the expected equatorial Cartesian position', () => {
    // Virgo (M87): RA 12h 30m 49s ≈ 12.5136 h → 187.704° → 3.276 rad.
    // Dec +12° 23′ ≈ 12.383°. Distance 16.5 Mpc.
    // Expected eq-Cart ≈ (-15.98, -2.13, 3.54) Mpc.
    const [x, y, z] = raDecDistToEqCart({
      raHours: 12 + 30 / 60 + 49 / 3600,
      decDeg: 12 + 23 / 60,
      distMpc: 16.5,
    });
    expect(x).toBeCloseTo(-15.98, 1);
    expect(y).toBeCloseTo(-2.13, 1);
    expect(z).toBeCloseTo(3.54, 1);
    // Round-trip distance check.
    expect(Math.hypot(x, y, z)).toBeCloseTo(16.5, 4);
  });

  it('places a north pole anchor at +Z', () => {
    const [x, y, z] = raDecDistToEqCart({ raHours: 0, decDeg: 90, distMpc: 10 });
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(10, 6);
  });
});

describe('CLUSTER_ANCHORS', () => {
  it('exposes exactly the 6 well-known clusters', () => {
    expect(CLUSTER_ANCHORS).toHaveLength(6);
    const names = CLUSTER_ANCHORS.map((a) => a.name);
    expect(names).toContain('Virgo (M87)');
    expect(names).toContain('Coma (A1656)');
    expect(names).toContain('Perseus (A426)');
    expect(names).toContain('Norma / Great Attractor');
    expect(names).toContain('Hercules (A2151)');
    expect(names).toContain('Shapley (A3558)');
  });

  it('every anchor has a positive distance', () => {
    for (const a of CLUSTER_ANCHORS) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('is a readonly tuple at the type level', () => {
    // This compiles only if CLUSTER_ANCHORS is `readonly ClusterAnchor[]`.
    const _check: readonly ClusterAnchor[] = CLUSTER_ANCHORS;
    expect(_check).toBe(CLUSTER_ANCHORS);
  });
});
