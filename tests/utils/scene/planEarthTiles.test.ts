/**
 * planEarthTiles — the quadtree refinement that decides which Earth surface
 * tiles should be resident this frame.
 *
 * Spec tests 2, 3 and 4. All three cover behaviour no compiler check reaches and
 * that is close to invisible on screen when it breaks:
 *
 *   - A wrong exponent in the level rule starves the atlas or thrashes it, and
 *     shows only as vague blurriness. Hence a hand-computed anchor with the
 *     arithmetic written out, plus monotonicity across three halvings.
 *   - A missing `maxLevel` clamp draws a sustained 404 storm on every close
 *     approach against a pyramid shallower than the camera wants.
 *   - Missing horizon rejection roughly doubles the fetches and the atlas
 *     pressure while looking completely normal.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { planEarthTiles } from '../../../src/utils/scene/planEarthTiles';
import { earthTexelMetres } from '../../../src/utils/scene/earthTexelMetres';
import { earthTileXyForUv } from '../../../src/utils/scene/earthTileXyForUv';
import {
  EARTH_TILE_MIN_LEVEL,
  EARTH_TILE_PX,
  EARTH_TILE_WINDOW_SIDE,
} from '../../../src/data/bodies/earthTileParams';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EARTH_RADIUS_KM = 6371;
const FOV_Y_RAD = (40 * Math.PI) / 180;
const VIEWPORT: [number, number] = [2560, 1440];

/** A camera `altitudeKm` above the point at (`lonDeg`, `latDeg`), aimed at the
 *  planet centre. Deliberately off any tile boundary, so "the tile under the
 *  camera" is unambiguous rather than a four-way tie. */
function nadirAt(altitudeKm: number, lonDeg = 20, latDeg = 15) {
  const d = 1 + altitudeKm / EARTH_RADIUS_KM;
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const camPosLocal: Vec3 = [
    d * Math.cos(lat) * Math.cos(lon),
    d * Math.cos(lat) * Math.sin(lon),
    d * Math.sin(lat),
  ];
  const view = mat4.lookAt(camPosLocal, [0, 0, 0], [0, 0, 1]);
  const proj = mat4.perspective(FOV_Y_RAD, VIEWPORT[0] / VIEWPORT[1], 0.001, 100);
  const viewProjLocal = new Float32Array(mat4.multiply(proj, view));
  return {
    kind: 'surface' as const,
    camPosLocal,
    viewProjLocal,
    viewportPx: VIEWPORT,
    minLevel: EARTH_TILE_MIN_LEVEL,
    maxLevel: 13,
    windowSide: EARTH_TILE_WINDOW_SIDE,
    tilePx: EARTH_TILE_PX,
  };
}

/**
 * The level a flat-plane texel-density argument says a nadir camera needs.
 *
 *   groundMetresPerPixel = h · 2·tan(fovY/2) / viewportHeightPx
 *
 * The `2·tan(fovY/2)` is the exact vertical extent of the frustum one unit
 * ahead; the spec's prose uses the small-angle `fovY` instead, which is why its
 * own worked example comes out at 4702 m where the exact form gives 4903 m
 * against a stated 4892. Then take the shallowest level whose texel is at least
 * that fine.
 *
 * Worked, for h = 1000 km:
 *   gmpp = 1_000_000 · 2·tan(20°) / 1440 = 1_000_000 · 0.727940 / 1440 = 505.5 m
 *   earthTexelMetres(7) = 611.5 m  — too coarse
 *   earthTexelMetres(8) = 305.7 m  — first level fine enough  ⇒ level 8
 */
function expectedLevel(altitudeKm: number): number {
  const gmpp = (altitudeKm * 1000 * 2 * Math.tan(FOV_Y_RAD / 2)) / VIEWPORT[1];
  let z = EARTH_TILE_MIN_LEVEL;
  while (earthTexelMetres(z) > gmpp) z++;
  return z;
}

describe('planEarthTiles', () => {
  it('reaches the level a hand-computed texel density calls for', () => {
    expect(expectedLevel(1000)).toBe(8); // guards the arithmetic in the comment above
    expect(planEarthTiles(nadirAt(1000)).zWin).toBe(8);
  });

  it('gains exactly one level per halving of altitude', () => {
    let previous = planEarthTiles(nadirAt(1000)).zWin;
    for (const altitudeKm of [500, 250, 125]) {
      const zWin = planEarthTiles(nadirAt(altitudeKm)).zWin;
      expect(zWin, `${altitudeKm} km`).toBe(previous + 1);
      expect(zWin, `${altitudeKm} km vs hand-computed`).toBe(expectedLevel(altitudeKm));
      previous = zWin;
    }
  });

  it('never exceeds maxLevel, however close the camera gets', () => {
    // A camera low enough to want z11 against a pyramid baked only to z5 — the
    // development-pyramid case, and the one that would otherwise 404-storm.
    const plan = planEarthTiles({ ...nadirAt(125), maxLevel: 5 });
    expect(plan.zWin).toBe(5);
    expect(plan.requests.every((r) => r.tile.z <= 5)).toBe(true);
    expect(plan.requests.length).toBeGreaterThan(0);
  });

  it('drops the far hemisphere', () => {
    // High enough that the whole globe is inside the frustum, so horizon
    // rejection is the only cull doing any work.
    const input = nadirAt(20_000);
    const plan = planEarthTiles(input);
    expect(plan.zWin).toBe(EARTH_TILE_MIN_LEVEL);

    const keys = new Set(plan.requests.map((r) => `${r.tile.z}/${r.tile.x}/${r.tile.y}`));
    const subCamera = earthTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], 5, EARTH_TILE_PX);
    const antipode = earthTileXyForUv([-160 / 360 + 0.5, -15 / 180 + 0.5], 5, EARTH_TILE_PX);

    expect(keys.has(`5/${subCamera[0]}/${subCamera[1]}`), 'sub-camera tile').toBe(true);
    expect(keys.has(`5/${antipode[0]}/${antipode[1]}`), 'antipodal tile').toBe(false);
    // 32 x 16 = 512 tiles cover the globe at level 5; the visible cap at this
    // altitude is 38% of the sphere, so anything near 512 means nothing culled.
    expect(plan.requests.length).toBeLessThan(512 * 0.6);
  });

  it('returns an empty plan rather than nonsense when the camera is on the surface', () => {
    const plan = planEarthTiles({ ...nadirAt(1000), camPosLocal: [1, 0, 0] });
    expect(plan.requests).toEqual([]);
  });
});
