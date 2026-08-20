import type { EarthTileKind } from '../../@types/data/EarthTileKind';
import type { EarthTileId } from '../../@types/data/EarthTileId';
import type { EarthTileBand } from '../../@types/scene/EarthTileBand';
import type { EarthTilePlan } from '../../@types/scene/EarthTilePlan';
import type { EarthTileRequest } from '../../@types/scene/EarthTileRequest';
import type { SurfaceCutTile } from '../../@types/scene/SurfaceCutTile';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { earthTileColumns } from './earthTileColumns';
import { earthTileBandRefineAllowed } from './earthTileBandRefineAllowed';
import { earthTileBandRequestAllowed } from './earthTileBandRequestAllowed';
import { equirectUvToDirection } from '../math/equirectUvToDirection';

type ResidentLookupResult = {
  readonly slot: number;
  readonly atlasUvOrigin: readonly [number, number];
  readonly atlasUvScale: readonly [number, number];
} | null;

/**
 * cutSurfaceTiles — `planEarthTiles`'s walk, superseding it: one quadtree
 * walk, two products. `requests` is what to fetch (the plan, minus the
 * page-table window clip — gone with the page table it sized, Task 5).
 * `cut` is what to draw: each leaf resolved in the same pass via the
 * injected `residentSlot` ancestor-fallback lookup. Two walks re-deriving
 * the same horizon/frustum/refine logic would eventually desync; one walk
 * can't. `requests` IS an `EarthTilePlan` — Task 5 dropped the page-table
 * window fields from that type, so no reshaping seam is needed here.
 */
export function cutSurfaceTiles(input: {
  readonly kind: EarthTileKind;
  /** Camera position in Earth's local frame, in body-radii units (surface =
   *  unit sphere). */
  readonly camPosLocal: Readonly<Vec3>;
  /** View-projection for that frame, column-major. Only x/y extent is read,
   *  so the depth convention doesn't matter here. */
  readonly viewProjLocal: Float32Array;
  readonly viewportPx: Readonly<Vec2>;
  /** The level the whole-globe base texture already delivers — the walk's floor. */
  readonly baseLevel: number;
  /** The manifest's geographic depth bands for this kind; a leaf outside every
   *  overlapping band's `[min, max]` has no file and is not requested. */
  readonly bands: readonly EarthTileBand[];
  readonly tilePx: number;
  /** Levels coarser than one texel per screen pixel to settle for; see
   *  `EARTH_TILE_LOD_BIAS`. */
  readonly lodBias: number;
  /** Resolve one exact tile's atlas residency, or null if it is not
   *  resident. Injected so this stays a pure function testable without a
   *  real GPU/atlas — Task 5 wires the real `earthTileSubsystem.residentSlot`
   *  query in. Takes the full `EarthTileId` (carries `kind`, unlike
   *  `SurfaceCutTile.id`) because it must key the same
   *  `earthTilePath(tile, prefix)` lookup `earthTileSubsystem` already uses
   *  for its resident map. */
  readonly residentSlot: (tile: EarthTileId) => ResidentLookupResult;
}): {
  readonly cut: readonly SurfaceCutTile[];
  readonly requests: EarthTilePlan;
} {
  const {
    kind,
    camPosLocal,
    viewProjLocal,
    viewportPx,
    baseLevel,
    bands,
    tilePx,
    lodBias,
    residentSlot,
  } = input;

  const camLen = Math.hypot(camPosLocal[0], camPosLocal[1], camPosLocal[2]);
  // Computed before the early return below so a degenerate/underground camera
  // still reports a (best-effort) sub-camera direction rather than none.
  const camDir: Vec3 =
    camLen > 0
      ? [camPosLocal[0] / camLen, camPosLocal[1] / camLen, camPosLocal[2] / camLen]
      : [1, 0, 0];
  // Camera on or inside the surface: no horizon, nothing sensible to plan.
  if (!(camLen > 1))
    return { cut: [], requests: { zWin: baseLevel, requests: [], subCameraDirLocal: camDir } };
  // Horizon lies acos(1/d) from the sub-camera point on the unit sphere.
  const capAngle = Math.acos(1 / camLen);
  // The deepest level any band bakes: bounds `required` below so a huge
  // screen-space extent can't ask the walk to descend past every band's max.
  let maxTileLevel = baseLevel;
  for (const band of bands) if (band.max > maxTileLevel) maxTileLevel = band.max;

  // Hoisted out of the walk; the z row is never touched.
  const mx0 = viewProjLocal[0]!;
  const mx1 = viewProjLocal[4]!;
  const mx2 = viewProjLocal[8]!;
  const mx3 = viewProjLocal[12]!;
  const my0 = viewProjLocal[1]!;
  const my1 = viewProjLocal[5]!;
  const my2 = viewProjLocal[9]!;
  const my3 = viewProjLocal[13]!;
  const mw0 = viewProjLocal[3]!;
  const mw1 = viewProjLocal[7]!;
  const mw2 = viewProjLocal[11]!;
  const mw3 = viewProjLocal[15]!;

  const requests: EarthTileRequest[] = [];
  const cut: SurfaceCutTile[] = [];
  let zWin = baseLevel;

  // Explicit stack, not recursion: allocation-free in a per-frame path.
  const stack: number[] = [];
  const rootCols = earthTileColumns(baseLevel, tilePx);
  for (let y = 0; y < rootCols / 2; y++) {
    for (let x = 0; x < rootCols; x++) stack.push(baseLevel, x, y);
  }

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const z = stack.pop()!;

    const cols = earthTileColumns(z, tilePx);
    const rows = cols / 2;
    const u0 = x / cols;
    const u1 = (x + 1) / cols;
    // Tile rows count south from +90 while the mesh's v counts north from -90.
    const vNorth = 1 - y / rows;
    const vSouth = 1 - (y + 1) / rows;
    const uMid = (u0 + u1) / 2;
    const vMid = (vNorth + vSouth) / 2;
    // `v0`/`v1` are min/max, so `vSouth` (mesh-v increases north) is `v0`.
    const v0 = vSouth;
    const v1 = vNorth;

    const centre = equirectUvToDirection([uMid, vMid]);
    // Angular radius of the patch, to its corners (farthest from centre).
    const corner = equirectUvToDirection([u0, vNorth]);
    const patchAngle = Math.acos(
      Math.min(
        1,
        Math.max(-1, corner[0] * centre[0] + corner[1] * centre[1] + corner[2] * centre[2]),
      ),
    );

    // 1. Horizon
    const centreAngle = Math.acos(
      Math.min(
        1,
        Math.max(-1, centre[0] * camDir[0] + centre[1] * camDir[1] + centre[2] * camDir[2]),
      ),
    );
    if (centreAngle - patchAngle > capAngle) continue;

    // 2. Frustum, and the projected extent that drives everything else
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let nInFront = 0;
    for (let i = 0; i < 9; i++) {
      // Corners, edge midpoints and the centre.
      const su = u0 + ((i % 3) / 2) * (u1 - u0);
      const sv = vNorth + (Math.floor(i / 3) / 2) * (vSouth - vNorth);
      const p = equirectUvToDirection([su, sv]);
      const w = mw0 * p[0] + mw1 * p[1] + mw2 * p[2] + mw3;
      if (w <= 0) continue;
      nInFront++;
      const ndcX = (mx0 * p[0] + mx1 * p[1] + mx2 * p[2] + mx3) / w;
      const ndcY = (my0 * p[0] + my1 * p[1] + my2 * p[2] + my3) / w;
      if (ndcX < minX) minX = ndcX;
      if (ndcX > maxX) maxX = ndcX;
      if (ndcY < minY) minY = ndcY;
      if (ndcY > maxY) maxY = ndcY;
    }
    if (nInFront === 0) continue;
    // A sample past the near plane is dropped before it can corrupt the
    // bbox, but a STRADDLING patch's bbox is still meaningless: the true
    // footprint sweeps toward infinity as a sample nears w=0, so the
    // surviving corners alone can land anywhere, including a false reject
    // that prunes the whole subtree. Trust the bbox only when nothing was
    // dropped; otherwise treat the patch as screen-filling and force it to
    // the deepest level any band offers here.
    const straddlesNearPlane = nInFront < 9;
    if (!straddlesNearPlane && (maxX < -1 || minX > 1 || maxY < -1 || minY > 1)) continue;

    // NDC spans 2 units across the viewport, hence the halving.
    const screenPx = straddlesNearPlane
      ? Math.max(viewportPx[0], viewportPx[1])
      : Math.max(((maxX - minX) / 2) * viewportPx[0], ((maxY - minY) / 2) * viewportPx[1]);
    if (!(screenPx > 0)) continue;

    // 3 & 4. Refine or emit
    // `lodBias` is subtracted AFTER the ceil, not folded into the log
    // argument: for an integer bias `ceil(x) - bias === ceil(x - bias)`.
    const required = straddlesNearPlane
      ? maxTileLevel
      : Math.min(
          maxTileLevel,
          Math.max(baseLevel, z + Math.ceil(Math.log2(screenPx / tilePx)) - lodBias),
        );
    if (required > z && earthTileBandRefineAllowed(bands, z, u0, u1, v0, v1)) {
      // Same band-request gate as the leaf branch: a would-be ancestor no
      // band bakes at this z has no file to fetch either.
      if (earthTileBandRequestAllowed(bands, z, u0, u1, v0, v1))
        requests.push({ tile: { kind, z, x, y }, screenPx });
      stack.push(z + 1, x * 2, y * 2);
      stack.push(z + 1, x * 2 + 1, y * 2);
      stack.push(z + 1, x * 2, y * 2 + 1);
      stack.push(z + 1, x * 2 + 1, y * 2 + 1);
      continue;
    }
    // `zWin` is the finest level the walk REACHED, counting leaves no bake
    // covers, regardless of which files happen to exist.
    if (z > zWin) zWin = z;
    // Served by the base texture, but has no file to fetch — and, since no
    // atlas tile was ever requested for this leaf, none to draw either.
    if (!earthTileBandRequestAllowed(bands, z, u0, u1, v0, v1)) continue;
    requests.push({ tile: { kind, z, x, y }, screenPx });

    // Ancestor-fallback residency: the leaf's own tile if resident, else the
    // nearest resident ancestor strictly deeper than `baseLevel` (that level
    // and shallower is the base globe's, never atlas-resident — see
    // `resolveCutResidency`). No resident tile anywhere in the chain drops
    // the leaf from `cut` entirely; the base globe (Task 5) already covers
    // that ground.
    const resolved = resolveCutResidency({
      kind,
      z,
      x,
      y,
      u0,
      v0,
      baseLevel,
      tilePx,
      residentSlot,
    });
    if (resolved !== null) {
      cut.push({
        id: { z, x, y },
        // Direction of the tile's uv-origin corner `[u0, v0]` — the same
        // convention Task 3's mesh baker uses (binding cross-task contract,
        // see the Task 2 brief).
        originLocal: equirectUvToDirection([u0, v0]),
        resident: resolved,
      });
    }
  }

  // Largest-on-screen-first: residency walk order and fetch queue pop order.
  requests.sort((a, b) => b.screenPx - a.screenPx);

  return { cut, requests: { zWin, requests, subCameraDirLocal: camDir } };
}

/**
 * resolveCutResidency — walks from the leaf's own tile up toward (but not
 * including) `baseLevel`, returning the first resident hit. `quadrantOffset`
 * is `[u0, v0]`'s `[0,1)` fractional position inside the resolved ancestor's
 * footprint — the CPU-side, once-per-leaf twin of `earth/fragment.wesl`'s
 * per-fragment `cellCols`/`fract` math (lines ~241-245): `u0 * ancestorCols`
 * for x, `(1 - v0) * ancestorRows` for y (mesh `v` counts north, tile rows
 * count south, hence the flip). At `levelDelta` 0 this is exactly `[0, 0]`
 * by construction (`u0`/`v0` are already exact multiples of the leaf's own
 * tile grid).
 */
function resolveCutResidency(input: {
  readonly kind: EarthTileKind;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly u0: number;
  readonly v0: number;
  readonly baseLevel: number;
  readonly tilePx: number;
  readonly residentSlot: (tile: EarthTileId) => ResidentLookupResult;
}): SurfaceCutTile['resident'] | null {
  const { kind, z, x, y, u0, v0, baseLevel, tilePx, residentSlot } = input;

  for (let levelDelta = 0; z - levelDelta > baseLevel; levelDelta++) {
    const ancestorZ = z - levelDelta;
    const found = residentSlot({
      kind,
      z: ancestorZ,
      x: x >> levelDelta,
      y: y >> levelDelta,
    });
    if (found === null) continue;
    const ancestorCols = earthTileColumns(ancestorZ, tilePx);
    const ancestorRows = ancestorCols / 2;
    const frac = (n: number) => n - Math.floor(n);
    return {
      slot: found.slot,
      atlasUvOrigin: found.atlasUvOrigin,
      atlasUvScale: found.atlasUvScale,
      levelDelta,
      quadrantOffset: [frac(u0 * ancestorCols), frac((1 - v0) * ancestorRows)],
    };
  }
  return null;
}
