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
import { frustumCornerMagnification } from '../../../src/utils/camera/frustumCornerMagnification';
import { SURFACE_TILE_LOD_BIAS, SURFACE_TILE_PX } from '../../../src/data/bodies/surfaceTileParams';

const R = 6.371e6;
/** The small tier's base level: the farthest-engaging one. */
const BASE = 2;
const pxPerRadOf = (fovDeg: number, px: number) => px / (2 * Math.tan((fovDeg * Math.PI) / 360));

/** A `w`×`h` view of vertical `fovDeg`, the body at `ndc` on screen, the eye
 *  `distanceM` out over `latDeg`. */
function lensAt(fovDeg: number, w: number, h: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const a = w / h;
  const frustum = { tanLeft: -t * a, tanRight: t * a, tanDown: -t, tanUp: t };
  return { frustum, pxPerRad: h / (2 * t) };
}

/** Whether the real walk engages tiles for that view. */
function engages(
  fovDeg: number,
  [w, h]: readonly [number, number],
  distanceM: number,
  latDeg: number,
  [ndcX, ndcY]: readonly [number, number] = [0, 0],
): boolean {
  const lat = (latDeg * Math.PI) / 180;
  const eye: Vec3 = [distanceM * Math.cos(lat), 0, distanceM * Math.sin(lat)];
  const { frustum } = lensAt(fovDeg, w, h);
  // Toward the centre, local north, and right = toward × north; the gaze turns
  // off the body so it lands at `ndc`.
  const toward: Vec3 = [-Math.cos(lat), 0, -Math.sin(lat)];
  const up: Vec3 = [-Math.sin(lat), 0, Math.cos(lat)];
  const right: Vec3 = [0, toward[2] * up[0] - toward[0] * up[2], 0];
  const tx = ndcX * frustum.tanRight;
  const ty = ndcY * frustum.tanUp;
  const gaze = [0, 1, 2].map((i) => toward[i]! - tx * right[i]! - ty * up[i]!);
  const look = mat4d.lookAt([0, 0, 0], gaze, up);
  const vp = mat4d.multiply(frustumPerspectiveF64(frustum, 1, null), look) as Float64Array;
  const { requests } = cutSurfaceTiles({
    camPosLocalM: eye,
    views: [{ viewProjLocal: composeBodySlabMvp(vp, eye, R), viewportPx: [w, h] }],
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
      expect(engages(fovDeg, [px, px], 2 * engageM, lat), `${lat}°`).toBe(false);
    // Tight, not a blanket overestimate: a little inside it, tiles engage.
    const insideM = Math.max(1.05 * R, 0.8 * engageM);
    expect(LATITUDES.some((lat) => engages(fovDeg, [px, px], insideM, lat))).toBe(true);
  });

  // Bug caught: a wide lens magnifies its edges ~1/cos²θ, so a body off-axis
  // engaged out to 3.7× the centre-fitted distance and the atlases released
  // under tiles the screen still wanted.
  it.each([
    [60, [1920, 1080], [1, 1]],
    [100, [1920, 1080], [0.8, 0]],
    [100, [1920, 1080], [0.8, 0.8]],
    [90, [2048, 2048], [1, 1]],
  ] as const)(
    'off-axis, nothing engages past twice it at the corner lens (%s° on %j, body at %j)',
    (fovDeg, size, ndc) => {
      const { frustum, pxPerRad } = lensAt(fovDeg, size[0], size[1]);
      const engageM = engageDistanceM(R, pxPerRad * frustumCornerMagnification(frustum));
      for (const lat of LATITUDES)
        expect(engages(fovDeg, size, 2 * engageM, lat, ndc), `${lat}°`).toBe(false);
    },
  );
});
