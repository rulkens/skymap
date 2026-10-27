/**
 * engageDistanceM — the lens-relative engage distance the tile release radius
 * doubles. Checked against the real walk: past twice it, no lens engages.
 */

import { describe, expect, it } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { engageDistanceM } from '../../../src/utils/surfaceTiles/engageDistanceM';
import { cutSurfaceTiles } from '../../../src/utils/surfaceTiles/cutSurfaceTiles';
import { surfaceTileBandFromBounds } from '../../../src/utils/surfaceTiles/surfaceTileBandFromBounds';
import { composeBodySlabMvp } from '../../../src/utils/camera/composeBodySlabMvp';
import { frustumPerspectiveF64 } from '../../../src/utils/camera/frustumPerspectiveF64';
import { SURFACE_TILE_LOD_BIAS, SURFACE_TILE_PX } from '../../../src/data/bodies/surfaceTileParams';

const R = 6.371e6;
/** The small tier's base level: the farthest-engaging one. */
const BASE = 2;
const pxPerRadOf = (fovDeg: number, px: number) => px / (2 * Math.tan((fovDeg * Math.PI) / 360));

/** Whether a square `px` viewport of `fovDeg` at `distanceM` over `latDeg`, looking at the centre, engages. */
function engages(fovDeg: number, px: number, distanceM: number, latDeg: number): boolean {
  const lat = (latDeg * Math.PI) / 180;
  const eye: Vec3 = [distanceM * Math.cos(lat), 0, distanceM * Math.sin(lat)];
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const look = mat4d.lookAt([0, 0, 0], [-eye[0], 0, -eye[2]], [-Math.sin(lat), 0, Math.cos(lat)]);
  const frustum = { tanLeft: -t, tanRight: t, tanDown: -t, tanUp: t };
  const vp = mat4d.multiply(frustumPerspectiveF64(frustum, 1, null), look) as Float64Array;
  const { requests } = cutSurfaceTiles({
    camPosLocalM: eye,
    views: [{ viewProjLocal: composeBodySlabMvp(vp, eye, R), viewportPx: [px, px] }],
    radiusM: R,
    reliefM: [0, 0],
    baseLevel: BASE,
    bands: [surfaceTileBandFromBounds({ west: -180, south: -90, east: 180, north: 90 }, 3, 19)],
    tilePx: SURFACE_TILE_PX,
    lodBias: SURFACE_TILE_LOD_BIAS,
    residentSlot: () => null,
  });
  return requests.zWin > BASE;
}

const LATITUDES = Array.from({ length: 18 }, (_, i) => i * 5);

describe('engageDistanceM', () => {
  it('matches the sweep at a normal lens and at the telephoto extreme', () => {
    expect(engageDistanceM(R, pxPerRadOf(60, 4096)) / R).toBeCloseTo(4.46, 1);
    expect(engageDistanceM(R, pxPerRadOf(0.5, 8192)) / R).toBeCloseTo(1075, -1);
  });

  it('is scale-free in body radii', () => {
    const p = pxPerRadOf(60, 4096);
    expect(engageDistanceM(2 * R, p)).toBeCloseTo(2 * engageDistanceM(R, p), 6);
  });

  // Bug caught: a release radius inside the engage distance engages and
  // releases the atlases on alternate frames.
  it.each([
    [0.5, 8192],
    [10, 4096],
    [60, 4096],
    [100, 4096],
    [60, 1080],
    [100, 1080],
  ])('no latitude engages past twice it (%s° on %s px)', (fovDeg, px) => {
    const engageM = engageDistanceM(R, pxPerRadOf(fovDeg, px));
    for (const lat of LATITUDES)
      expect(engages(fovDeg, px, 2 * engageM, lat), `${lat}°`).toBe(false);
    // Tight, not a blanket overestimate: a little inside it, tiles engage.
    const insideM = Math.max(1.05 * R, 0.8 * engageM);
    expect(LATITUDES.some((lat) => engages(fovDeg, px, insideM, lat))).toBe(true);
  });
});
