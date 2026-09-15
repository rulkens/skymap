import { describe, expect, it } from 'vitest';

import type { SurfacePatchAnchor } from '../../../src/@types/scene/SurfacePatchAnchor';
import { patchVertexOffsetM } from '../../../src/utils/scene/patchVertexOffsetM';

/**
 * The reference is deliberately a DIFFERENT formula, not a transcription:
 * `(R + h) · dir(lon, lat) − R · dir(lon0, lat0)` in plain f64. Its own error
 * floor is the cancellation of two near-unit f64 vectors, 2.2e-16 · R ≈ 1.4e-9 m
 * at any level, so the tolerances below sit ~70× above the floor and far below
 * the shader's f32 budget — a passing test proves the algebraic identity, never
 * the GPU's numerics (spec §7.1; those are task 9's eye-check). `R + h` is legal
 * HERE and forbidden in f32: f64's ulp at 6.4e6 m is 1e-9 m, f32's is 0.5 m.
 */
function referenceOffsetM(
  anchor: SurfacePatchAnchor,
  radiusM: number,
  s: number,
  t: number,
  heightM: number,
): [number, number, number] {
  const dir = (lon: number, lat: number): [number, number, number] => [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ];
  const a = dir(anchor.lon0Rad + s * anchor.dLonRad, anchor.lat0Rad + t * anchor.dLatRad);
  const b = dir(anchor.lon0Rad, anchor.lat0Rad);
  const r = radiusM + heightM;
  return [r * a[0] - radiusM * b[0], r * a[1] - radiusM * b[1], r * a[2] - radiusM * b[2]];
}

const SAMPLES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [0.5, 0.5],
  [0.37, 0.81],
];

const EARTH_RADIUS_M = 6378137;

const Z19_ANCHOR: SurfacePatchAnchor = {
  lon0Rad: (12.52 * Math.PI) / 180,
  lat0Rad: (55.66 * Math.PI) / 180,
  dLonRad: (2 * Math.PI) / 2 ** 19,
  dLatRad: Math.PI / 2 ** 18,
};

const Z7_ANCHOR: SurfacePatchAnchor = {
  lon0Rad: (-37.25 * Math.PI) / 180,
  lat0Rad: (41.8103 * Math.PI) / 180,
  dLonRad: (2 * Math.PI) / 2 ** 7,
  dLatRad: Math.PI / 2 ** 6,
};

describe('patchVertexOffsetM', () => {
  it('matches an f64 absolute-direction reference at z19', () => {
    for (const [s, t] of SAMPLES) {
      const got = patchVertexOffsetM(Z19_ANCHOR, EARTH_RADIUS_M, s, t, 0);
      const want = referenceOffsetM(Z19_ANCHOR, EARTH_RADIUS_M, s, t, 0);
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-7);
    }
  });

  it('matches an f64 absolute-direction reference at z19, displaced', () => {
    for (const [s, t] of SAMPLES) {
      const got = patchVertexOffsetM(Z19_ANCHOR, EARTH_RADIUS_M, s, t, 37);
      const want = referenceOffsetM(Z19_ANCHOR, EARTH_RADIUS_M, s, t, 37);
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-7);
    }
  });

  it('matches an f64 absolute-direction reference at z7', () => {
    for (const [s, t] of SAMPLES) {
      const got = patchVertexOffsetM(Z7_ANCHOR, EARTH_RADIUS_M, s, t, 0);
      const want = referenceOffsetM(Z7_ANCHOR, EARTH_RADIUS_M, s, t, 0);
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('matches an f64 absolute-direction reference at z7, displaced', () => {
    for (const [s, t] of SAMPLES) {
      const got = patchVertexOffsetM(Z7_ANCHOR, EARTH_RADIUS_M, s, t, 8000);
      const want = referenceOffsetM(Z7_ANCHOR, EARTH_RADIUS_M, s, t, 8000);
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('returns exactly zero at the patch origin', () => {
    // `Math.abs`, not `toBe(0)`: the `−hav_lat` term makes these −0, and a
    // patch corner landing on the f64 origin EXACTLY is the whole f32 argument.
    for (const c of patchVertexOffsetM(Z19_ANCHOR, EARTH_RADIUS_M, 0, 0, 0)) {
      expect(Math.abs(c)).toBe(0);
    }
  });

  it('is exactly h along the anchor’s up at the patch origin', () => {
    const h = 37;
    const got = patchVertexOffsetM(Z19_ANCHOR, EARTH_RADIUS_M, 0, 0, h);
    const { lon0Rad, lat0Rad } = Z19_ANCHOR;
    const want = [
      h * Math.cos(lat0Rad) * Math.cos(lon0Rad),
      h * Math.cos(lat0Rad) * Math.sin(lon0Rad),
      h * Math.sin(lat0Rad),
    ];
    for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - want[c]!)).toBeLessThanOrEqual(1e-9);
  });
});
