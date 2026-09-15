import { describe, expect, it } from 'vitest';

import type { SurfacePatchAnchor } from '../../../src/@types/scene/SurfacePatchAnchor';
import { patchVertexOffsetM } from '../../../src/utils/scene/patchVertexOffsetM';

/**
 * The reference is deliberately a DIFFERENT formula, not a transcription:
 * `R · (dir(lon, lat) − dir(lon0, lat0))` in plain f64. Its own error floor is
 * the cancellation of two near-unit f64 vectors, 2.2e-16 · R ≈ 1.4e-9 m at any
 * level, so the tolerances below sit ~70× above the floor and far below the
 * shader's f32 budget — a passing test proves the algebraic identity, never the
 * GPU's numerics (spec §7.1; those are task 9's eye-check).
 */
function referenceOffsetM(
  anchor: SurfacePatchAnchor,
  radiusM: number,
  s: number,
  t: number,
): [number, number, number] {
  const dir = (lon: number, lat: number): [number, number, number] => [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ];
  const a = dir(anchor.lon0Rad + s * anchor.dLonRad, anchor.lat0Rad + t * anchor.dLatRad);
  const b = dir(anchor.lon0Rad, anchor.lat0Rad);
  return [radiusM * (a[0] - b[0]), radiusM * (a[1] - b[1]), radiusM * (a[2] - b[2])];
}

const SAMPLES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [0.5, 0.5],
  [0.37, 0.81],
];

const EARTH_RADIUS_M = 6378137;

describe('patchVertexOffsetM', () => {
  it('matches an f64 absolute-direction reference at z19', () => {
    const anchor: SurfacePatchAnchor = {
      lon0Rad: (12.52 * Math.PI) / 180,
      lat0Rad: (55.66 * Math.PI) / 180,
      dLonRad: (2 * Math.PI) / 2 ** 19,
      dLatRad: Math.PI / 2 ** 18,
    };
    for (const [s, t] of SAMPLES) {
      const got = patchVertexOffsetM(anchor, EARTH_RADIUS_M, s, t);
      const want = referenceOffsetM(anchor, EARTH_RADIUS_M, s, t);
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-7);
    }
  });

  it('matches an f64 absolute-direction reference at z7', () => {
    const anchor: SurfacePatchAnchor = {
      lon0Rad: (-37.25 * Math.PI) / 180,
      lat0Rad: (41.8103 * Math.PI) / 180,
      dLonRad: (2 * Math.PI) / 2 ** 7,
      dLatRad: Math.PI / 2 ** 6,
    };
    for (const [s, t] of SAMPLES) {
      const got = patchVertexOffsetM(anchor, EARTH_RADIUS_M, s, t);
      const want = referenceOffsetM(anchor, EARTH_RADIUS_M, s, t);
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('returns exactly zero at the patch origin', () => {
    const anchor: SurfacePatchAnchor = {
      lon0Rad: (12.52 * Math.PI) / 180,
      lat0Rad: (55.66 * Math.PI) / 180,
      dLonRad: (2 * Math.PI) / 2 ** 19,
      dLatRad: Math.PI / 2 ** 18,
    };
    // `Math.abs`, not `toBe(0)`: the `−hav_lat` term makes these −0, and a
    // patch corner landing on the f64 origin EXACTLY is the whole f32 argument.
    for (const c of patchVertexOffsetM(anchor, EARTH_RADIUS_M, 0, 0)) expect(Math.abs(c)).toBe(0);
  });
});
