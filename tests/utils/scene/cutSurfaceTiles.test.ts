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
import { EARTH_TILE_PX } from '../../../src/data/bodies/earthTileParams';
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
  const camPosLocal: Vec3 = [
    d * Math.cos(lat) * Math.cos(lon),
    d * Math.cos(lat) * Math.sin(lon),
    d * Math.sin(lat),
  ];
  const up: Vec3 = [camPosLocal[0] / d, camPosLocal[1] / d, camPosLocal[2] / d];
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
    camPosLocal[0] + forward[0],
    camPosLocal[1] + forward[1],
    camPosLocal[2] + forward[2],
  ];
  const view = mat4.lookAt(camPosLocal, target, up);
  const proj = mat4.perspective(FOV_Y_RAD, VIEWPORT[0] / VIEWPORT[1], 0.001, 100);
  const viewProjLocal = new Float32Array(mat4.multiply(proj, view));
  const maxLevel = 19;
  return {
    kind: 'surface' as const,
    camPosLocal,
    viewProjLocal,
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

describe('cutSurfaceTiles', () => {
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
          ? { slot: 7, atlasUvOrigin: [0.25, 0.5] as const, atlasUvScale: [0.125, 0.125] as const }
          : null;

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();
      expect(entry!.resident.slot).toBe(7);
      expect(entry!.resident.atlasUvOrigin[0]).toBeCloseTo(0.25, 12);
      expect(entry!.resident.atlasUvOrigin[1]).toBeCloseTo(0.5, 12);
      expect(entry!.resident.atlasUvScale[0]).toBeCloseTo(0.125, 12);
      expect(entry!.resident.atlasUvScale[1]).toBeCloseTo(0.125, 12);
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
          ? { slot: 3, ...ancestorRect }
          : null;

      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      const entry = result.cut.find((c) => c.id.z === z && c.id.x === x && c.id.y === y);
      expect(entry, `cut entry for ${z}/${x}/${y}`).toBeDefined();

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
          ? { slot: 0, atlasUvOrigin: [0, 0] as const, atlasUvScale: [1, 1] as const }
          : null;
      const result = cutSurfaceTiles({ ...nadirAt(1000), residentSlot });
      expect(result.cut).toEqual([]);
      expect(result.requests.requests.length).toBeGreaterThan(0);
    });

    it('draws a band-edge leaf outside every band\'s request range from a resident ancestor rect', () => {
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
        tile.z === z7 && tile.x === z7x && tile.y === z7y ? { slot: 3, ...ancestorRect } : null;

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

      const entry = result.cut.find(
        (c) => c.id.z === z8 && c.id.x === otherX && c.id.y === otherY,
      );
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
          ? { slot: 1, atlasUvOrigin: [0, 0] as const, atlasUvScale: [1, 1] as const }
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
      const result = cutSurfaceTiles({ ...nadirAt(1000), camPosLocal: [1, 0, 0] });
      expect(result.requests.requests).toEqual([]);
      expect(result.cut).toEqual([]);
      // Still a meaningful sub-camera direction, not a zero vector NaN trap —
      // the debug readout needs this even on the degenerate "no horizon" path.
      expect(result.requests.subCameraDirLocal).toEqual([1, 0, 0]);
    });

    it('reports subCameraDirLocal as the normalised camPosLocal, not a recomputed one', () => {
      const { camPosLocal } = nadirAt(1000);
      const len = Math.hypot(camPosLocal[0], camPosLocal[1], camPosLocal[2]);
      const result = cutSurfaceTiles(nadirAt(1000));
      expect(result.requests.subCameraDirLocal[0]).toBeCloseTo(camPosLocal[0] / len, 12);
      expect(result.requests.subCameraDirLocal[1]).toBeCloseTo(camPosLocal[1] / len, 12);
      expect(result.requests.subCameraDirLocal[2]).toBeCloseTo(camPosLocal[2] / len, 12);
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
});
