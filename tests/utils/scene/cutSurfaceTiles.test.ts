/**
 * cutSurfaceTiles — retargets `planEarthTiles.test.ts`'s fixtures (that file
 * is untouched; it still exercises the walk's original entry point until
 * Task 5 deletes it) plus new coverage for the ancestor-fallback residency
 * resolution that `cut` adds on top of the same walk. The retargeted tests
 * drop `winX0`/`winY0`/window-membership assertions — `cutSurfaceTiles` has
 * no page-table window — and read `zWin`/`requests` off `result.requests`
 * instead of a bare plan.
 *
 * See `planEarthTiles.test.ts`'s own header for why each behaviour here is
 * worth pinning; not restated.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { cutSurfaceTiles } from '../../../src/utils/scene/cutSurfaceTiles';
import { earthBaseLevelForTier } from '../../../src/utils/scene/earthBaseLevelForTier';
import { earthTexelMetres } from '../../../src/utils/scene/earthTexelMetres';
import { earthTileXyForUv } from '../../../src/utils/scene/earthTileXyForUv';
import { earthTileColumns } from '../../../src/utils/scene/earthTileColumns';
import { earthTileBandRequestAllowed } from '../../../src/utils/scene/earthTileBandRequestAllowed';
import { equirectUvToDirection } from '../../../src/utils/math/equirectUvToDirection';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { composeBodyMvp } from '../../../src/utils/camera/composeBodyMvp';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../src/utils/camera/foregroundFrustum';
import type { EarthTileId } from '../../../src/@types/data/EarthTileId';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const BASE_LEVEL = earthBaseLevelForTier('large');
const MIN_TILE_LEVEL = BASE_LEVEL + 1;

const EARTH_RADIUS_KM = 6371;
const FOV_Y_RAD = (40 * Math.PI) / 180;
const VIEWPORT: [number, number] = [2560, 1440];

/** A `residentSlot` that never resolves — the "nothing atlas-resident" stub
 *  most tests below don't care about. */
const NEVER_RESIDENT = (): null => null;

// Fixtures below build camPosLocalM at radius 1 (`radiusM: 1`) — a
// dimensionless "body-radii" world that degenerates the walk's metres-native
// horizon math (`camLen > radiusM`, `acos(radiusM / camLen)`) back to the
// original unit-sphere form, so every numeric assertion here is unchanged
// from before the metres migration. The dedicated "in metres" tests below
// scale camPosLocalM and radiusM together to a real Earth radius instead,
// proving the walk doesn't silently assume radius 1.
function nadirAt(altitudeKm: number, lonDeg = 20, latDeg = 15) {
  const d = 1 + altitudeKm / EARTH_RADIUS_KM;
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const camPosLocalM: Vec3 = [
    d * Math.cos(lat) * Math.cos(lon),
    d * Math.cos(lat) * Math.sin(lon),
    d * Math.sin(lat),
  ];
  const view = mat4.lookAt(camPosLocalM, [0, 0, 0], [0, 0, 1]);
  const proj = mat4.perspective(FOV_Y_RAD, VIEWPORT[0] / VIEWPORT[1], 0.001, 100);
  // f64 param type (see cutSurfaceTiles's doc) — these fixtures sit at
  // altitudes far above the low-altitude cancellation regime, so widening
  // the f32 `mat4.multiply` result changes no test outcome here.
  const viewProjLocal = new Float64Array(mat4.multiply(proj, view));
  return {
    kind: 'surface' as const,
    camPosLocalM,
    viewProjLocal,
    radiusM: 1,
    viewportPx: VIEWPORT,
    baseLevel: BASE_LEVEL,
    bands: [{ uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: MIN_TILE_LEVEL, max: 13 }],
    tilePx: EARTH_TILE_PX,
    // Fixture default is the 1:1 point, not the shipped `EARTH_TILE_LOD_BIAS`,
    // so every test above that predates the bias keeps asserting the rule it
    // was written against rather than a softened one.
    lodBias: 0,
    residentSlot: NEVER_RESIDENT,
  };
}

/** See `planEarthTiles.test.ts`'s `expectedLevel` for the worked derivation. */
function expectedLevel(altitudeKm: number): number {
  const gmpp = (altitudeKm * 1000 * 2 * Math.tan(FOV_Y_RAD / 2)) / VIEWPORT[1];
  let z = BASE_LEVEL;
  while (earthTexelMetres(z) > gmpp) z++;
  return z;
}

function tiltedAt(altitudeM: number, tiltDeg: number, lonDeg = 20, latDeg = 15) {
  const d = 1 + altitudeM / 1000 / EARTH_RADIUS_KM;
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const camPosLocalM: Vec3 = [
    d * Math.cos(lat) * Math.cos(lon),
    d * Math.cos(lat) * Math.sin(lon),
    d * Math.sin(lat),
  ];
  const up: Vec3 = [camPosLocalM[0] / d, camPosLocalM[1] / d, camPosLocalM[2] / d];
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ];
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const forward: Vec3 = [
    -up[0] * Math.cos(tiltRad) + north[0] * Math.sin(tiltRad),
    -up[1] * Math.cos(tiltRad) + north[1] * Math.sin(tiltRad),
    -up[2] * Math.cos(tiltRad) + north[2] * Math.sin(tiltRad),
  ];
  const target: Vec3 = [
    camPosLocalM[0] + forward[0],
    camPosLocalM[1] + forward[1],
    camPosLocalM[2] + forward[2],
  ];
  const view = mat4.lookAt(camPosLocalM, target, up);
  const proj = mat4.perspective(FOV_Y_RAD, VIEWPORT[0] / VIEWPORT[1], 0.001, 100);
  const viewProjLocal = new Float64Array(mat4.multiply(proj, view));
  const maxLevel = 19;
  return {
    kind: 'surface' as const,
    camPosLocalM,
    viewProjLocal,
    radiusM: 1,
    viewportPx: VIEWPORT,
    baseLevel: BASE_LEVEL,
    bands: [
      { uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: MIN_TILE_LEVEL, max: maxLevel },
    ],
    tilePx: EARTH_TILE_PX,
    lodBias: 0,
    residentSlot: NEVER_RESIDENT,
    maxLevel,
  };
}

function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

/** Same u0/u1/vNorth/vSouth/centre construction the walk itself uses for
 *  tile `z`/`x`/`y`, recomputed here so the horizon-cull fixture below
 *  derives its numbers rather than hard-coding them. */
function tileGeometry(z: number, x: number, y: number) {
  const cols = earthTileColumns(z, EARTH_TILE_PX);
  const rows = cols / 2;
  const u0 = x / cols;
  const u1 = (x + 1) / cols;
  const vNorth = 1 - y / rows;
  const vSouth = 1 - (y + 1) / rows;
  const uMid = (u0 + u1) / 2;
  const vMid = (vNorth + vSouth) / 2;
  return {
    centre: equirectUvToDirection([uMid, vMid]),
    cornerNW: equirectUvToDirection([u0, vNorth]),
    cornerNE: equirectUvToDirection([u1, vNorth]),
    cornerSW: equirectUvToDirection([u0, vSouth]),
    cornerSE: equirectUvToDirection([u1, vSouth]),
  };
}

/** A camera at `camLatDeg`, `altitudeKm` up, aimed at `target` (a point on
 *  the unit sphere) rather than straight down — needed to bring a
 *  horizon-straddling patch into frustum at all. */
function aimedAt(camLatDeg: number, altitudeKm: number, target: Vec3, maxLevel: number) {
  const d = 1 + altitudeKm / EARTH_RADIUS_KM;
  const camDirUnit = equirectUvToDirection([0.5, camLatDeg / 180 + 0.5]);
  const camPosLocalM: Vec3 = [camDirUnit[0] * d, camDirUnit[1] * d, camDirUnit[2] * d];
  const view = mat4.lookAt(camPosLocalM, target, camDirUnit);
  const proj = mat4.perspective(FOV_Y_RAD, VIEWPORT[0] / VIEWPORT[1], 0.001, 100);
  const viewProjLocal = new Float64Array(mat4.multiply(proj, view));
  return {
    kind: 'surface' as const,
    camPosLocalM,
    viewProjLocal,
    radiusM: 1,
    viewportPx: VIEWPORT,
    baseLevel: BASE_LEVEL,
    bands: [
      { uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: MIN_TILE_LEVEL, max: maxLevel },
    ],
    tilePx: EARTH_TILE_PX,
    lodBias: 0,
    residentSlot: NEVER_RESIDENT,
  };
}

describe('cutSurfaceTiles', () => {
  describe('horizon cull measures the patch radius from all four corners', () => {
    // Meridians converge toward the poles, so a plate-carrée patch is NOT
    // angularly symmetric about its own centre: a northern patch's north
    // corners sit closer to centre than its south corners (mirrored south
    // of the equator). z6/x32/y7 spans lat 45-50.625N; camLat 55N sees its
    // NW corner (nearer the pole, nearer camera's own latitude) as the
    // closest of the four, understating the patch's true angular radius,
    // which is set by the farther SW/SE corners instead. `capAngle` is
    // picked (and `altitudeKm` derived from it) to sit strictly between the
    // one-corner and four-corner cull thresholds, so the two measurements
    // disagree on whether this exact patch is inside the horizon cap.
    const CAM_LAT_DEG = 55;
    const Z = 6;
    const X = 32;
    const Y = 7;

    function horizonFixture() {
      const geo = tileGeometry(Z, X, Y);
      const camDir = equirectUvToDirection([0.5, CAM_LAT_DEG / 180 + 0.5]);
      const centreAngle = angleBetween(geo.centre, camDir);
      const patchAngleOneCorner = angleBetween(geo.cornerNW, geo.centre);
      const patchAngleFourCorner = Math.max(
        angleBetween(geo.cornerNW, geo.centre),
        angleBetween(geo.cornerNE, geo.centre),
        angleBetween(geo.cornerSW, geo.centre),
        angleBetween(geo.cornerSE, geo.centre),
      );
      // The asymmetry the bug relies on: the far-from-pole (south) corners
      // are farther from the patch centre than the near-pole (NW) one.
      expect(patchAngleFourCorner).toBeGreaterThan(patchAngleOneCorner);

      const capAngle =
        (centreAngle - patchAngleFourCorner + (centreAngle - patchAngleOneCorner)) / 2;
      expect(capAngle, 'capAngle keeps the patch under the four-corner radius').toBeGreaterThan(
        centreAngle - patchAngleFourCorner,
      );
      expect(capAngle, 'capAngle culls the patch under the one-corner radius').toBeLessThan(
        centreAngle - patchAngleOneCorner,
      );
      const altitudeKm = EARTH_RADIUS_KM * (1 / Math.cos(capAngle) - 1);

      // The patch's own centre sits past the horizon at this altitude —
      // aim the camera at its near (south) edge instead, or nothing of the
      // patch would land in frustum at all.
      const target: Vec3 = [
        (geo.cornerSW[0] + geo.cornerSE[0]) / 2,
        (geo.cornerSW[1] + geo.cornerSE[1]) / 2,
        (geo.cornerSW[2] + geo.cornerSE[2]) / 2,
      ];
      return { altitudeKm, target };
    }

    it('requests a patch whose four-corner radius keeps it in the horizon cap, dropped by the one-corner radius', () => {
      const { altitudeKm, target } = horizonFixture();
      const result = cutSurfaceTiles(aimedAt(CAM_LAT_DEG, altitudeKm, target, Z));
      expect(
        result.requests.requests.some((r) => r.tile.z === Z && r.tile.x === X && r.tile.y === Y),
        `z${Z}/${X}/${Y} must be requested once the patch radius accounts for all four corners`,
      ).toBe(true);
    });

    it('still culls a tile well beyond the horizon at the same pose (no regression to the cull itself)', () => {
      const { altitudeKm, target } = horizonFixture();
      const [antiX, antiY] = earthTileXyForUv([175 / 360 + 0.5, -55 / 180 + 0.5], Z, EARTH_TILE_PX);
      const result = cutSurfaceTiles(aimedAt(CAM_LAT_DEG, altitudeKm, target, Z));
      expect(
        result.requests.requests.some(
          (r) => r.tile.z === Z && r.tile.x === antiX && r.tile.y === antiY,
        ),
        `z${Z}/${antiX}/${antiY} (antipodal-ish) must not be requested`,
      ).toBe(false);
    });
  });

  describe('cut / requests divergence (ancestor-fallback residency)', () => {
    it('drops a leaf whose whole ancestor chain is non-resident', () => {
      const result = cutSurfaceTiles(nadirAt(1000));
      expect(result.cut).toEqual([]);
      // The two products genuinely diverge here: the walk still reaches
      // leaves and requests them, it just finds nothing to draw.
      expect(result.requests.requests.length).toBeGreaterThan(0);
    });

    it('resolves an exactly resident leaf to the ancestor rect unchanged (levelDelta 0)', () => {
      const z = expectedLevel(1000);
      const [x, y] = earthTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, EARTH_TILE_PX);
      const residentSlot = (tile: EarthTileId) =>
        tile.z === z && tile.x === x && tile.y === y
          ? {
              slot: 7,
              atlasUvOrigin: [0.25, 0.5] as const,
              atlasUvScale: [0.125, 0.125] as const,
              readyAtMs: 42_000,
            }
          : null;

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      expect(entry!.resident.slot).toBe(7);
      expect(entry!.resident.atlasUvOrigin[0]).toBeCloseTo(0.25, 12);
      expect(entry!.resident.atlasUvOrigin[1]).toBeCloseTo(0.5, 12);
      expect(entry!.resident.atlasUvScale[0]).toBeCloseTo(0.125, 12);
      expect(entry!.resident.atlasUvScale[1]).toBeCloseTo(0.125, 12);
      // No other resident ancestor anywhere in the chain: nothing to fade from.
      expect(entry!.resident.readyAtMs).toBe(42_000);
      expect(entry!.resident.fallback).toBeNull();
    });

    it("carries the z-1 ancestor's flattened rect as fallback, and the leaf's own readyAt, when both are resident", () => {
      const z = expectedLevel(1000);
      const [x, y] = earthTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, EARTH_TILE_PX);
      const parentZ = z - 1;
      const parentX = x >> 1;
      const parentY = y >> 1;
      const leafRect = {
        atlasUvOrigin: [0.25, 0.5] as const,
        atlasUvScale: [0.125, 0.125] as const,
      };
      const parentRect = {
        atlasUvOrigin: [0.0, 0.25] as const,
        atlasUvScale: [0.25, 0.25] as const,
      };
      const residentSlot = (tile: EarthTileId) => {
        if (tile.z === z && tile.x === x && tile.y === y)
          return { slot: 7, ...leafRect, readyAtMs: 5_000 };
        if (tile.z === parentZ && tile.x === parentX && tile.y === parentY)
          return { slot: 3, ...parentRect, readyAtMs: 1_000 };
        return null;
      };

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      // readyAtMs is the RESOLVED (primary) tile's own timestamp, not the fallback's.
      expect(entry!.resident.readyAtMs).toBe(5_000);
      expect(entry!.resident.fallback).not.toBeNull();

      const span = 2;
      const offsetU = (x - parentX * span) / span;
      const offsetV = (y - parentY * span) / span;
      expect(entry!.resident.fallback!.atlasUvOrigin[0]).toBeCloseTo(
        parentRect.atlasUvOrigin[0] + offsetU * parentRect.atlasUvScale[0],
        12,
      );
      expect(entry!.resident.fallback!.atlasUvOrigin[1]).toBeCloseTo(
        parentRect.atlasUvOrigin[1] + offsetV * parentRect.atlasUvScale[1],
        12,
      );
      expect(entry!.resident.fallback!.atlasUvScale[0]).toBeCloseTo(
        parentRect.atlasUvScale[0] / span,
        12,
      );
      expect(entry!.resident.fallback!.atlasUvScale[1]).toBeCloseTo(
        parentRect.atlasUvScale[1] / span,
        12,
      );
    });

    // The seam test C1 exists to pin: a levelDelta-2 leaf's FINAL resolved
    // rect must be the correct north-anchored 1/16 sub-rect of the
    // ancestor's own (non-trivial, non-identity) slot rect — catching both
    // a forgotten flatten (rect left as the ancestor's raw 1x1) and a
    // south-anchored quadrant math (wrapping to 0 for the southernmost
    // child, M10). `ancestorRect` is deliberately NOT [0,0]-[1,1]: an
    // identity rect can't distinguish "flattened correctly" from "origin/
    // scale passed through untouched".
    it('flattens a levelDelta-2 fallback to the correct north-anchored 1/16 sub-rect', () => {
      const z = expectedLevel(1000);
      const levelDelta = 2;
      const ancestorZ = z - levelDelta;
      const [x, y] = earthTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, EARTH_TILE_PX);
      const ancX = x >> levelDelta;
      const ancY = y >> levelDelta;
      const ancestorRect = {
        atlasUvOrigin: [0.25, 0.5] as const,
        atlasUvScale: [0.5, 0.5] as const,
      };
      const residentSlot = (tile: EarthTileId) =>
        tile.z === ancestorZ && tile.x === ancX && tile.y === ancY
          ? { slot: 3, ...ancestorRect, readyAtMs: 9_000 }
          : null;

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      // Only one resident ancestor anywhere in the chain: nothing shallower to fade from.
      expect(entry!.resident.fallback).toBeNull();

      // Hand-computed via integer tile-block arithmetic, independent of the
      // source's own formula: `[x, y]`'s low 2 bits give the leaf's position
      // inside the ancestor's 4x4 block of leaf-level tiles. Both `x` (tile
      // columns) and `y` (tile rows, counting south from the north pole)
      // increase in the SAME direction as atlas-uv `u`/`v` (the atlas's
      // origin is a slot's north row) — no north/south flip on either axis,
      // unlike mesh-v.
      const span = 1 << levelDelta;
      const offsetU = (x % span) / span;
      const offsetV = (y % span) / span;
      const expectedOrigin: [number, number] = [
        ancestorRect.atlasUvOrigin[0] + offsetU * ancestorRect.atlasUvScale[0],
        ancestorRect.atlasUvOrigin[1] + offsetV * ancestorRect.atlasUvScale[1],
      ];
      const expectedScale: [number, number] = [
        ancestorRect.atlasUvScale[0] / span,
        ancestorRect.atlasUvScale[1] / span,
      ];
      expect(entry!.resident.atlasUvOrigin[0]).toBeCloseTo(expectedOrigin[0], 12);
      expect(entry!.resident.atlasUvOrigin[1]).toBeCloseTo(expectedOrigin[1], 12);
      expect(entry!.resident.atlasUvScale[0]).toBeCloseTo(expectedScale[0], 12);
      expect(entry!.resident.atlasUvScale[1]).toBeCloseTo(expectedScale[1], 12);
    });

    it('never resolves an ancestor at or shallower than baseLevel', () => {
      // Resident everywhere AT baseLevel — if the walk ever queried down that
      // far, every leaf would resolve. None should: nothing else is resident,
      // so `cut` must still come back empty.
      const residentSlot = (tile: EarthTileId) =>
        tile.z === BASE_LEVEL
          ? {
              slot: 0,
              atlasUvOrigin: [0, 0] as const,
              atlasUvScale: [1, 1] as const,
              readyAtMs: 0,
            }
          : null;
      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      expect(result.cut).toEqual([]);
      expect(result.requests.requests.length).toBeGreaterThan(0);
    });

    it("draws a band-edge leaf outside every band's request range from a resident ancestor rect", () => {
      // Reproduces the "hole ring" bug: a global band caps at z7, a deep band
      // only bakes z8-13 over a small bbox, and the z7 parent straddles that
      // bbox's edge — `earthTileBandRefineAllowed` lets it refine (the deep
      // band overlaps SOME of it), but three of its four z8 children land
      // OUTSIDE the deep band's bbox with no band requestable at z8 there.
      const z7 = 7;
      const z8 = 8;
      const subUv: [number, number] = [20 / 360 + 0.5, 15 / 180 + 0.5];
      const [z7x, z7y] = earthTileXyForUv(subUv, z7, EARTH_TILE_PX);
      const [z8x, z8y] = earthTileXyForUv(subUv, z8, EARTH_TILE_PX);

      const tileBounds = (z: number, x: number, y: number) => {
        const cols = earthTileColumns(z, EARTH_TILE_PX);
        const rows = cols / 2;
        return {
          uBounds: [x / cols, (x + 1) / cols] as const,
          vBounds: [1 - (y + 1) / rows, 1 - y / rows] as const,
        };
      };

      const bands = [
        { uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: MIN_TILE_LEVEL, max: z7 },
        { ...tileBounds(z8, z8x, z8y), min: z8, max: 13 },
      ];

      const ancestorRect = {
        atlasUvOrigin: [0.25, 0.5] as const,
        atlasUvScale: [0.5, 0.5] as const,
      };
      const residentSlot = (tile: EarthTileId) =>
        tile.z === z7 && tile.x === z7x && tile.y === z7y
          ? { slot: 3, ...ancestorRect, readyAtMs: 3_000 }
          : null;

      const result = cutSurfaceTiles({ ...nadirAt(1000), bands, residentSlot });

      // A sibling of the in-band child: same z7 parent, a different quadrant —
      // outside the deep band's bbox, and the global band tops out at z7.
      const otherX = z8x === z7x * 2 ? z7x * 2 + 1 : z7x * 2;
      const otherY = z8y;

      expect(
        result.requests.requests.some(
          (r) => r.tile.z === z8 && r.tile.x === otherX && r.tile.y === otherY,
        ),
        'skipped leaf must not be requested — no band bakes a file for it',
      ).toBe(false);

      const entry = result.cut.find((c) => c.id.z === z8 && c.id.x === otherX && c.id.y === otherY);
      expect(entry, `cut entry for ${z8}/${otherX}/${otherY}`).toBeDefined();

      const span = 2;
      const offsetU = (otherX - z7x * span) / span;
      const offsetV = (otherY - z7y * span) / span;
      expect(entry!.resident.atlasUvOrigin[0]).toBeCloseTo(
        ancestorRect.atlasUvOrigin[0] + offsetU * ancestorRect.atlasUvScale[0],
        12,
      );
      expect(entry!.resident.atlasUvOrigin[1]).toBeCloseTo(
        ancestorRect.atlasUvOrigin[1] + offsetV * ancestorRect.atlasUvScale[1],
        12,
      );
      expect(entry!.resident.atlasUvScale[0]).toBeCloseTo(ancestorRect.atlasUvScale[0] / span, 12);
      expect(entry!.resident.atlasUvScale[1]).toBeCloseTo(ancestorRect.atlasUvScale[1] / span, 12);
    });

    it('the near-plane-straddler fallback carries over, in both products', () => {
      // 500 m up, tilted 2 degrees off nadir: see `planEarthTiles.test.ts`'s
      // `tiltedAt` doc for why this pins the false-negative near-plane cull
      // closed. First locate the deep tile with nothing resident (mirrors
      // the original assertion), then re-run with exactly that tile resident
      // to prove `cut` reaches it too.
      const { maxLevel, ...input } = tiltedAt(500, 2);
      const bare = cutSurfaceTiles(input);
      expect(bare.requests.requests.length).toBeGreaterThan(0);
      const deep = bare.requests.requests.find((r) => r.tile.z === maxLevel);
      expect(deep, `a z${maxLevel} request`).toBeDefined();

      const residentSlot = (tile: EarthTileId) =>
        tile.z === deep!.tile.z && tile.x === deep!.tile.x && tile.y === deep!.tile.y
          ? {
              slot: 1,
              atlasUvOrigin: [0, 0] as const,
              atlasUvScale: [1, 1] as const,
              readyAtMs: 0,
            }
          : null;
      const result = cutSurfaceTiles({ ...input, residentSlot });
      expect(result.requests.requests.some((r) => r.tile.z === maxLevel)).toBe(true);
      expect(result.cut.length).toBeGreaterThan(0);
    });
  });

  describe('requests (fetch-demand product, no window clip)', () => {
    it('drops the far hemisphere', () => {
      const z = BASE_LEVEL;
      const result = cutSurfaceTiles({
        ...nadirAt(20_000),
        bands: [{ uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: z, max: 13 }],
      });
      expect(result.requests.zWin).toBe(z);

      const keys = new Set(
        result.requests.requests.map((r) => `${r.tile.z}/${r.tile.x}/${r.tile.y}`),
      );
      const subCamera = earthTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, EARTH_TILE_PX);
      const antipode = earthTileXyForUv([-160 / 360 + 0.5, -15 / 180 + 0.5], z, EARTH_TILE_PX);

      expect(keys.has(`${z}/${subCamera[0]}/${subCamera[1]}`), 'sub-camera tile').toBe(true);
      expect(keys.has(`${z}/${antipode[0]}/${antipode[1]}`), 'antipodal tile').toBe(false);
      expect(result.requests.requests.length).toBeLessThan(128 * 0.6);
    });

    it('reaches the level a hand-computed texel density calls for', () => {
      expect(expectedLevel(1000)).toBe(8); // guards the arithmetic in the comment above
      expect(cutSurfaceTiles(nadirAt(1000)).requests.zWin).toBe(8);
    });

    it('gains exactly one level per halving of altitude', () => {
      let previous = cutSurfaceTiles(nadirAt(1000)).requests.zWin;
      for (const altitudeKm of [500, 250, 125]) {
        const zWin = cutSurfaceTiles(nadirAt(altitudeKm)).requests.zWin;
        expect(zWin, `${altitudeKm} km`).toBe(previous + 1);
        expect(zWin, `${altitudeKm} km vs hand-computed`).toBe(expectedLevel(altitudeKm));
        previous = zWin;
      }
    });

    it('a lodBias of 1 settles exactly one level shallower, with fewer requests', () => {
      const unbiased = cutSurfaceTiles(nadirAt(1000));
      const biased = cutSurfaceTiles({ ...nadirAt(1000), lodBias: 1 });
      expect(biased.requests.zWin).toBe(unbiased.requests.zWin - 1);
      expect(biased.requests.requests.length).toBeLessThan(unbiased.requests.requests.length);
    });

    it('a lodBias large enough to push the settled level below baseLevel still floors there', () => {
      const result = cutSurfaceTiles({ ...nadirAt(1000), lodBias: 1000 });
      expect(result.requests.zWin).toBe(BASE_LEVEL);
      expect(result.requests.requests).toEqual([]);
    });

    it('engages against the shipped z5-only pyramid, and stands down above it', () => {
      const shipped = {
        baseLevel: BASE_LEVEL,
        bands: [
          {
            uBounds: [0, 1] as const,
            vBounds: [0, 1] as const,
            min: MIN_TILE_LEVEL,
            max: MIN_TILE_LEVEL,
          },
        ],
      };

      const close = cutSurfaceTiles({ ...nadirAt(1000), ...shipped });
      expect(close.requests.zWin, 'engages at 1000 km').toBeGreaterThan(BASE_LEVEL);
      expect(close.requests.requests.length).toBeGreaterThan(0);
      expect(close.requests.requests.every((r) => r.tile.z >= MIN_TILE_LEVEL)).toBe(true);

      const far = cutSurfaceTiles({ ...nadirAt(20_000), ...shipped });
      expect(far.requests.zWin, 'stands down at 20 000 km').toBe(BASE_LEVEL);
      expect(far.requests.requests).toEqual([]);
    });

    it('never exceeds maxTileLevel, however close the camera gets', () => {
      const result = cutSurfaceTiles({
        ...nadirAt(125),
        bands: [
          { uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: MIN_TILE_LEVEL, max: 5 },
        ],
      });
      expect(result.requests.zWin).toBe(5);
      expect(result.requests.requests.every((r) => r.tile.z <= 5)).toBe(true);
      expect(result.requests.requests.length).toBeGreaterThan(0);
    });

    it('requests every ancestor down to the floor alongside each leaf', () => {
      const result = cutSurfaceTiles(nadirAt(1000));
      expect(result.requests.requests.length).toBeGreaterThan(0);
      const keys = new Set(
        result.requests.requests.map((r) => `${r.tile.z}/${r.tile.x}/${r.tile.y}`),
      );
      for (const { tile } of result.requests.requests) {
        let { z, x, y } = tile;
        while (z > MIN_TILE_LEVEL) {
          z -= 1;
          x = Math.floor(x / 2);
          y = Math.floor(y / 2);
          expect(
            keys.has(`${z}/${x}/${y}`),
            `parent of ${tile.z}/${tile.x}/${tile.y} at z${z}`,
          ).toBe(true);
        }
      }
    });

    it('returns nothing, not nonsense, from both products when the camera is on the surface', () => {
      const result = cutSurfaceTiles({ ...nadirAt(1000), camPosLocalM: [1, 0, 0] });
      expect(result.requests.requests).toEqual([]);
      expect(result.cut).toEqual([]);
      // Still a meaningful sub-camera direction, not a zero vector NaN trap —
      // the debug readout needs this even on the degenerate "no horizon" path.
      expect(result.requests.subCameraDirLocal).toEqual([1, 0, 0]);
    });

    it('reports subCameraDirLocal as the normalised camPosLocalM, not a recomputed one', () => {
      const { camPosLocalM } = nadirAt(1000);
      const len = Math.hypot(camPosLocalM[0], camPosLocalM[1], camPosLocalM[2]);
      const result = cutSurfaceTiles(nadirAt(1000));
      expect(result.requests.subCameraDirLocal[0]).toBeCloseTo(camPosLocalM[0] / len, 12);
      expect(result.requests.subCameraDirLocal[1]).toBeCloseTo(camPosLocalM[1] / len, 12);
      expect(result.requests.subCameraDirLocal[2]).toBeCloseTo(camPosLocalM[2] / len, 12);
    });

    it('emits leaves on both sides of the antimeridian', () => {
      // See `planEarthTiles.test.ts`'s identical fixture comment for why
      // 180.5°/5° rather than the seam or equator exactly. Window-membership
      // assertions (`winX0`/`winY0`/`EARTH_TILE_WINDOW_SIDE` wrap) are
      // dropped: `cutSurfaceTiles` has no window to be inside of.
      const result = cutSurfaceTiles(nadirAt(1000, 180.5, 5));
      const xFrac = ({ z, x }: { z: number; x: number }) => x / earthTileColumns(z, EARTH_TILE_PX);
      expect(
        result.requests.requests.some((r) => xFrac(r.tile) < 0.1),
        'tile east of the seam',
      ).toBe(true);
      expect(
        result.requests.requests.some((r) => xFrac(r.tile) > 0.9),
        'tile west of the seam',
      ).toBe(true);
    });
  });

  describe('metres vs radii (unit-agnosticism, spec §8)', () => {
    // Both tests scale ONE fixture's camPosLocalM/radiusM pair together to a
    // real Earth radius, leaving viewProjLocal untouched (it already maps
    // unit-sphere-local points — equirectUvToDirection's own output —
    // straight to clip space regardless of what camPosLocalM/radiusM are in;
    // that's the caller's model-scale choice, not this walk's). If the walk
    // silently assumed radius 1 anywhere in the horizon test instead of
    // reading `radiusM`, only the metres form would disagree with the radii
    // form below.
    const RADIUS_M = EARTH_RADIUS_KM * 1000;

    function toMetres(radiiInput: ReturnType<typeof nadirAt>) {
      return {
        ...radiiInput,
        camPosLocalM: radiiInput.camPosLocalM.map((c) => c * RADIUS_M) as Vec3,
        radiusM: RADIUS_M,
      };
    }

    it('refines to the same level in metres as in radii', () => {
      const radiiResult = cutSurfaceTiles(nadirAt(1000));
      const metresResult = cutSurfaceTiles(toMetres(nadirAt(1000)));
      expect(metresResult.requests.zWin).toBe(radiiResult.requests.zWin);
    });

    it('culls beyond the horizon in metres, with an explicit radiusM', () => {
      // A camera altitude hand-picked so a KNOWN coarse tile's centre sits
      // just past the horizon cap (`capAngle = acos(radiusM / camLen)`):
      // solve for the altitude at which the cap lands EXACTLY on the tile's
      // centre angle, then back off 1 km so the tile falls just outside it.
      const z = BASE_LEVEL;
      const [tx, ty] = earthTileXyForUv([70 / 360 + 0.5, 15 / 180 + 0.5], z, EARTH_TILE_PX);
      const geo = tileGeometry(z, tx, ty);
      const camDir = equirectUvToDirection([20 / 360 + 0.5, 15 / 180 + 0.5]); // nadirAt's own sub-camera point
      const centreAngle = angleBetween(geo.centre, camDir);
      const dAtCap = 1 / Math.cos(centreAngle); // body-radii units (radius 1)
      const altitudeKm = (dAtCap - 1) * EARTH_RADIUS_KM - 1; // 1 km inside the cap boundary

      const residentSlot = (tile: EarthTileId) =>
        tile.z === z && tile.x === tx && tile.y === ty
          ? { slot: 0, atlasUvOrigin: [0, 0] as const, atlasUvScale: [1, 1] as const, readyAtMs: 0 }
          : null;
      const result = cutSurfaceTiles({ ...toMetres(nadirAt(altitudeKm)), residentSlot });

      expect(
        result.cut.some((c) => c.id.z === z && c.id.x === tx && c.id.y === ty),
        `z${z}/${tx}/${ty} sits just past the horizon and must be absent from cut`,
      ).toBe(false);
    });
  });

  describe('low-altitude planner input precision (the f64 belt-and-braces contract)', () => {
    // Reproduces the diagnosed bug: composeBodyMvp used to narrow its result to
    // f32 before this walk ever saw it. At low altitude the matrix's own
    // `w`-row cancels its radiusMpc-scale terms down to a tiny true value, so
    // f32-rounding each element beforehand corrupts the per-node bbox-cull
    // test — an ancestor that truly straddles the frustum edge gets WRONGLY
    // rejected, dropping its whole (correctly-visible) subtree. See
    // cut-replay-exact-report.md (2026-08-20-earth-rtc-surface-foundation) for
    // the full diagnosis. Earth's OWN production path no longer manufactures
    // this cancellation (`composeBodySlabMvp` is metres-native, so the
    // w-row never gets Mpc-scale large to begin with) — `viewProjLocal` stays
    // `Float64Array` regardless, as a belt-and-braces contract, and this test
    // keeps `cutSurfaceTiles`'s OWN bbox-cull honest against an adversarial
    // w-row via the still-live `composeBodyMvp` (used by non-Earth bodies),
    // at Earth-orbit (1 AU) scale, with a deliberately GENERIC (non-axis-
    // aligned) body position, sub-camera direction and camera-up — an
    // axis-aligned nadir pose (tried first) has enough incidental symmetry
    // that no bbox ever straddles the frustum edge, so the bug never flips a
    // decision there; production poses are never that symmetric.
    const RADIUS_KM = 6371;
    const radiusMpc = RADIUS_KM * SCALE_UNITS.KM_TO_MPC;
    const bodyPosMpc: Vec3 = [
      0.62 * SCALE_UNITS.AU_TO_MPC,
      0.41 * SCALE_UNITS.AU_TO_MPC,
      -0.73 * SCALE_UNITS.AU_TO_MPC,
    ];
    const renderOrigin: Vec3 = [0, 0, 0];

    function cross3(a: Vec3, b: Vec3): Vec3 {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    function normalize3(a: Vec3): Vec3 {
      const n = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / n, a[1] / n, a[2] / n];
    }
    function add3(a: Vec3, b: Vec3): Vec3 {
      return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    }
    function sub3(a: Vec3, b: Vec3): Vec3 {
      return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    function scale3(a: Vec3, s: number): Vec3 {
      return [a[0] * s, a[1] * s, a[2] * s];
    }

    const dirLocal0 = normalize3([0.31, 0.58, 0.75]);
    const genericUp = normalize3([0.13, 0.92, 0.27]);
    const subCamUv: [number, number] = [
      Math.atan2(dirLocal0[1], dirLocal0[0]) / (2 * Math.PI) + 0.5,
      Math.asin(Math.max(-1, Math.min(1, dirLocal0[2]))) / Math.PI + 0.5,
    ];

    // A deep band straddling the sub-camera point (like GeoDanmark's z14-19
    // Søndermarken box) plus a shallow global band underneath it (like BMNG).
    const bands = [
      { uBounds: [0, 1] as const, vBounds: [0, 1] as const, min: MIN_TILE_LEVEL, max: 7 },
      {
        uBounds: [subCamUv[0] - 0.01, subCamUv[0] + 0.01] as const,
        vBounds: [subCamUv[1] - 0.01, subCamUv[1] + 0.01] as const,
        min: 14,
        max: 19,
      },
    ];

    function tileUvBounds(z: number, x: number, y: number) {
      const cols = earthTileColumns(z, EARTH_TILE_PX);
      const rows = cols / 2;
      const vNorth = 1 - y / rows;
      const vSouth = 1 - (y + 1) / rows;
      return { u0: x / cols, u1: (x + 1) / cols, v0: vSouth, v1: vNorth };
    }

    // Full-residency mock: anything the walk is allowed to request resolves —
    // isolates the walk's cull/refine logic (under test) from any residency-
    // race concern (the exact-repro report's §1 already ruled that out).
    function mockResidentSlot(tile: EarthTileId) {
      const { u0, u1, v0, v1 } = tileUvBounds(tile.z, tile.x, tile.y);
      if (earthTileBandRequestAllowed(bands, tile.z, u0, u1, v0, v1)) {
        return {
          slot: 0,
          atlasUvOrigin: [0, 0] as const,
          atlasUvScale: [1, 1] as const,
          readyAtMs: 0,
        };
      }
      return null;
    }

    /** An adversarial-w-row `mvpLocal`, fed straight into `cutSurfaceTiles`
     *  with no intermediate narrow — see the describe-block comment for why
     *  this is no longer Earth's own production path but still a real
     *  regression guard on the walk itself. Camera tilted off nadir (toward
     *  `genericUp`-derived axes) so the frustum footprint reaches tiles
     *  whose bbox genuinely straddles the edge — a pure nadir view's
     *  footprint is too well-conditioned to ever land a bbox near that
     *  boundary. `camPosLocalM` stays body-radii-scale (radiusM 1) here —
     *  this test is about the VP's w-row, not the horizon check. */
    function buildInputs(altitudeM: number, tiltDeg: number, azDeg: number) {
      const camLen = 1 + altitudeM / (RADIUS_KM * 1000);
      const camPosLocalM: Vec3 = scale3(dirLocal0, camLen);
      const eyeMpc = add3(bodyPosMpc, scale3(camPosLocalM, radiusMpc));
      const nadirDir = normalize3(sub3(bodyPosMpc, eyeMpc));
      const east = normalize3(cross3(nadirDir, genericUp));
      const north = normalize3(cross3(east, nadirDir));
      const tiltRad = (tiltDeg * Math.PI) / 180;
      const azRad = (azDeg * Math.PI) / 180;
      const tiltAxis = add3(scale3(east, Math.cos(azRad)), scale3(north, Math.sin(azRad)));
      const forward = normalize3(
        add3(scale3(nadirDir, Math.cos(tiltRad)), scale3(tiltAxis, Math.sin(tiltRad))),
      );
      const targetMpc = add3(eyeMpc, forward);

      const altitudeMpc = camLen * radiusMpc - radiusMpc;
      const { near, far } = foregroundFrustum(altitudeMpc);
      const fovYRad = (60 * Math.PI) / 180;
      const viewportPx: [number, number] = [3252, 2560]; // live dpr=2 viewport
      const aspect = viewportPx[0] / viewportPx[1];

      const foregroundVp = computeForegroundViewProj({
        eyeMpc,
        targetMpc,
        up: genericUp,
        renderOrigin,
        fovYRad,
        aspect,
        near,
        far,
        reversedZ: true,
      });
      const viewProjLocal = composeBodyMvp(
        foregroundVp,
        bodyPosMpc,
        renderOrigin,
        radiusMpc,
        IDENTITY_MAT3,
      );

      return { camPosLocalM, viewProjLocal, viewportPx };
    }

    it('does not collapse the cut at ~50 m altitude over a deep-band point', () => {
      const { camPosLocalM, viewProjLocal, viewportPx } = buildInputs(50, 10, 0);

      const result = cutSurfaceTiles({
        kind: 'surface',
        camPosLocalM,
        viewProjLocal,
        radiusM: 1,
        viewportPx,
        baseLevel: BASE_LEVEL,
        bands,
        tilePx: EARTH_TILE_PX,
        lodBias: 1,
        residentSlot: mockResidentSlot,
      });

      // A healthy walk resolves far more than a handful of tiles at this
      // altitude/footprint (empirically ~1100 under the fixed f64 path).
      expect(result.cut.length).toBeGreaterThan(200);

      // Coverage invariant, the real one under test: two ancestor tiles (found
      // by direct bbox comparison against the pre-fix f32-narrowed matrix —
      // see this task's investigation notes) sit exactly on the frustum's edge
      // at this pose. Under the precision bug their bbox is wrongly computed
      // as fully outside [-1,1], bbox-culling their ENTIRE subtree before any
      // z19 leaf under them is ever considered — so NONE of their descendants
      // can appear in `cut`. Under the fix, at least one must.
      const cutKeys = new Set(result.cut.map((t) => `${t.id.z}/${t.id.x}/${t.id.y}`));
      const knownEdgeAncestors: readonly {
        readonly z: number;
        readonly x: number;
        readonly y: number;
      }[] = [
        { z: 17, x: 88112, y: 15063 },
        { z: 18, x: 176154, y: 30057 },
      ];
      for (const anc of knownEdgeAncestors) {
        const span = 1 << (19 - anc.z);
        const x0 = anc.x * span;
        const y0 = anc.y * span;
        let coversAny = false;
        for (let dx = 0; dx < span && !coversAny; dx++) {
          for (let dy = 0; dy < span && !coversAny; dy++) {
            if (cutKeys.has(`19/${x0 + dx}/${y0 + dy}`)) coversAny = true;
          }
        }
        expect(coversAny, `some z19 descendant of ${anc.z}/${anc.x}/${anc.y} must be in cut`).toBe(
          true,
        );
      }
    });
  });
});
