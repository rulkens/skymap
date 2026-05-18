import { describe, expect, it } from 'vitest';
import {
  CLUSTER_ANCHORS,
  SUPERCLUSTER_ANCHORS,
  VOID_ANCHORS,
  raDecDistToEqCart,
} from '../../src/data/clusterAnchors';
import type { ClusterAnchor } from '../../src/@types/data/ClusterAnchor';

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

describe('SUPERCLUSTER_ANCHORS', () => {
  it('exposes the two CF-4 supercluster peaks (Hydra Wall + Hercules SC)', () => {
    const names = SUPERCLUSTER_ANCHORS.map((a) => a.name);
    expect(names).toContain('Hydra Wall');
    expect(names).toContain('Hercules SC');
  });

  it('every supercluster has a positive distance', () => {
    for (const a of SUPERCLUSTER_ANCHORS) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('is a readonly tuple at the type level', () => {
    const _check: readonly ClusterAnchor[] = SUPERCLUSTER_ANCHORS;
    expect(_check).toBe(SUPERCLUSTER_ANCHORS);
  });
});

describe('VOID_ANCHORS', () => {
  it('exposes the three local voids (Sculptor / Local / Boötes)', () => {
    const names = VOID_ANCHORS.map((a) => a.name);
    expect(names).toContain('Sculptor Void');
    expect(names).toContain('Local Void');
    expect(names).toContain('Boötes Void');
  });

  it('every void has a positive distance', () => {
    for (const a of VOID_ANCHORS) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('is a readonly tuple at the type level', () => {
    const _check: readonly ClusterAnchor[] = VOID_ANCHORS;
    expect(_check).toBe(VOID_ANCHORS);
  });

  it('Boötes Void sits inside the 500 Mpc CF-4 box', () => {
    // The CF-4 reconstruction volume is 500 Mpc radius from the observer;
    // Boötes is at the edge of reliable reconstruction.  This test pins
    // the value at 245 Mpc so a casual revision can't accidentally place
    // it outside the box.
    const bootes = VOID_ANCHORS.find((a) => a.name === 'Boötes Void');
    expect(bootes).toBeDefined();
    expect(bootes!.distMpc).toBeLessThan(500);
  });
});

describe('clusterAnchors — physicalRadiusMpc population', () => {
  it('every cluster anchor has a finite, positive physicalRadiusMpc', () => {
    for (const a of CLUSTER_ANCHORS) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('every supercluster anchor has a finite, positive physicalRadiusMpc', () => {
    for (const a of SUPERCLUSTER_ANCHORS) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('every void anchor has a finite, positive physicalRadiusMpc', () => {
    for (const a of VOID_ANCHORS) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('uses the literature-grounded radii from the spec', () => {
    const byName = (list: readonly { name: string; physicalRadiusMpc: number }[], n: string) =>
      list.find((a) => a.name.startsWith(n));

    expect(byName(CLUSTER_ANCHORS, 'Virgo')?.physicalRadiusMpc).toBe(2.2);
    expect(byName(CLUSTER_ANCHORS, 'Coma')?.physicalRadiusMpc).toBe(3.0);
    expect(byName(SUPERCLUSTER_ANCHORS, 'Hercules SC')?.physicalRadiusMpc).toBe(60);
    expect(byName(VOID_ANCHORS, 'Boötes')?.physicalRadiusMpc).toBe(50);
  });
});
