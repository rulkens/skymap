import type { EarthTileKind } from '../../@types/data/EarthTileKind';
import type { EarthTileBand } from '../../@types/scene/EarthTilePlannerParams';
import type { EarthTilePlan } from '../../@types/scene/EarthTilePlan';
import type { EarthTileRequest } from '../../@types/scene/EarthTileRequest';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { earthTileColumns } from './earthTileColumns';
import { earthTileBandRefineAllowed } from './earthTileBandRefineAllowed';
import { earthTileBandRequestAllowed } from './earthTileBandRequestAllowed';
import { equirectUvToDirection } from '../math/equirectUvToDirection';

/**
 * planEarthTiles — one frame's tile plan: a quadtree refinement over the
 * plate-carrée tile grid, run on the CPU, pure (see the spec/plan for why not
 * GPU feedback).
 *
 * A patch at level `z` whose projected extent is `screenPx` needs level
 * `z + ceil(log2(screenPx / tilePx)) - lodBias` (the engage gate elsewhere
 * reads `plan.zWin > baseLevel` instead of re-deriving this). A patch failing
 * this rule is refined, not emitted, but requested too: it is an ancestor of
 * every leaf beneath it, the fallback `buildEarthPageTable` needs while a
 * finer descendant is in flight.
 *
 * The walk roots at `baseLevel`, not a band's deeper `min`, so "the base is
 * enough here" comes out as `zWin === baseLevel` with nothing to fetch.
 * Rooting any deeper would make `zWin >= min` true by construction, leaving
 * the engage gate unsatisfiable.
 *
 * Both rejection tests below err toward KEEPING a patch: the horizon test
 * compares angular radius rather than corners (a cap can lie entirely inside
 * a patch whose corners sit outside it), and the frustum test samples nine
 * points so large patches with corners behind the camera still register.
 */
export function planEarthTiles(input: {
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
  /** Page-table window edge, in tiles at the finest level. */
  readonly windowSide: number;
  readonly tilePx: number;
  /** Levels coarser than one texel per screen pixel to settle for; see
   *  `EARTH_TILE_LOD_BIAS`. */
  readonly lodBias: number;
}): EarthTilePlan {
  const {
    kind,
    camPosLocal,
    viewProjLocal,
    viewportPx,
    baseLevel,
    bands,
    windowSide,
    tilePx,
    lodBias,
  } = input;

  const camLen = Math.hypot(camPosLocal[0], camPosLocal[1], camPosLocal[2]);
  // Camera on or inside the surface: no horizon, nothing sensible to plan.
  if (!(camLen > 1)) return { zWin: baseLevel, winX0: 0, winY0: 0, requests: [] };
  const camDir: Vec3 = [camPosLocal[0] / camLen, camPosLocal[1] / camLen, camPosLocal[2] / camLen];
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
    const uv = { u0, u1, v0: vSouth, v1: vNorth };

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
    let anyInFront = false;
    for (let i = 0; i < 9; i++) {
      // Corners, edge midpoints and the centre.
      const su = u0 + ((i % 3) / 2) * (u1 - u0);
      const sv = vNorth + (Math.floor(i / 3) / 2) * (vSouth - vNorth);
      const p = equirectUvToDirection([su, sv]);
      const w = mw0 * p[0] + mw1 * p[1] + mw2 * p[2] + mw3;
      if (w <= 0) continue;
      anyInFront = true;
      const ndcX = (mx0 * p[0] + mx1 * p[1] + mx2 * p[2] + mx3) / w;
      const ndcY = (my0 * p[0] + my1 * p[1] + my2 * p[2] + my3) / w;
      if (ndcX < minX) minX = ndcX;
      if (ndcX > maxX) maxX = ndcX;
      if (ndcY < minY) minY = ndcY;
      if (ndcY > maxY) maxY = ndcY;
    }
    if (!anyInFront) continue;
    if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) continue;

    // NDC spans 2 units across the viewport, hence the halving.
    const screenPx = Math.max(
      ((maxX - minX) / 2) * viewportPx[0],
      ((maxY - minY) / 2) * viewportPx[1],
    );
    if (!(screenPx > 0)) continue;

    // 3 & 4. Refine or emit
    // `lodBias` is subtracted AFTER the ceil, not folded into the log
    // argument: for an integer bias `ceil(x) - bias === ceil(x - bias)`.
    const required = Math.min(
      maxTileLevel,
      Math.max(baseLevel, z + Math.ceil(Math.log2(screenPx / tilePx)) - lodBias),
    );
    if (required > z && earthTileBandRefineAllowed(bands, z, uv)) {
      // Same band-request gate as the leaf branch: a would-be ancestor no
      // band bakes at this z has no file to fetch either.
      if (earthTileBandRequestAllowed(bands, z, uv))
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
    // Served by the base texture, but has no file to fetch.
    if (!earthTileBandRequestAllowed(bands, z, uv)) continue;
    requests.push({ tile: { kind, z, x, y }, screenPx });
  }

  // Largest-on-screen-first: residency walk order and fetch queue pop order.
  requests.sort((a, b) => b.screenPx - a.screenPx);

  // The window, centred on the sub-camera point at the finest level.
  const winCols = earthTileColumns(zWin, tilePx);
  const winRows = winCols / 2;
  const subUv: Vec2 = [
    Math.atan2(camDir[1], camDir[0]) / (2 * Math.PI) + 0.5,
    Math.asin(Math.min(1, Math.max(-1, camDir[2]))) / Math.PI + 0.5,
  ];
  const subX = Math.min(winCols - 1, Math.floor((((subUv[0] % 1) + 1) % 1) * winCols));
  const subY = Math.min(winRows - 1, Math.max(0, Math.floor((1 - subUv[1]) * winRows)));
  // Longitude wraps, so the window origin does too; latitude clamps. When the
  // grid is smaller than the window, the whole grid IS the window.
  const winX0 =
    winCols <= windowSide ? 0 : (((subX - windowSide / 2) % winCols) + winCols) % winCols;
  const winY0 =
    winRows <= windowSide ? 0 : Math.min(winRows - windowSide, Math.max(0, subY - windowSide / 2));

  // 5. Clip to the window: a tile the page table can't address would be
  // fetched and never sampled. The test is OVERLAP, not containment — a
  // coarse leaf straddling the edge still covers cells inside it, and
  // containment would put a resolution seam INSIDE the window.
  const inWindow = requests.filter(({ tile }) => {
    const span = 1 << (zWin - tile.z);
    const y0 = tile.y * span;
    if (y0 + span - 1 < winY0 || y0 > winY0 + windowSide - 1) return false;
    const dx = (((tile.x * span - winX0) % winCols) + winCols) % winCols;
    // `dx + span > winCols` means the tile wraps past column 0, which is
    // inside the window by construction.
    return dx < windowSide || dx + span > winCols;
  });

  return { zWin, winX0, winY0, requests: inWindow };
}
