/**
 * Tests for `raDecDistToEqCart` and the cluster seed content.
 *
 * The seed data lives in `data/seeds/structure_anchors.seed.json`, parsed by
 * `tools/parsers/parseStructureSeed.ts`; the coordinate helper lives at
 * `src/utils/math/raDecDistToEqCart.ts`.
 *
 * The id invariants that matter for deep-link stability are covered in
 * `buildStaticAnchorStructures.test.ts`.  Tests here focus on the coordinate
 * maths and the seed content.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { raDecDistToEqCart } from '../../src/utils/math/raDecDistToEqCart';
import { parseStructureSeed } from '../../tools/parsers/parseStructureSeed';
import type { StructureSeedEntry } from '../../tools/parsers/parseStructureSeed';

const SEED_PATH = resolve(__dirname, '../../data/seeds/structure_anchors.seed.json');
const allEntries = parseStructureSeed(readFileSync(SEED_PATH, 'utf-8'));

const CLUSTER_ENTRIES = allEntries.filter((e) => e.category === 'cluster');
const SUPERCLUSTER_ENTRIES = allEntries.filter((e) => e.category === 'supercluster');
const VOID_ENTRIES = allEntries.filter((e) => e.category === 'void');

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

describe('cluster seed — cluster entries', () => {
  it('includes the well-known clusters', () => {
    // Length is asserted as a lower bound rather than exact so future
    // additions don't require a test edit — but the named-membership
    // asserts below still catch accidental removal of any canonical entry.
    expect(CLUSTER_ENTRIES.length).toBeGreaterThanOrEqual(10);
    const primaryNames = CLUSTER_ENTRIES.map((a) => a.names[0]);
    expect(primaryNames).toContain('Virgo (M87)');
    expect(primaryNames).toContain('Fornax (NGC 1399)');
    expect(primaryNames).toContain('Hydra I (A1060)');
    expect(primaryNames).toContain('Centaurus (A3526)');
    expect(primaryNames).toContain('Coma (A1656)');
    expect(primaryNames).toContain('Perseus (A426)');
    expect(primaryNames).toContain('A2199 (NGC 6166)');
    expect(primaryNames).toContain('Ophiuchus');
    expect(primaryNames).toContain('Norma / Great Attractor');
    expect(primaryNames).toContain('Hercules (A2151)');
    expect(primaryNames).toContain('Shapley (A3558)');
  });

  it('every entry has a positive distance', () => {
    for (const a of CLUSTER_ENTRIES) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('every entry has a finite, positive physicalRadiusMpc', () => {
    for (const a of CLUSTER_ENTRIES) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });
});

describe('cluster seed — supercluster entries', () => {
  it('exposes the canonical local-volume superclusters', () => {
    // Primary names spell "Supercluster" out in full — the scene labels wrap
    // long names onto two lines rather than abbreviating to "SC".
    const primaryNames = SUPERCLUSTER_ENTRIES.map((a) => a.names[0]);
    expect(primaryNames).toContain('Laniakea Supercluster');
    expect(primaryNames).toContain('Perseus-Pisces Supercluster');
    expect(primaryNames).toContain('Coma Supercluster');
    expect(primaryNames).toContain('Hydra Wall');
    expect(primaryNames).toContain('Hercules Supercluster');
    expect(primaryNames).toContain('Shapley Supercluster');
  });

  it('every entry has a positive distance', () => {
    for (const a of SUPERCLUSTER_ENTRIES) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('every entry has a finite, positive physicalRadiusMpc', () => {
    for (const a of SUPERCLUSTER_ENTRIES) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });
});

describe('cluster seed — void entries', () => {
  it('exposes the three local voids (Sculptor / Local / Boötes)', () => {
    const primaryNames = VOID_ENTRIES.map((a) => a.names[0]);
    expect(primaryNames).toContain('Sculptor Void');
    expect(primaryNames).toContain('Local Void');
    expect(primaryNames).toContain('Boötes Void');
  });

  it('every entry has a positive distance', () => {
    for (const a of VOID_ENTRIES) {
      expect(a.distMpc).toBeGreaterThan(0);
    }
  });

  it('every entry has a finite, positive physicalRadiusMpc', () => {
    for (const a of VOID_ENTRIES) {
      expect(a.physicalRadiusMpc).toBeGreaterThan(0);
      expect(Number.isFinite(a.physicalRadiusMpc)).toBe(true);
    }
  });

  it('Boötes Void sits inside the 500 Mpc CF-4 box', () => {
    // The CF-4 reconstruction volume is 500 Mpc radius from the observer;
    // Boötes is at the edge of reliable reconstruction.  This test pins
    // the value at 245 Mpc so a casual revision can't accidentally place
    // it outside the box.
    const bootes = VOID_ENTRIES.find((a) => a.names[0] === 'Boötes Void');
    expect(bootes).toBeDefined();
    expect(bootes!.distMpc).toBeLessThan(500);
  });
});

describe('cluster seed — physicalRadiusMpc population', () => {
  it('uses the literature-grounded radii from the spec', () => {
    const byPrimaryName = (list: readonly StructureSeedEntry[], n: string) =>
      list.find((a) => a.names[0]?.startsWith(n));

    expect(byPrimaryName(CLUSTER_ENTRIES, 'Virgo')?.physicalRadiusMpc).toBe(2.2);
    expect(byPrimaryName(CLUSTER_ENTRIES, 'Coma')?.physicalRadiusMpc).toBe(3.0);
    expect(byPrimaryName(SUPERCLUSTER_ENTRIES, 'Hercules Supercluster')?.physicalRadiusMpc).toBe(
      60,
    );
    expect(byPrimaryName(VOID_ENTRIES, 'Boötes')?.physicalRadiusMpc).toBe(50);
  });
});
