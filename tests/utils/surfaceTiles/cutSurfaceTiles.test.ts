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
import { mat4, mat4d } from 'wgpu-matrix';

import { cutSurfaceTiles } from '../../../src/utils/surfaceTiles/cutSurfaceTiles';
import { baseLevelForTier } from '../../../src/utils/surfaceTiles/baseLevelForTier';
import { earthTexelMetres } from '../../../src/utils/surfaceTiles/earthTexelMetres';
import { surfaceTileXyForUv } from '../../../src/utils/surfaceTiles/surfaceTileXyForUv';
import { surfaceTileColumns } from '../../../src/utils/surfaceTiles/surfaceTileColumns';
import { surfaceTileInBand } from '../../../src/utils/surfaceTiles/surfaceTileInBand';
import { equirectUvToDirection } from '../../../src/utils/math/equirectUvToDirection';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import { SURFACE_TILE_LOD_BIAS, SURFACE_TILE_PX } from '../../../src/data/bodies/surfaceTileParams';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { composeBodyMvp } from '../../../src/utils/camera/composeBodyMvp';
import { composeBodySlabMvp } from '../../../src/utils/camera/composeBodySlabMvp';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../src/utils/camera/foregroundFrustum';
import { MARS_DATUM_RADIUS_M } from '../../../src/data/bodies/marsSurfaceParams';
import type { SurfaceTileId } from '../../../src/@types/data/SurfaceTileId';
import type { SurfaceTileBand } from '../../../src/@types/scene/SurfaceTileBand';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';

const BASE_LEVEL = baseLevelForTier('earth', 'large');
const MIN_TILE_LEVEL = BASE_LEVEL + 1;

const EARTH_RADIUS_KM = 6371;
const FOV_Y_RAD = (40 * Math.PI) / 180;
const VIEWPORT: [number, number] = [2560, 1440];

/** No body bound: the fixtures' ranges are what the culls see. */
const UNBOUNDED_RELIEF: readonly [number, number] = [-Infinity, Infinity];

/** The residency record most fixtures below hand back; its rect is the whole
 *  atlas, which no assertion here reads. */
const WHOLE_ATLAS = {
  slot: 0,
  atlasUvOrigin: [0, 0] as const,
  atlasUvScale: [1, 1] as const,
  readyAtMs: 0,
};

/** The default fixture band: one whole-globe pyramid from `MIN_TILE_LEVEL`. */
const GLOBAL_BANDS: readonly SurfaceTileBand[] = [
  { uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: 13 },
];

/** Height residency IS the bake's own tile set (`surfaceTileInBand` over the
 *  bands), never "everywhere": the complete pyramid the bake owes the walk.
 *  A leaf with no height ancestor is dropped, so a stub resolving nothing
 *  would empty every `cut` and say nothing about the rules these fixtures
 *  exist for. */
function heightFrom(bands: readonly SurfaceTileBand[]) {
  return (tile: SurfaceTileId) =>
    tile.product === 'height' && surfaceTileInBand(bands, SURFACE_TILE_PX, tile.z, tile.x, tile.y)
      ? WHOLE_ATLAS
      : null;
}

/** Baked height, albedo nowhere — the "nothing to draw, but refinement
 *  unblocked" stub. */
const HEIGHT_ONLY = heightFrom(GLOBAL_BANDS);

/** Wraps an albedo-only stub so height resolves around it, so these fixtures
 *  go on testing albedo resolution rather than height inheritance. */
function withHeight<T>(
  albedo: (tile: SurfaceTileId) => T,
  bands: readonly SurfaceTileBand[] = GLOBAL_BANDS,
) {
  const height = heightFrom(bands);
  return (tile: SurfaceTileId) => (tile.product === 'height' ? height(tile) : albedo(tile));
}

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
    camPosLocalM,
    viewProjsLocal: [viewProjLocal],
    radiusM: 1,
    reliefM: UNBOUNDED_RELIEF,
    viewportPx: VIEWPORT,
    baseLevel: BASE_LEVEL,
    bands: GLOBAL_BANDS,
    tilePx: SURFACE_TILE_PX,
    // Fixture default is the 1:1 point, not the shipped `SURFACE_TILE_LOD_BIAS`,
    // so every test above that predates the bias keeps asserting the rule it
    // was written against rather than a softened one.
    lodBias: 0,
    residentSlot: HEIGHT_ONLY,
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
  const bands: readonly SurfaceTileBand[] = [
    { uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: maxLevel },
  ];
  return {
    camPosLocalM,
    viewProjsLocal: [viewProjLocal],
    radiusM: 1,
    reliefM: UNBOUNDED_RELIEF,
    viewportPx: VIEWPORT,
    baseLevel: BASE_LEVEL,
    bands,
    tilePx: SURFACE_TILE_PX,
    lodBias: 0,
    residentSlot: heightFrom(bands),
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
  const cols = surfaceTileColumns(z, SURFACE_TILE_PX);
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
  const bands: readonly SurfaceTileBand[] = [
    { uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: maxLevel },
  ];
  return {
    camPosLocalM,
    viewProjsLocal: [viewProjLocal],
    radiusM: 1,
    reliefM: UNBOUNDED_RELIEF,
    viewportPx: VIEWPORT,
    baseLevel: BASE_LEVEL,
    bands,
    tilePx: SURFACE_TILE_PX,
    lodBias: 0,
    residentSlot: heightFrom(bands),
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
      const [antiX, antiY] = surfaceTileXyForUv(
        [175 / 360 + 0.5, -55 / 180 + 0.5],
        Z,
        SURFACE_TILE_PX,
      );
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
      const [x, y] = surfaceTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, SURFACE_TILE_PX);
      const residentSlot = withHeight((tile: SurfaceTileId) =>
        tile.z === z && tile.x === x && tile.y === y
          ? {
              slot: 7,
              atlasUvOrigin: [0.25, 0.5] as const,
              atlasUvScale: [0.125, 0.125] as const,
              readyAtMs: 42_000,
            }
          : null,
      );

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      expect(entry!.albedo.slot).toBe(7);
      expect(entry!.albedo.atlasUvOrigin[0]).toBeCloseTo(0.25, 12);
      expect(entry!.albedo.atlasUvOrigin[1]).toBeCloseTo(0.5, 12);
      expect(entry!.albedo.atlasUvScale[0]).toBeCloseTo(0.125, 12);
      expect(entry!.albedo.atlasUvScale[1]).toBeCloseTo(0.125, 12);
      // No other resident ancestor anywhere in the chain: nothing to fade from.
      expect(entry!.albedo.readyAtMs).toBe(42_000);
      expect(entry!.albedo.fallback).toBeNull();
    });

    it("carries the z-1 ancestor's flattened rect as fallback, and the leaf's own readyAt, when both are resident", () => {
      const z = expectedLevel(1000);
      const [x, y] = surfaceTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, SURFACE_TILE_PX);
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
      const residentSlot = withHeight((tile: SurfaceTileId) => {
        if (tile.z === z && tile.x === x && tile.y === y)
          return { slot: 7, ...leafRect, readyAtMs: 5_000 };
        if (tile.z === parentZ && tile.x === parentX && tile.y === parentY)
          return { slot: 3, ...parentRect, readyAtMs: 1_000 };
        return null;
      });

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      // readyAtMs is the RESOLVED (primary) tile's own timestamp, not the fallback's.
      expect(entry!.albedo.readyAtMs).toBe(5_000);
      expect(entry!.albedo.fallback).not.toBeNull();

      const span = 2;
      const offsetU = (x - parentX * span) / span;
      const offsetV = (y - parentY * span) / span;
      expect(entry!.albedo.fallback!.atlasUvOrigin[0]).toBeCloseTo(
        parentRect.atlasUvOrigin[0] + offsetU * parentRect.atlasUvScale[0],
        12,
      );
      expect(entry!.albedo.fallback!.atlasUvOrigin[1]).toBeCloseTo(
        parentRect.atlasUvOrigin[1] + offsetV * parentRect.atlasUvScale[1],
        12,
      );
      expect(entry!.albedo.fallback!.atlasUvScale[0]).toBeCloseTo(
        parentRect.atlasUvScale[0] / span,
        12,
      );
      expect(entry!.albedo.fallback!.atlasUvScale[1]).toBeCloseTo(
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
      const [x, y] = surfaceTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, SURFACE_TILE_PX);
      const ancX = x >> levelDelta;
      const ancY = y >> levelDelta;
      const ancestorRect = {
        atlasUvOrigin: [0.25, 0.5] as const,
        atlasUvScale: [0.5, 0.5] as const,
      };
      const residentSlot = withHeight((tile: SurfaceTileId) =>
        tile.z === ancestorZ && tile.x === ancX && tile.y === ancY
          ? { slot: 3, ...ancestorRect, readyAtMs: 9_000 }
          : null,
      );

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      // Only one resident ancestor anywhere in the chain: nothing shallower to fade from.
      expect(entry!.albedo.fallback).toBeNull();

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
      expect(entry!.albedo.atlasUvOrigin[0]).toBeCloseTo(expectedOrigin[0], 12);
      expect(entry!.albedo.atlasUvOrigin[1]).toBeCloseTo(expectedOrigin[1], 12);
      expect(entry!.albedo.atlasUvScale[0]).toBeCloseTo(expectedScale[0], 12);
      expect(entry!.albedo.atlasUvScale[1]).toBeCloseTo(expectedScale[1], 12);
    });

    it('never resolves an ancestor at or shallower than baseLevel', () => {
      // Resident everywhere AT baseLevel — if the walk ever queried down that
      // far, every leaf would resolve. None should: nothing else is resident,
      // so `cut` must still come back empty.
      const residentSlot = withHeight((tile: SurfaceTileId) =>
        tile.z === BASE_LEVEL
          ? {
              slot: 0,
              atlasUvOrigin: [0, 0] as const,
              atlasUvScale: [1, 1] as const,
              readyAtMs: 0,
            }
          : null,
      );
      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      expect(result.cut).toEqual([]);
      expect(result.requests.requests.length).toBeGreaterThan(0);
    });

    it('draws the band-edge halo ring from a resident ancestor rect, and never refines it', () => {
      // The "hole ring" shape: a global band caps at z7, a deep band bakes
      // z8-13 over one z8 box, and the z7 parent straddles that box's edge.
      // R11's sibling closure gives the three halo children files of their
      // own (baked from the band's underfill), so they are fetched and drawn
      // — but nothing exists BELOW them, so they stay leaves.
      const z7 = 7;
      const z8 = 8;
      const subUv: [number, number] = [20 / 360 + 0.5, 15 / 180 + 0.5];
      const [z7x, z7y] = surfaceTileXyForUv(subUv, z7, SURFACE_TILE_PX);
      const [z8x, z8y] = surfaceTileXyForUv(subUv, z8, SURFACE_TILE_PX);

      const tileBounds = (z: number, x: number, y: number) => {
        const cols = surfaceTileColumns(z, SURFACE_TILE_PX);
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
      // Height residency is this fixture's OWN band closure, not a blanket
      // "everywhere": the halo's file is exactly what R11 promises.
      const heights = heightFrom(bands);
      const residentSlot = (tile: SurfaceTileId) =>
        tile.product === 'height'
          ? heights(tile)
          : tile.z === z7 && tile.x === z7x && tile.y === z7y
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
        'the halo sibling IS fetched — the closure bakes it from the underfill',
      ).toBe(true);
      expect(
        result.cut.some((c) => c.id.z > z8 && c.id.x >> (c.id.z - z8) === otherX),
        'and nothing under it: no band bakes deeper there',
      ).toBe(false);

      const entry = result.cut.find((c) => c.id.z === z8 && c.id.x === otherX && c.id.y === otherY);
      expect(entry, `cut entry for ${z8}/${otherX}/${otherY}`).toBeDefined();

      const span = 2;
      const offsetU = (otherX - z7x * span) / span;
      const offsetV = (otherY - z7y * span) / span;
      expect(entry!.albedo.atlasUvOrigin[0]).toBeCloseTo(
        ancestorRect.atlasUvOrigin[0] + offsetU * ancestorRect.atlasUvScale[0],
        12,
      );
      expect(entry!.albedo.atlasUvOrigin[1]).toBeCloseTo(
        ancestorRect.atlasUvOrigin[1] + offsetV * ancestorRect.atlasUvScale[1],
        12,
      );
      expect(entry!.albedo.atlasUvScale[0]).toBeCloseTo(ancestorRect.atlasUvScale[0] / span, 12);
      expect(entry!.albedo.atlasUvScale[1]).toBeCloseTo(ancestorRect.atlasUvScale[1] / span, 12);
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

      const residentSlot = withHeight(
        (tile: SurfaceTileId) =>
          tile.z === deep!.tile.z && tile.x === deep!.tile.x && tile.y === deep!.tile.y
            ? {
                slot: 1,
                atlasUvOrigin: [0, 0] as const,
                atlasUvScale: [1, 1] as const,
                readyAtMs: 0,
              }
            : null,
        input.bands,
      );
      const result = cutSurfaceTiles({ ...input, residentSlot });
      expect(result.requests.requests.some((r) => r.tile.z === maxLevel)).toBe(true);
      expect(result.cut.length).toBeGreaterThan(0);
    });
  });

  /**
   * R14: refinement is residency-blind and a leaf inherits the deepest
   * resident height ancestor, so a tile still in flight is a coarser lattice
   * rather than a hole. The old rule (own tile or nothing) put holes through
   * to the stars below 150 km, where the base globe is already faded out.
   */
  describe('inherited height lattice', () => {
    const SUB_CAMERA_UV: [number, number] = [20 / 360 + 0.5, 15 / 180 + 0.5];

    it('refines to the screen-error level on an ancestor height tile', () => {
      // Height resident only at MIN_TILE_LEVEL; albedo everywhere.
      const HEIGHT_LEVEL = MIN_TILE_LEVEL;
      const residentSlot = (tile: SurfaceTileId) =>
        tile.product !== 'height'
          ? WHOLE_ATLAS
          : tile.z === HEIGHT_LEVEL
            ? { ...WHOLE_ATLAS, slot: 9 }
            : null;

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });

      const z = expectedLevel(1000);
      expect(z).toBeGreaterThan(HEIGHT_LEVEL);
      expect(
        result.cut.some((t) => t.id.z === z),
        'the cut reaches the screen-error level',
      ).toBe(true);
      expect(result.cut.every((t) => t.id.z - t.height.levelDelta === HEIGHT_LEVEL)).toBe(true);

      // Hand-derived sub-rect: the leaf's low `z - HEIGHT_LEVEL` bits index its
      // block of the ancestor's 128 cells, rows north-first on both sides.
      const [x, y] = surfaceTileXyForUv(SUB_CAMERA_UV, z, SURFACE_TILE_PX);
      const leaf = result.cut.find((t) => t.id.z === z && t.id.x === x && t.id.y === y);
      expect(leaf, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      const span = 1 << (z - HEIGHT_LEVEL);
      const cells = 128 >> (z - HEIGHT_LEVEL);
      expect(leaf!.height.slot).toBe(9);
      expect(leaf!.height.levelDelta).toBe(z - HEIGHT_LEVEL);
      expect(leaf!.height.originPosts).toEqual([(x % span) * cells, (y % span) * cells]);
    });

    it('drops a leaf with no height ancestor at all, and still requests both products', () => {
      const residentSlot = (tile: SurfaceTileId) =>
        tile.product === 'height' ? null : WHOLE_ATLAS;

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });

      expect(result.cut).toEqual([]);
      const keys = new Set(
        result.requests.requests.map(
          (r) => `${r.tile.product}/${r.tile.z}/${r.tile.x}/${r.tile.y}`,
        ),
      );
      const z = expectedLevel(1000);
      const [x, y] = surfaceTileXyForUv(SUB_CAMERA_UV, z, SURFACE_TILE_PX);
      for (const product of ['albedo', 'height'])
        expect(keys.has(`${product}/${z}/${x}/${y}`), `${product} at the required level`).toBe(
          true,
        );
    });

    it('keeps the strip of ground behind a tilted camera out of the working set', () => {
      // 300 km / 60 deg, the shipped lod bias, one whole-globe band to z13
      // (the deepest shape any pose can meet). Without the sphere-vs-frustum
      // cull in `probe`, the strip behind the camera straddles the eye plane,
      // skips the frustum cull, and refines to z13 with nothing on screen —
      // measured 39 height tiles with the cull, so the ceiling here is loose,
      // just far enough below the pre-cull blowup (~1800) to catch a regression.
      const result = cutSurfaceTiles({
        ...tiltedAt(300_000, 60),
        bands: GLOBAL_BANDS,
        lodBias: SURFACE_TILE_LOD_BIAS,
        residentSlot: HEIGHT_ONLY,
      });

      const heightRequests = result.requests.requests.filter((r) => r.tile.product === 'height');
      expect(heightRequests.length).toBeLessThan(100);
    });

    it('a pan that scrolls an unfetched sibling into view keeps every settled leaf', () => {
      // The flicker the eye-check found, now a regression guard: with residency
      // settled for one pose, a small pan brings tiles with no height into the
      // frustum. Nothing already on screen may vanish while they stream.
      const key = (t: SurfaceTileId) => `${t.product}/${t.z}/${t.x}/${t.y}`;
      const resident = new Set<string>();
      const residentSlot = (t: SurfaceTileId) => (resident.has(key(t)) ? WHOLE_ATLAS : null);
      const poseA = { ...nadirAt(1000, 20, 15), lodBias: 1, residentSlot };
      let settled = cutSurfaceTiles(poseA);
      for (let round = 0; round < 40; round++) {
        let added = 0;
        for (const r of settled.requests.requests)
          if (!resident.has(key(r.tile))) {
            resident.add(key(r.tile));
            added++;
          }
        if (added === 0) break;
        settled = cutSurfaceTiles(poseA);
      }
      expect(settled.cut.length).toBeGreaterThan(10);

      const panned = cutSurfaceTiles({ ...nadirAt(1000, 20.5, 15), lodBias: 1, residentSlot });
      const newHeights = panned.requests.requests.filter(
        (r) => r.tile.product === 'height' && !resident.has(key(r.tile)),
      );
      expect(newHeights.length, 'the pan does scroll an unfetched tile in').toBeGreaterThan(0);

      // What the pan WOULD draw with everything resident: the leaves the two
      // poses share are on screen in both, and must not have vanished.
      const ideal = cutSurfaceTiles({
        ...nadirAt(1000, 20.5, 15),
        lodBias: 1,
        residentSlot: () => WHOLE_ATLAS,
      });
      const settledLeaves = new Set(settled.cut.map((t) => `${t.id.z}/${t.id.x}/${t.id.y}`));
      const pannedLeaves = new Set(panned.cut.map((t) => `${t.id.z}/${t.id.x}/${t.id.y}`));
      let shared = 0;
      for (const leaf of ideal.cut) {
        const id = `${leaf.id.z}/${leaf.id.x}/${leaf.id.y}`;
        if (!settledLeaves.has(id)) continue;
        shared++;
        expect(pannedLeaves.has(id), `settled leaf ${id} survives the pan`).toBe(true);
      }
      expect(shared).toBeGreaterThan(10);
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
      const subCamera = surfaceTileXyForUv([20 / 360 + 0.5, 15 / 180 + 0.5], z, SURFACE_TILE_PX);
      const antipode = surfaceTileXyForUv([-160 / 360 + 0.5, -15 / 180 + 0.5], z, SURFACE_TILE_PX);

      expect(keys.has(`${z}/${subCamera[0]}/${subCamera[1]}`), 'sub-camera tile').toBe(true);
      expect(keys.has(`${z}/${antipode[0]}/${antipode[1]}`), 'antipodal tile').toBe(false);
      // Distinct TILES, not request rows: every tile is requested in both
      // products, so the row count is twice the footprint being asserted here.
      expect(keys.size).toBeLessThan(128 * 0.6);
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
      const xFrac = ({ z, x }: { z: number; x: number }) =>
        x / surfaceTileColumns(z, SURFACE_TILE_PX);
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
    // Both blocks below scale ONE fixture's camPosLocalM/radiusM pair together
    // to a real Earth radius, leaving viewProjLocal untouched (it already maps
    // unit-sphere-local points — equirectUvToDirection's own output —
    // straight to clip space regardless of what camPosLocalM/radiusM are in;
    // that's the caller's model-scale choice, not this walk's). If the walk
    // silently assumed radius 1 anywhere instead of reading `radiusM`, only
    // the metres form would disagree with the radii form.
    const RADIUS_M = EARTH_RADIUS_KM * 1000;

    function toMetres(radiiInput: ReturnType<typeof nadirAt>) {
      return {
        ...radiiInput,
        camPosLocalM: radiiInput.camPosLocalM.map((c) => c * RADIUS_M) as Vec3,
        radiusM: RADIUS_M,
      };
    }

    it('produces the identical tile-request list in metres as in radii', () => {
      // The strong form of the unit-agnosticism claim: not just zWin (which
      // is scale-invariant by construction and can't distinguish a dropped
      // radiusM parameterisation — verified by hand: forcing radiusM to 1 on
      // the metres fixture below still reports zWin 8, unchanged), but every
      // requested tile. Forcing radiusM to 1 on the metres fixture changes
      // the horizon threshold and the request COUNT (87 correct vs 89 forced)
      // for this exact fixture — hand-verified, not asserted here since that
      // would encode the bug's own number as a magic constant.
      const radii = cutSurfaceTiles(nadirAt(1000));
      const metres = cutSurfaceTiles(toMetres(nadirAt(1000)));
      expect(metres.requests.requests).toEqual(radii.requests.requests);
    });

    describe('horizon cull in metres, at an empirically-located cull boundary', () => {
      // A tile at MIN_TILE_LEVEL sharing the aimedAt camera's own meridian
      // (both at lon 0°), so only latitude separation drives the horizon
      // question. The boundary is located by BINARY SEARCH against the real
      // METRES-form function (not a hand-derived centre-angle formula, and
      // not the radii form narrowed afterward — right at a cull boundary the
      // two forms can disagree by a fraction of a km, since that's exactly
      // where a unit mismatch would show up) — the tile's own patch radius
      // shifts the true boundary well past what a centre-angle-only formula
      // predicts at this coarse a level (the reason the four-corner test
      // above measures every corner, not just the centre).
      const Z = MIN_TILE_LEVEL;
      const [TX, TY] = surfaceTileXyForUv([0 / 360 + 0.5, 40 / 180 + 0.5], Z, SURFACE_TILE_PX);
      const CAM_LAT_DEG = 10;
      const geo = tileGeometry(Z, TX, TY);

      function hasTile(altitudeKm: number): boolean {
        const result = cutSurfaceTiles(toMetres(aimedAt(CAM_LAT_DEG, altitudeKm, geo.centre, Z)));
        return result.requests.requests.some(
          (r) => r.tile.z === Z && r.tile.x === TX && r.tile.y === TY,
        );
      }

      // Visibility is a BAND in altitude, not a one-way step: too low (below
      // the horizon) is absent, but so is too high — the tile's SCREEN
      // footprint eventually shrinks below MIN_TILE_LEVEL's own LOD
      // requirement and the walk never refines into it. `hi` must sit
      // INSIDE that band (hand-verified true at 2000 km for this fixture),
      // not past its far edge, or the search converges on the LOD edge
      // instead of the horizon edge.
      let lo = -EARTH_RADIUS_KM * 0.99; // definitely too low: on/below the surface
      let hi = 2000; // inside the visible-AND-LOD-eligible band
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (hasTile(mid)) hi = mid;
        else lo = mid;
      }
      const insideAltitudeKm = hi + 1;
      const outsideAltitudeKm = lo - 1;

      it('requests the tile just inside the horizon cap, in metres with an explicit radiusM', () => {
        expect(hasTile(insideAltitudeKm)).toBe(true);
      });

      it('drops the tile just outside the horizon cap, in metres with an explicit radiusM', () => {
        // The catching assertion, hand-verified: at this altitude, forcing
        // radiusM back to 1 (as if the horizon test dropped its
        // parameterisation and still assumed a unit sphere while
        // camPosLocalM stayed metres-scaled) flips this exact tile from
        // absent to present. Restored to the real radiusM below.
        expect(hasTile(outsideAltitudeKm)).toBe(false);
      });
    });
  });

  describe('relief headroom in the frustum cull', () => {
    // Once geometry is displaced, a summit near a side plane is on screen
    // while its datum patch is not. The bound comes from the resident height
    // ancestor's own subtree range, never a constant: a constant margin would
    // re-inflate every patch near the eye plane into a screen-filling
    // straddler, which is the inflation R14's bounding sphere removed.
    const RADIUS_M = EARTH_RADIUS_KM * 1000;
    const EARTH_RELIEF_M: readonly [number, number] = [-430, 8849];
    const HEADROOM_BANDS: readonly SurfaceTileBand[] = [
      { uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: 15 },
    ];

    /** Albedo and height resident everywhere, every height tile declaring the
     *  same subtree range — one lives in each tile's `SHGT` chunk. */
    function residentWithRange(range: readonly [number, number]) {
      return (tile: SurfaceTileId) =>
        tile.product === 'height' ? { ...WHOLE_ATLAS, subtreeRangeM: range } : WHOLE_ATLAS;
    }

    function cutWithRange(range: readonly [number, number], altitudeM = 20_000, tiltDeg = 60) {
      const base = tiltedAt(altitudeM, tiltDeg);
      return cutSurfaceTiles({
        ...base,
        camPosLocalM: base.camPosLocalM.map((c) => c * RADIUS_M) as Vec3,
        radiusM: RADIUS_M,
        reliefM: EARTH_RELIEF_M,
        bands: HEADROOM_BANDS,
        residentSlot: residentWithRange(range),
      });
    }

    /** The set of nodes the walk did NOT cull — every surviving node in band
     *  requests itself, leaf or not, so this is the cull's own output. The
     *  CUT is not: a newly-visible child turns its parent from a leaf into an
     *  interior node, so the drawn set legitimately changes shape. */
    function survivors(
      range: readonly [number, number],
      altitudeM?: number,
      tiltDeg?: number,
    ): Set<string> {
      return new Set(
        cutWithRange(range, altitudeM, tiltDeg).requests.requests.map(
          (r) => `${r.tile.product}/${r.tile.z}/${r.tile.x}/${r.tile.y}`,
        ),
      );
    }

    /** Read off the walk at this pose and checked against exact geometry
     *  (patch sampled 41×41 × 21 heights, skirts included, against the side
     *  planes): with Earth's relief a point sits 92 m inside the frustum, on
     *  the datum every point is 25 m outside, and the flat walk reaches its
     *  parent. Pinned rather than counted — a size comparison passes on any
     *  inflation, which is the bug. */
    const ADMITTED_BY_RELIEF = 'height/13/4546/1702';
    /** 166 km outside the frustum at any height in Earth's relief. */
    const CULLED_BY_RELIEF = 'height/7/69/26';

    it('admits patches a flat datum culls, and culls none it kept', () => {
      const flat = survivors([0, 0]);
      const relief = survivors(EARTH_RELIEF_M);

      for (const id of flat) expect(relief.has(id), `${id} survived the datum cull`).toBe(true);
      expect(flat.has(ADMITTED_BY_RELIEF)).toBe(false);
      expect(relief.has(ADMITTED_BY_RELIEF)).toBe(true);
    });

    it('keeps a deep patch whose coarse range reaches past its own chord', () => {
      // 2 km up, before deeper headers land: this z15 patch's summit-height
      // points sit 1.1 km inside the frustum and its parent survives, so a
      // pad capped at the ~850 m chord would leave a hole.
      expect(survivors(EARTH_RELIEF_M, 2_000, 70).has('height/15/18204/6824')).toBe(true);
    });

    it('measures the subtree range in unit-sphere length, not metres', () => {
      // Undivided, Earth's 8849 m reads as 8849 RADII and admits everything.
      expect(survivors(EARTH_RELIEF_M).has(CULLED_BY_RELIEF)).toBe(false);
    });

    it('clips a subtree range to the body’s own relief', () => {
      // Unclipped, a range this absurd (157 000 Earth radii) sweeps every
      // node on the near hemisphere into frustum.
      expect(survivors([0, 1e12])).toEqual(survivors([0, EARTH_RELIEF_M[1]]));
    });
  });

  describe('relief in the screen-footprint estimate', () => {
    // Mars' datum lies ~2.7 km under Gale: a patch sized on the datum read a
    // camera 1 km above the ground as 3.7 km away, two levels short of sharp.
    const DEEP_BANDS: readonly SurfaceTileBand[] = [
      { uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: 19 },
    ];
    const GROUND = 2.7 / EARTH_RADIUS_KM;

    function deepestRequested(altitudeKm: number, range: readonly [number, number]): number {
      const result = cutSurfaceTiles({
        ...nadirAt(altitudeKm),
        bands: DEEP_BANDS,
        residentSlot: (tile: SurfaceTileId) =>
          tile.product === 'height' ? { ...WHOLE_ATLAS, subtreeRangeM: range } : WHOLE_ATLAS,
      });
      return Math.max(...result.requests.requests.map((r) => r.tile.z));
    }

    it('sizes a patch at its resident ground, not the datum', () => {
      expect(deepestRequested(1 + 2.7, [GROUND, GROUND])).toBe(deepestRequested(1, [0, 0]));
    });
  });

  describe('relief headroom in the horizon cull', () => {
    // Bug repro: Everest, ~2 m above the datum (the orbit target sinks to sea
    // level — F2), looking just below the horizon — a real EOX z8-13 deep
    // band (public/data/images/earth-tiles/manifest.json) plus the shallow
    // global band underneath. Unlike the frustum-sphere test two blocks up,
    // step 1 ("1. Horizon" in `probe`) never read the relief headroom: it culled
    // on the flat-datum angle alone, so a patch whose real relief (Everest's
    // 8849 m) would lift it above the smooth-sphere horizon at this altitude
    // is dropped before the relief-aware frustum test ever runs — visible
    // ground with NOTHING drawn (no leaf, no ancestor), the grey hole from
    // the eye-check, only where a deep band carries real relief and only at
    // the low camera heights/high tilts that put the visible ground strip
    // right at the razor-thin (~0.045° at 2 m) horizon cap.
    const EVEREST_BAND: SurfaceTileBand = {
      uBounds: [86.68212890625 / 360 + 0.5, 87.12158203125 / 360 + 0.5],
      vBounds: [27.79541015625 / 180 + 0.5, 28.10302734375 / 180 + 0.5],
      min: 8,
      max: 13,
    };
    const EVEREST_BANDS: readonly SurfaceTileBand[] = [
      { uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: 7 },
      EVEREST_BAND,
    ];
    const EVEREST_RELIEF_FRAC: readonly [number, number] = [
      -200 / (EARTH_RADIUS_KM * 1000),
      8849 / (EARTH_RADIUS_KM * 1000),
    ];

    function everestResidentSlot(range: readonly [number, number]) {
      return (tile: SurfaceTileId) => ({
        ...WHOLE_ATLAS,
        subtreeRangeM: tile.product === 'height' ? range : undefined,
      });
    }

    function everestRequests(range: readonly [number, number]) {
      const base = tiltedAt(2, 85, 86.955, 27.932);
      const { maxLevel: _maxLevel, ...input } = base;
      const result = cutSurfaceTiles({
        ...input,
        bands: EVEREST_BANDS,
        lodBias: 1,
        residentSlot: everestResidentSlot(range),
      });
      return new Set(
        result.requests.requests.map(
          (r) => `${r.tile.product}/${r.tile.z}/${r.tile.x}/${r.tile.y}`,
        ),
      );
    }

    // Read off the walk at this pose and checked against exact geometry
    // (patch sampled densely, sight lines tested against the datum sphere):
    // every datum point lies below the horizon, a summit at Everest's height
    // sits 3 km inside the frustum and in sight; stable across 80-90° tilt.
    const ADMITTED_BY_RELIEF = 'height/13/6074/1410';

    it('never requests the patch on a flat datum at this pose', () => {
      expect(everestRequests([0, 0]).has(ADMITTED_BY_RELIEF)).toBe(false);
    });

    it('requests the patch once Everest’s own relief is folded into the horizon cap', () => {
      expect(everestRequests(EVEREST_RELIEF_FRAC).has(ADMITTED_BY_RELIEF)).toBe(true);
    });

    it('plans a non-empty cut with the camera 50 m under the datum, once relief exists', () => {
      // Second finding: the early return for `camLen <= radiusM` used to plan
      // nothing at all here, regardless of relief — the target sinking below
      // the datum toward real terrain, not just the horizon cap, went dark.
      const base = tiltedAt(-50, 10, 86.955, 27.932);
      const { maxLevel: _maxLevel, ...input } = base;
      const result = cutSurfaceTiles({
        ...input,
        bands: EVEREST_BANDS,
        lodBias: 1,
        residentSlot: everestResidentSlot(EVEREST_RELIEF_FRAC),
      });
      expect(result.cut.length).toBeGreaterThan(0);
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

    // Full-residency mock: anything the walk is allowed to request resolves —
    // isolates the walk's cull/refine logic (under test) from any residency-
    // race concern (the exact-repro report's §1 already ruled that out).
    function mockResidentSlot(tile: SurfaceTileId) {
      // Height everywhere — the complete pyramid the bake owes the walk — so
      // this fixture keeps testing the bbox cull rather than the height gate.
      if (tile.product === 'height') return WHOLE_ATLAS;
      if (surfaceTileInBand(bands, SURFACE_TILE_PX, tile.z, tile.x, tile.y)) {
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
        frustum: symmetricFrustum(fovYRad, aspect),
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
        camPosLocalM,
        viewProjsLocal: [viewProjLocal],
        radiusM: 1,
        reliefM: UNBOUNDED_RELIEF,
        viewportPx,
        baseLevel: BASE_LEVEL,
        bands,
        tilePx: SURFACE_TILE_PX,
        lodBias: 1,
        residentSlot: mockResidentSlot,
      });

      // Coverage oracle, independent of the walk: every z19 tile near the
      // sub-camera point with a sample inside the frustum must be drawn by
      // itself or an ancestor. (This used to assert `> 200` leaves against an
      // empirical ~1100 — most of which were tiles BEHIND the camera that
      // straddled the eye plane and escaped the frustum cull; the sphere cull
      // leaves ~20, the ground actually on screen at 50 m.)
      const cutKeys = new Set(result.cut.map((t) => `${t.id.z}/${t.id.x}/${t.id.y}`));
      const covered = (z: number, x: number, y: number): boolean => {
        for (let az = z; az >= BASE_LEVEL; az--)
          if (cutKeys.has(`${az}/${x >> (z - az)}/${y >> (z - az)}`)) return true;
        return false;
      };
      const [cx, cy] = surfaceTileXyForUv(subCamUv, 19, SURFACE_TILE_PX);
      const cols19 = surfaceTileColumns(19, SURFACE_TILE_PX);
      let visible = 0;
      for (let x = cx - 20; x <= cx + 20; x++) {
        for (let y = cy - 20; y <= cy + 20; y++) {
          let onScreen = false;
          for (let i = 0; i < 9 && !onScreen; i++) {
            const u = (x + (i % 3) / 2) / cols19;
            const v = 1 - (y + Math.floor(i / 3) / 2) / (cols19 / 2);
            const p = equirectUvToDirection([u, v]);
            const m = viewProjLocal;
            const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
            if (w <= 0) continue;
            const nx = (m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!) / w;
            const ny = (m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!) / w;
            onScreen = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
          }
          if (!onScreen) continue;
          visible++;
          expect(covered(19, x, y), `z19 ${x}/${y} is on screen but not drawn`).toBe(true);
        }
      }
      expect(visible).toBeGreaterThan(0);
    });
  });

  describe('frustum sphere centred on the height-range midpoint (Jezero repro)', () => {
    // Bug repro, root-caused in the F4 investigation: at Jezero the ground
    // sits ~4,250-4,550 m above the 3,390 km datum. A datum-CENTRED node
    // sphere (the old code) sits kilometres underground near the eye, and its
    // radius — capped at the patch's own corner chord — can never reach up
    // to the real surface, so the bottom frustum plane culls the tile under
    // the rover. Bounds copied inline from the Jezero band in
    // public/data/images/mars-tiles/manifest.json (min 10, max 17).
    const R = MARS_DATUM_RADIUS_M;
    const MARS_BASE_LEVEL = baseLevelForTier('mars', 'large');
    const JEZERO_BAND: SurfaceTileBand = {
      uBounds: [(77.20367431640625 + 180) / 360, (77.2613525390625 + 180) / 360],
      vBounds: [(18.41033935546875 + 90) / 180, (18.4625244140625 + 90) / 180],
      min: 10,
      max: 17,
    };
    const JEZERO_BANDS: readonly SurfaceTileBand[] = [JEZERO_BAND];
    // Every tile's SHGT header, real bake or not: the walk only ever reads
    // the deepest resident ancestor's own subtreeRangeM.
    const RESIDENT_RANGE: readonly [number, number] = [4246, 4277];
    const residentSlot = (tile: SurfaceTileId) =>
      tile.product === 'height' ? { ...WHOLE_ATLAS, subtreeRangeM: RESIDENT_RANGE } : WHOLE_ATLAS;

    const SITE_LAT_DEG = 18.43687;
    const SITE_LON_DEG = 77.23205;
    const SITE_GROUND_M = 4260;
    const RANGE_M = 53.6;
    const ELEVATION_RAD = 0.863;
    const FOV_Y_RAD = Math.PI / 3;
    const VIEWPORT: [number, number] = [3456, 1886];

    const lat = (SITE_LAT_DEG * Math.PI) / 180;
    const lon = (SITE_LON_DEG * Math.PI) / 180;
    const up: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
    const north: Vec3 = [
      up[1] * east[2] - up[2] * east[1],
      up[2] * east[0] - up[0] * east[2],
      up[0] * east[1] - up[1] * east[0],
    ];
    const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => [
      a[0] + b[0] * s,
      a[1] + b[1] * s,
      a[2] + b[2] * s,
    ];
    const anchor: Vec3 = [
      up[0] * (R + SITE_GROUND_M),
      up[1] * (R + SITE_GROUND_M),
      up[2] * (R + SITE_GROUND_M),
    ];

    /** The pose's `cutSurfaceTiles` input at a given heading (0 = north, +east). */
    function poseAtHeading(headingRad: number) {
      const dirH = addScaled(
        [
          north[0] * Math.cos(headingRad),
          north[1] * Math.cos(headingRad),
          north[2] * Math.cos(headingRad),
        ],
        east,
        Math.sin(headingRad),
      );
      let eye = addScaled(anchor, dirH, RANGE_M * Math.cos(ELEVATION_RAD));
      eye = addScaled(eye, up, RANGE_M * Math.sin(ELEVATION_RAD));

      // Mirrors composeBodySlabMvp's own contract (see its header): `view`'s
      // eye-translation is cancelled by re-applying `+eye` so the resulting
      // `eyeView` is a pure rotation, ready to receive eye-RELATIVE points —
      // exactly what the model half of composeBodySlabMvp then supplies.
      const view = mat4d.lookAt(eye, anchor, up, new Float64Array(16));
      const eyeView = mat4d.multiply(
        view,
        mat4d.translation(eye, new Float64Array(16)),
        new Float64Array(16),
      );
      const proj = mat4d.perspective(
        FOV_Y_RAD,
        VIEWPORT[0] / VIEWPORT[1],
        0.05,
        1e7,
        new Float64Array(16),
      );
      const slabVp = mat4d.multiply(proj, eyeView, new Float64Array(16)) as Float64Array;
      const viewProjLocal = composeBodySlabMvp(slabVp, eye, R);

      return {
        camPosLocalM: eye,
        viewProjsLocal: [viewProjLocal],
        viewportPx: VIEWPORT,
        radiusM: R,
        reliefM: UNBOUNDED_RELIEF,
        baseLevel: MARS_BASE_LEVEL,
        bands: JEZERO_BANDS,
        tilePx: SURFACE_TILE_PX,
        lodBias: 1,
        residentSlot,
      };
    }

    /** Does any drawn leaf, at any level, cover the site direction? Mirrors
     *  the ancestor-fallback shape of `cut` itself: the rover's own tile need
     *  not be the deepest one drawn, only SOME ancestor along its column. */
    function siteIsCovered(cut: ReturnType<typeof cutSurfaceTiles>['cut']): boolean {
      const uv: [number, number] = [SITE_LON_DEG / 360 + 0.5, SITE_LAT_DEG / 180 + 0.5];
      for (let z = JEZERO_BAND.max; z > MARS_BASE_LEVEL; z--) {
        const [x, y] = surfaceTileXyForUv(uv, z, SURFACE_TILE_PX);
        if (cut.some((c) => c.id.z === z && c.id.x === x && c.id.y === y)) return true;
      }
      return false;
    }

    it('draws a leaf under the rover across a spread of headings', () => {
      for (const headingDeg of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const headingRad = (headingDeg * Math.PI) / 180;
        const result = cutSurfaceTiles(poseAtHeading(headingRad));
        expect(siteIsCovered(result.cut), `heading ${headingDeg}deg`).toBe(true);
      }
    });
  });

  describe('over several views', () => {
    const tileKeys = (result: ReturnType<typeof cutSurfaceTiles>): Set<string> =>
      new Set(
        result.requests.requests.map(({ tile }) => `${tile.product}/${tile.z}/${tile.x}/${tile.y}`),
      );

    it('one frustum given twice gives the one-frustum cut', () => {
      const input = nadirAt(400);
      const once = cutSurfaceTiles(input);
      const twice = cutSurfaceTiles({
        ...input,
        viewProjsLocal: [...input.viewProjsLocal, ...input.viewProjsLocal],
      });
      expect(twice).toEqual(once);
    });

    it('keeps a patch only the second frustum sees', () => {
      const input = nadirAt(400);
      const eye = input.camPosLocalM;
      const d = Math.hypot(eye[0], eye[1], eye[2]);
      const up: Vec3 = [eye[0] / d, eye[1] / d, eye[2] / d];
      // Same eye, looking level along a tangent: the limb, which nadir never sees.
      const tangent: Vec3 = [-up[1], up[0], 0];
      const level = mat4.lookAt(eye, [eye[0] + tangent[0], eye[1] + tangent[1], eye[2]], up);
      const proj = mat4.perspective(FOV_Y_RAD, VIEWPORT[0] / VIEWPORT[1], 0.001, 100);
      const levelVp = new Float64Array(mat4.multiply(proj, level));

      const nadirOnly = tileKeys(cutSurfaceTiles(input));
      const levelOnly = tileKeys(cutSurfaceTiles({ ...input, viewProjsLocal: [levelVp] }));
      const both = tileKeys(
        cutSurfaceTiles({ ...input, viewProjsLocal: [...input.viewProjsLocal, levelVp] }),
      );

      const onlySecond = [...levelOnly].filter((key) => !nadirOnly.has(key));
      expect(onlySecond.length).toBeGreaterThan(0);
      for (const key of onlySecond) expect(both.has(key), key).toBe(true);
      for (const key of nadirOnly) expect(both.has(key), key).toBe(true);
    });
  });
});
