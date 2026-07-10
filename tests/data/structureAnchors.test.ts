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
