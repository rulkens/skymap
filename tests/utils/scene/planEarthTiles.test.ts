/**
 * planEarthTiles — the quadtree refinement that decides which Earth surface
 * tiles should be resident this frame.
 *
 * Spec tests 2 to 5. All four cover behaviour no compiler check reaches and
 * that is close to invisible on screen when it breaks:
 *
 *   - A wrong exponent in the level rule starves the atlas or thrashes it, and
 *     shows only as vague blurriness. Hence a hand-computed anchor with the
 *     arithmetic written out, plus monotonicity across three halvings.
 *   - A missing `maxLevel` clamp draws a sustained 404 storm on every close
 *     approach against a pyramid shallower than the camera wants.
 *   - Missing horizon rejection roughly doubles the fetches and the atlas
 *     pressure while looking completely normal.
 *   - A wrong wrap in the page-table window shows up ONLY in the Pacific: a
 *     window that silently drops everything west of the seam would still pass
 *     a naive "every leaf is inside the window" check, because the naive check
 *     is the one written without the wrap in mind.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { planEarthTiles } from '../../../src/utils/scene/planEarthTiles';
import { earthTexelMetres } from '../../../src/utils/scene/earthTexelMetres';
import { earthTileXyForUv } from '../../../src/utils/scene/earthTileXyForUv';
import { earthTileColumns } from '../../../src/utils/scene/earthTileColumns';
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

  it('emits leaves on both sides of the antimeridian, all inside the wrapped window', () => {
    // Longitude 180.5: half a degree past the seam, well inside the tile that
    // starts there (that tile is 1.40625° wide at the z8 this altitude reaches,
    // per `expectedLevel`, so 0.5° in is nowhere near either edge). Longitude
    // 180 itself would be the wrong choice — atan2 of a `sin(pi)` that is a few
    // ULPs off zero could tip the sub-camera tile to either side of the seam,
    // making the test's own anchor a coin flip. Latitude 5 sidesteps a
    // different corner: the equator lands EXACTLY on a row boundary at this
    // altitude (row height 1.40625° divides 90° with no remainder), and this
    // test is not the one asserting that boundary's rounding direction.
    const plan = planEarthTiles(nadirAt(1000, 180.5, 5));
    const cols = earthTileColumns(plan.zWin, EARTH_TILE_PX);
    const rows = cols / 2;

    // Normalise each leaf's column to a fraction of the full globe rather than
    // comparing raw `x` — a leaf that refined only to a coarser level has a
    // smaller `cols` of its own, so its `x` is not on the same scale as a
    // finest-level leaf's. A wide 10% margin on either side of the seam keeps
    // this independent of exactly which level any given leaf lands at.
    const xFrac = ({ z, x }: { z: number; x: number }) => x / earthTileColumns(z, EARTH_TILE_PX);
    expect(
      plan.requests.some((r) => xFrac(r.tile) < 0.1),
      'tile east of the seam',
    ).toBe(true);
    expect(
      plan.requests.some((r) => xFrac(r.tile) > 0.9),
      'tile west of the seam',
    ).toBe(true);

    // Only a leaf AT zWin is a single window cell; a coarser leaf spans several
    // cells and is kept by overlap rather than containment, so it is not
    // expected to land fully inside the window and is excluded here.
    const finest = plan.requests.filter((r) => r.tile.z === plan.zWin);
    expect(finest.length).toBeGreaterThan(0);
    for (const { tile } of finest) {
      const dx = (((tile.x - plan.winX0) % cols) + cols) % cols;
      expect(dx, `x=${tile.x} wraps into the window`).toBeGreaterThanOrEqual(0);
      expect(dx, `x=${tile.x} wraps into the window`).toBeLessThan(EARTH_TILE_WINDOW_SIDE);
      const dy = tile.y - plan.winY0;
      expect(dy, `y=${tile.y} sits in the window`).toBeGreaterThanOrEqual(0);
      expect(dy, `y=${tile.y} sits in the window`).toBeLessThan(EARTH_TILE_WINDOW_SIDE);
    }

    // The window origin is itself a legal grid coordinate: wrapped on
    // longitude, where the grid is wider than the window, and clamped (never
    // wrapped) on latitude, which has no seam to wrap across.
    expect(plan.winX0).toBeGreaterThanOrEqual(0);
    expect(plan.winX0).toBeLessThan(cols);
    expect(plan.winY0).toBeGreaterThanOrEqual(0);
    expect(plan.winY0).toBeLessThanOrEqual(Math.max(0, rows - EARTH_TILE_WINDOW_SIDE));
  });
});
