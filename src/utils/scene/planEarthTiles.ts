import type { EarthTileKind } from '../../@types/data/EarthTileKind';
import type { EarthTilePlan } from '../../@types/scene/EarthTilePlan';
import type { EarthTileRequest } from '../../@types/scene/EarthTileRequest';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { earthTileColumns } from './earthTileColumns';
import { equirectUvToDirection } from '../math/equirectUvToDirection';

/**
 * planEarthTiles — one frame's tile plan: a quadtree refinement over the
 * plate-carrée tile grid, run on the CPU, pure.
 *
 * ## Why CPU-side rather than GPU feedback
 *
 * The textbook virtual-texturing approach has the fragment write the tile ids it
 * wanted into a buffer and the CPU read them back a frame later. It is exact —
 * it accounts for occlusion and for the real derivatives — and it loses here for
 * three reasons. It needs a `mapAsync` round trip plus at least one frame of
 * latency, on a renderer that is render-on-demand and often not running a
 * continuous loop. It needs a second pass or a fragment-stage storage write,
 * which is fresh iOS validation surface on the app's visual centrepiece, where a
 * bad shader freezes the canvas with no thrown error. And its advantage is
 * precision about occlusion, which for a single convex sphere with no
 * self-occlusion beyond the horizon is worth approximately nothing.
 *
 * Being pure is the other half of the argument: this is the one genuinely
 * testable surface in the whole feature.
 *
 * ## The one level rule
 *
 * A patch at level `z` whose projected extent is `screenPx` needs level
 * `z + ceil(log2(screenPx / tilePx))`. That is stated once, here, and the
 * engage gate elsewhere reads `plan.zWin > baseLevel` rather than re-deriving a
 * distance threshold — the two are the same statement about screen texel
 * density seen from opposite ends, and having two homes for it would be two
 * places to get the exponent wrong.
 *
 * ## Why the walk floor and the request floor are different levels
 *
 * `baseLevel` is the density the whole-globe base texture already delivers;
 * `minTileLevel` is the shallowest level with tile files, which is deeper
 * because the base is itself a level of the same pyramid. The walk is rooted at
 * `baseLevel` so that "the base is enough here" is an answer the plan can
 * express — it comes out as `zWin === baseLevel` with nothing to fetch — and
 * that is exactly what the engage gate reads. Rooting at `minTileLevel` instead
 * would make `zWin >= minTileLevel` true of every plan, leaving the gate
 * unsatisfiable against its own floor. Leaves that stop at a level shallower
 * than `minTileLevel` are dropped rather than requested: the ground they cover
 * is served by the base texture, and there is no file to fetch for them.
 *
 * ## Conservative rejection, deliberately
 *
 * Both rejection tests err toward KEEPING a patch. Wrongly keeping one costs a
 * fetch that is never sampled; wrongly rejecting one leaves a hole in the middle
 * of the screen. So the horizon test compares the patch's angular radius against
 * the visibility cap rather than testing its corners (four corners can all sit
 * outside a small cap that lies entirely inside the patch — which is exactly the
 * sub-camera tile at low altitude, the one patch that must never be dropped),
 * and the frustum test samples nine points rather than four, so a patch big
 * enough to have its corners behind the camera still registers.
 */
export function planEarthTiles(input: {
  readonly kind: EarthTileKind;
  /** Camera position in Earth's local frame, in body-radii units (the surface
   *  is the unit sphere), which is what `camPosLocal` already carries into
   *  `packEarthSurfaceUniforms`. */
  readonly camPosLocal: Readonly<Vec3>;
  /** View-projection for that same local frame, column-major — a `Float32Array`
   *  because that is what `composeBodyMvp` hands the Earth draw. Only the x/y
   *  extent of a projected point is read, so the depth convention (reversed-Z
   *  or not) does not matter here. */
  readonly viewProjLocal: Float32Array;
  readonly viewportPx: Readonly<Vec2>;
  /** The level the whole-globe base texture already delivers — the walk's floor. */
  readonly baseLevel: number;
  /** The manifest's shallowest baked level for this kind; leaves above it have
   *  no file and are not requested. */
  readonly minTileLevel: number;
  /** The manifest's deepest baked level for this kind. */
  readonly maxTileLevel: number;
  /** Page-table window edge, in tiles at the finest level. */
  readonly windowSide: number;
  readonly tilePx: number;
}): EarthTilePlan {
  const {
    kind,
    camPosLocal,
    viewProjLocal,
    viewportPx,
    baseLevel,
    minTileLevel,
    maxTileLevel,
    windowSide,
    tilePx,
  } = input;

  const camLen = Math.hypot(camPosLocal[0], camPosLocal[1], camPosLocal[2]);
  // Camera on or inside the surface: no horizon, nothing sensible to plan.
  if (!(camLen > 1)) return { zWin: baseLevel, winX0: 0, winY0: 0, requests: [] };
  const camDir: Vec3 = [camPosLocal[0] / camLen, camPosLocal[1] / camLen, camPosLocal[2] / camLen];
  // Angular radius of the visible cap: the horizon lies acos(1/d) from the
  // sub-camera point on the unit sphere.
  const capAngle = Math.acos(1 / camLen);

  // The three rows of the view-projection this walk reads, hoisted out of a loop
  // that runs a few thousand times a frame. Column-major, so row r of column c is
  // element c*4 + r; the z row is never touched, because only screen EXTENT
  // matters here and depth does not.
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

  // Explicit stack of (z, x, y) triples rather than recursion: the walk can go
  // eight levels deep across hundreds of roots, and a flat number array keeps
  // the whole thing allocation-free in a per-frame path.
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

    const centre = equirectUvToDirection([uMid, vMid]);
    // Angular radius of the patch, measured to its corners (the farthest points
    // from the centre on a lat/lon quad).
    const corner = equirectUvToDirection([u0, vNorth]);
    const patchAngle = Math.acos(
      Math.min(
        1,
        Math.max(-1, corner[0] * centre[0] + corner[1] * centre[1] + corner[2] * centre[2]),
      ),
    );

    // ── 1. Horizon ────────────────────────────────────────────────────────
    const centreAngle = Math.acos(
      Math.min(
        1,
        Math.max(-1, centre[0] * camDir[0] + centre[1] * camDir[1] + centre[2] * camDir[2]),
      ),
    );
    if (centreAngle - patchAngle > capAngle) continue;

    // ── 2. Frustum, and the projected extent that drives everything else ──
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let anyInFront = false;
    for (let i = 0; i < 9; i++) {
      // Corners, edge midpoints and the centre. Nine rather than four so a patch
      // large enough to have its corners behind the camera still registers.
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

    // ── 3 & 4. Refine or emit ─────────────────────────────────────────────
    const required = Math.min(
      maxTileLevel,
      Math.max(baseLevel, z + Math.ceil(Math.log2(screenPx / tilePx))),
    );
    if (required > z && z < maxTileLevel) {
      stack.push(z + 1, x * 2, y * 2);
      stack.push(z + 1, x * 2 + 1, y * 2);
      stack.push(z + 1, x * 2, y * 2 + 1);
      stack.push(z + 1, x * 2 + 1, y * 2 + 1);
      continue;
    }
    // `zWin` is the finest level the walk REACHED, counting leaves that no bake
    // covers: it is what the engage gate reads ("does the screen want more than
    // the base has?") and what the page-table window is sized at, and neither
    // question is about which files happen to exist.
    if (z > zWin) zWin = z;
    // A leaf the base texture already serves is still a leaf — it ends the walk
    // — but there is no file to fetch for it, so it is not a request.
    if (z < minTileLevel) continue;
    requests.push({ tile: { kind, z, x, y }, screenPx });
  }

  // Largest-on-screen-first: the order residency walks in, and the order the
  // fetch queue pops in.
  requests.sort((a, b) => b.screenPx - a.screenPx);

  // ── The window, centred on the sub-camera point at the finest level ──────
  const winCols = earthTileColumns(zWin, tilePx);
  const winRows = winCols / 2;
  const subUv: Vec2 = [
    Math.atan2(camDir[1], camDir[0]) / (2 * Math.PI) + 0.5,
    Math.asin(Math.min(1, Math.max(-1, camDir[2]))) / Math.PI + 0.5,
  ];
  const subX = Math.min(winCols - 1, Math.floor((((subUv[0] % 1) + 1) % 1) * winCols));
  const subY = Math.min(winRows - 1, Math.max(0, Math.floor((1 - subUv[1]) * winRows)));
  // Longitude wraps, so the window origin does too; latitude does not, so it
  // clamps — and when the grid is smaller than the window the whole grid IS the
  // window and the origin is 0.
  const winX0 =
    winCols <= windowSide ? 0 : (((subX - windowSide / 2) % winCols) + winCols) % winCols;
  const winY0 =
    winRows <= windowSide ? 0 : Math.min(winRows - windowSide, Math.max(0, subY - windowSide / 2));

  // ── 5. Clip to the window ───────────────────────────────────────────────
  //
  // A tile the page table cannot address is a tile that would be fetched,
  // uploaded and then never sampled, so the clip belongs here rather than in the
  // shader. Ground beyond the window falls back to the whole-globe base texture,
  // which is the same identity case an empty atlas produces.
  //
  // The test is OVERLAP, not containment: a coarse leaf straddling the window
  // edge still covers cells inside it, and `buildEarthPageTable` naturally writes
  // only the cells it has. Demanding full containment would drop such a leaf and
  // put a resolution seam INSIDE the window rather than at its frontier.
  //
  // Longitude wraps and latitude does not, so the two axes are tested
  // differently — the same asymmetry `earthTileXyForUv` handles, for the same
  // reason.
  const inWindow = requests.filter(({ tile }) => {
    const span = 1 << (zWin - tile.z);
    const y0 = tile.y * span;
    if (y0 + span - 1 < winY0 || y0 > winY0 + windowSide - 1) return false;
    const dx = (((tile.x * span - winX0) % winCols) + winCols) % winCols;
    // `dx + span > winCols` means the tile wraps past column 0, which is inside
    // the window by construction.
    return dx < windowSide || dx + span > winCols;
  });

  return { zWin, winX0, winY0, requests: inWindow };
}
