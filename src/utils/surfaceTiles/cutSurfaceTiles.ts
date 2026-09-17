import type { SurfaceTileId } from '../../@types/data/SurfaceTileId';
import type { SurfaceTileBand } from '../../@types/scene/SurfaceTileBand';
import type { SurfaceTilePlan } from '../../@types/scene/SurfaceTilePlan';
import type { SurfaceTileRequest } from '../../@types/scene/SurfaceTileRequest';
import type { SurfaceCutTile } from '../../@types/scene/SurfaceCutTile';
import type { ResolvedTileResidency } from '../../@types/scene/ResolvedTileResidency';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { surfaceTileColumns } from './surfaceTileColumns';
import { surfaceTileBandRefineAllowed } from './surfaceTileBandRefineAllowed';
import { surfaceTileInBand } from './surfaceTileInBand';
import { equirectUvToDirection } from '../math/equirectUvToDirection';
import { surfacePatchAnchor } from './surfacePatchAnchor';
import { balanceSurfaceCut } from './balanceSurfaceCut';
import { resolveHeightLattice } from './resolveHeightLattice';
import { deepestResidentAncestor } from './deepestResidentAncestor';

type ResidentLookupResult = {
  readonly slot: number;
  readonly atlasUvOrigin: readonly [number, number];
  readonly atlasUvScale: readonly [number, number];
  readonly readyAtMs: number;
  /** HEIGHT only: the tile header's `subtreeMin/MaxM`, which bound every
   *  descendant of that tile. Absent or null is read as "no bound known",
   *  which is the datum — never an assumption of flat ground. */
  readonly subtreeRangeM?: readonly [number, number] | null;
} | null;

/** Placeholder until `balanceSurfaceCut` fills the real bits in. */
const NO_COARSER_EDGES: SurfaceCutTile['edgeCoarser'] = [0, 0, 0, 0];
/** No resident height ancestor, or one with no bound: the datum. */
const DATUM_RANGE_M: readonly [number, number] = [0, 0];

/**
 * cutSurfaceTiles — one quadtree walk, two products: `requests` is what to
 * fetch, `cut` what to draw. Refinement is residency-blind (R14) — screen
 * error and the bands alone — and a leaf whose own height has not landed
 * inherits the deepest resident ancestor's lattice, so nothing is ever a hole.
 * A node's cull is computed by its PARENT (`probe`) and rides the stack.
 */
export function cutSurfaceTiles(input: {
  /** Eye − body centre, in the body's fixed axes, METRES (was body-radii
   *  units — see `radiusM` below, the walk's new length scale). */
  readonly camPosLocalM: Readonly<Vec3>;
  /** The body slab's own f64 vp, built about the eye, in metres. Only x/y
   *  extent is read, so the depth convention doesn't matter here. Stays
   *  `Float64Array` as a belt-and-braces contract: the `w`-row cancellation
   *  that forced it under the old Mpc-frame walk (`composeBodyMvp`'s header)
   *  no longer occurs — metres is already the small, well-conditioned unit
   *  — but keeping the type honest costs nothing and guards a future caller
   *  that narrows too early. */
  readonly viewProjLocal: Float64Array;
  readonly viewportPx: Readonly<Vec2>;
  /** The body's equatorial radius in metres — was implicit (unit sphere);
   *  the walk's horizon test now scales against this instead. */
  readonly radiusM: number;
  /** The level the whole-globe base texture already delivers — the walk's floor. */
  readonly baseLevel: number;
  /** The manifest's geographic depth bands for the albedo product; a leaf
   *  outside every overlapping band's `[min, max]` has no file and is not
   *  requested. */
  readonly bands: readonly SurfaceTileBand[];
  readonly tilePx: number;
  /** Levels coarser than one texel per screen pixel to settle for; see
   *  `SURFACE_TILE_LOD_BIAS`. */
  readonly lodBias: number;
  /** Resolve one exact tile's atlas residency, or null if it is not
   *  resident. Injected so this stays a pure function testable without a
   *  real GPU/atlas — Task 5 wires the real `surfaceTileSubsystem.residentSlot`
   *  query in. Takes the full `SurfaceTileId` (carries `product`, unlike
   *  `SurfaceCutTile.id`) because it must key the same
   *  `surfaceTilePath(tile, prefix)` lookup `surfaceTileSubsystem` already uses
   *  for its resident map. */
  readonly residentSlot: (tile: SurfaceTileId) => ResidentLookupResult;
}): {
  readonly cut: readonly SurfaceCutTile[];
  readonly requests: SurfaceTilePlan;
} {
  const {
    camPosLocalM,
    viewProjLocal,
    viewportPx,
    radiusM,
    baseLevel,
    bands,
    tilePx,
    lodBias,
    residentSlot,
  } = input;

  const camLen = Math.hypot(camPosLocalM[0], camPosLocalM[1], camPosLocalM[2]);
  const camDir: Vec3 =
    camLen > 0
      ? [camPosLocalM[0] / camLen, camPosLocalM[1] / camLen, camPosLocalM[2] / camLen]
      : [1, 0, 0];
  // Horizon lies acos(radiusM/d) from the sub-camera point on the sphere —
  // the metres-native form of the old unit-sphere acos(1/d) (radiusM = 1
  // there), so the walk is unit-agnostic rather than assuming a unit sphere.
  // A camera on/inside the datum (the F2 orbit target sinking to sea level
  // over relief that reaches above it) has no flat-datum distance to take
  // acos of; clamp it to just outside the sphere so capAngle stays finite —
  // the relief headroom's per-node widening in `probe` is what actually admits
  // terrain in that case, not this floor value.
  const capCamLen = Math.max(camLen, radiusM * (1 + 1e-9));
  const capAngle = Math.acos(radiusM / capCamLen);
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
  // The four side planes of the frustum in the walk's own frame (the rows of
  // the vp, Gribb–Hartmann): inside is `w ± x >= 0`, `w ± y >= 0`. Normalised
  // so a signed distance compares against a bounding radius.
  const planeA = [mw0 + mx0, mw0 - mx0, mw0 + my0, mw0 - my0];
  const planeB = [mw1 + mx1, mw1 - mx1, mw1 + my1, mw1 - my1];
  const planeC = [mw2 + mx2, mw2 - mx2, mw2 + my2, mw2 - my2];
  const planeD = [mw3 + mx3, mw3 - mx3, mw3 + my3, mw3 - my3];
  const planeInvLen = planeA.map((a, k) => 1 / Math.hypot(a, planeB[k]!, planeC[k]!));

  const requests: SurfaceTileRequest[] = [];
  const cut: SurfaceCutTile[] = [];
  let zWin = baseLevel;

  /** Horizon + frustum cull for one node plus the level its screen footprint
   *  asks for; `null` when culled. Once per node — see the header. */
  function probe(z: number, x: number, y: number): { screenPx: number; required: number } | null {
    const cols = surfaceTileColumns(z, tilePx);
    const rows = cols / 2;
    const u0 = x / cols;
    const u1 = (x + 1) / cols;
    // Tile rows count south from +90 while the mesh's v counts north from -90.
    const vNorth = 1 - y / rows;
    const vSouth = 1 - (y + 1) / rows;

    const centre = equirectUvToDirection([(u0 + u1) / 2, (vNorth + vSouth) / 2]);
    // Angular radius of the patch, to its corners (farthest from centre) —
    // ALL FOUR, not just one: meridians converge toward the poles, so a
    // plate-carrée patch is not angularly symmetric about its centre. A
    // northern patch's north corners sit closer to centre than its south
    // corners (mirrored south of the equator); measuring from a single
    // corner (formerly the NW one) underestimated the radius whenever that
    // corner happened to be the near-pole one, wrongly culling patches whose
    // far-from-pole edge alone still reached into the horizon cap.
    const cornerNW = equirectUvToDirection([u0, vNorth]);
    const cornerNE = equirectUvToDirection([u1, vNorth]);
    const cornerSW = equirectUvToDirection([u0, vSouth]);
    const cornerSE = equirectUvToDirection([u1, vSouth]);
    const minCornerDot = Math.min(
      cornerNW[0] * centre[0] + cornerNW[1] * centre[1] + cornerNW[2] * centre[2],
      cornerNE[0] * centre[0] + cornerNE[1] * centre[1] + cornerNE[2] * centre[2],
      cornerSW[0] * centre[0] + cornerSW[1] * centre[1] + cornerSW[2] * centre[2],
      cornerSE[0] * centre[0] + cornerSE[1] * centre[1] + cornerSE[2] * centre[2],
    );
    const patchAngle = Math.acos(Math.min(1, Math.max(-1, minCornerDot)));
    // Shared by both culls and the footprint below, so the resident-ancestor
    // walk runs once per node.
    const rangeM = residentSubtreeRangeM(z, x, y);
    const relief = Math.max(Math.abs(rangeM[0]), Math.abs(rangeM[1])) / radiusM;
    // Footprint sampled at the subtree's LOWEST ground, not the datum (Mars'
    // sits km under its rover sites): never nearer than the real ground, so
    // never over-refines or turns a patch into a straddler, and it tightens
    // monotonically as deeper height tiles land.
    const lift = 1 + rangeM[0] / radiusM;

    // 1. Horizon, widened by the angle relief lifts a point above the
    // smooth-sphere horizon: a point at radius R+h is visible from a camera
    // at distance d when its angle from the sub-camera point is
    // <= acos(R/d) + acos(R/(R+h)) — the second term is acos(1/(1+relief))
    // since `relief` is already h/R.
    const centreAngle = Math.acos(
      Math.min(
        1,
        Math.max(-1, centre[0] * camDir[0] + centre[1] * camDir[1] + centre[2] * camDir[2]),
      ),
    );
    const horizonCap = relief > 0 ? capAngle + Math.acos(1 / (1 + relief)) : capAngle;
    if (centreAngle - patchAngle > horizonCap) return null;

    // 2. Frustum, conservatively: a sphere about the patch centre, radius to
    // the farthest corner plus headroom for skirts, plus the relief this
    // node's subtree can actually reach. The only test a near-plane straddler
    // gets — its projected bbox below is meaningless — and it also catches
    // points entirely behind the eye, which fail every plane test at once.
    const cornerChord = Math.sqrt(Math.max(0, 2 - 2 * minCornerDot));
    const boundRadius = 1.5 * cornerChord + Math.min(relief, cornerChord);
    for (let k = 0; k < 4; k++) {
      const dist =
        (planeA[k]! * centre[0] + planeB[k]! * centre[1] + planeC[k]! * centre[2] + planeD[k]!) *
        planeInvLen[k]!;
      if (dist < -boundRadius) return null;
    }

    // 3. The projected extent that drives everything else
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
      const px = p[0] * lift;
      const py = p[1] * lift;
      const pz = p[2] * lift;
      const w = mw0 * px + mw1 * py + mw2 * pz + mw3;
      if (w <= 0) continue;
      nInFront++;
      const ndcX = (mx0 * px + mx1 * py + mx2 * pz + mx3) / w;
      const ndcY = (my0 * px + my1 * py + my2 * pz + my3) / w;
      if (ndcX < minX) minX = ndcX;
      if (ndcX > maxX) maxX = ndcX;
      if (ndcY < minY) minY = ndcY;
      if (ndcY > maxY) maxY = ndcY;
    }
    if (nInFront === 0) return null;
    // A sample past the near plane is dropped before it can corrupt the bbox,
    // but a straddler's bbox stays meaningless regardless (its footprint
    // sweeps toward infinity as w→0): trust it only when nothing was dropped,
    // else treat the patch as screen-filling at the deepest level.
    const straddlesNearPlane = nInFront < 9;
    if (!straddlesNearPlane && (maxX < -1 || minX > 1 || maxY < -1 || minY > 1)) return null;

    // NDC spans 2 units, hence the halving. GEOMETRIC MEAN, not max — sizing
    // a foreshortened sliver by its width alone over-refines it for its area.
    const screenPx = straddlesNearPlane
      ? Math.max(viewportPx[0], viewportPx[1])
      : Math.sqrt(((maxX - minX) / 2) * viewportPx[0] * (((maxY - minY) / 2) * viewportPx[1]));
    if (!(screenPx > 0)) return null;

    // `lodBias` is subtracted AFTER the ceil, not folded into the log
    // argument: for an integer bias `ceil(x) - bias === ceil(x - bias)`.
    const required = straddlesNearPlane
      ? maxTileLevel
      : Math.min(
          maxTileLevel,
          Math.max(baseLevel, z + Math.ceil(Math.log2(screenPx / tilePx)) - lodBias),
        );
    return { screenPx, required };
  }

  /** Relief a node's subtree can reach, in METRES — the deepest resident
   *  height ancestor's `subtreeMin/MaxM`, which bounds every descendant by
   *  construction. The datum when nothing is resident, as F1. A CONSTANT
   *  margin instead would inflate every patch near the eye plane back into a
   *  screen-filling straddler, which is what R14 removed — and so does the
   *  caller's clamp at the patch's own chord, since before deep tiles land
   *  the resident ancestor is the base level, whose range is the whole
   *  body's relief (R15). */
  function residentSubtreeRangeM(z: number, x: number, y: number): readonly [number, number] {
    const hit = deepestResidentAncestor({ product: 'height', z, x, y }, baseLevel, residentSlot);
    return hit?.found.subtreeRangeM ?? DATUM_RANGE_M;
  }

  /** Both products of one tile — height rides every albedo request (§6.1),
   *  band-floor ancestors included: refinement needs posts, not pixels. */
  function request(z: number, x: number, y: number, screenPx: number): void {
    requests.push({ tile: { product: 'albedo', z, x, y }, screenPx });
    requests.push({ tile: { product: 'height', z, x, y }, screenPx });
  }

  /** The lattice a leaf at `(z, x, y)` samples, `minLevelDelta` levels up or
   *  coarser; also `balanceSurfaceCut`'s resolver. */
  function heightOf(
    z: number,
    x: number,
    y: number,
    minLevelDelta: number,
  ): SurfaceCutTile['height'] | null {
    return resolveHeightLattice({ z, x, y, baseLevel, minLevelDelta, residentSlot });
  }

  // Explicit stack, not recursion: allocation-free in a per-frame path. Five
  // numbers per node — its id plus `probe`'s two results, unpaid for twice.
  const stack: number[] = [];

  const rootCols = surfaceTileColumns(baseLevel, tilePx);
  for (let y = 0; y < rootCols / 2; y++) {
    for (let x = 0; x < rootCols; x++) {
      const probed = probe(baseLevel, x, y);
      if (probed !== null) stack.push(baseLevel, x, y, probed.screenPx, probed.required);
    }
  }

  while (stack.length > 0) {
    const required = stack.pop()!;
    const screenPx = stack.pop()!;
    const y = stack.pop()!;
    const x = stack.pop()!;
    const z = stack.pop()!;

    const cols = surfaceTileColumns(z, tilePx);
    const rows = cols / 2;
    const u0 = x / cols;
    const u1 = (x + 1) / cols;
    // `v0`/`v1` are min/max, so the south edge (mesh-v increases north) is `v0`.
    const v0 = 1 - (y + 1) / rows;
    const v1 = 1 - y / rows;

    // 3 & 4. Refine or emit
    if (required > z && surfaceTileBandRefineAllowed(bands, z, u0, u1, v0, v1)) {
      // Residency-blind (R14): every visible child is descended into, and each
      // requests itself when popped. Holding the parent until a child's height
      // landed was what turned an atlas miss into a permanent hole, since the
      // refused allocation is never retried.
      let visibleChildren = 0;
      for (let q = 0; q < 4; q++) {
        const cx = x * 2 + (q & 1);
        const cy = y * 2 + (q >> 1);
        const probed = probe(z + 1, cx, cy);
        if (probed === null) continue;
        visibleChildren++;
        stack.push(z + 1, cx, cy, probed.screenPx, probed.required);
      }

      if (visibleChildren > 0) {
        // The ancestor chain is fetched alongside the leaves: albedo inherits
        // from it, and a request is also the LRU touch that keeps it alive.
        if (surfaceTileInBand(bands, tilePx, z, x, y)) request(z, x, y, screenPx);
        continue;
      }
      // Every child culled, so this node is the leaf after all. Demand, not
      // residency: `zWin` is the subsystem's engage gate, so it names the level
      // asked for rather than the one drawn.
      if (z + 1 > zWin) zWin = z + 1;
    } else if (z > zWin) {
      // `zWin` is the finest level the walk REACHED, counting leaves no bake
      // covers, regardless of which files happen to exist.
      zWin = z;
    }

    // Requestable and drawable are different questions: a leaf can sit past
    // every overlapping band's max (e.g. just outside a deep band's bbox,
    // under a shallower global band) with no file of its OWN to fetch, yet
    // still have a resident ANCESTOR to draw — skip only the fetch, not the
    // residency lookup below, or a band-edge ring never gets ancestor pixels.
    if (surfaceTileInBand(bands, tilePx, z, x, y)) request(z, x, y, screenPx);

    // Height inherits exactly as albedo does (R14); `balanceSurfaceCut` then
    // stitches the levels the two neighbours ended up on.
    const height = heightOf(z, x, y, 0);
    if (height === null) continue;

    // Ancestor-fallback residency: the leaf's own tile if resident, else the
    // nearest resident ancestor strictly deeper than `baseLevel` (that level
    // and shallower is the base globe's, never atlas-resident — see
    // `resolveCutResidency`). No resident tile anywhere in the chain drops
    // the leaf from `cut`; the base globe fills in for THAT case instead.
    const resolved = resolveCutResidency({ z, x, y, baseLevel, residentSlot });
    if (resolved !== null) {
      cut.push({
        id: { z, x, y },
        anchor: surfacePatchAnchor(u0, v0, u1, v1),
        albedo: resolved,
        height,
        edgeCoarser: NO_COARSER_EDGES,
      });
    }
  }

  // Level balance over the finished cut: a neighbour relation only exists once
  // every leaf is known, and coarsening one lattice can unbalance another.
  const balanced = balanceSurfaceCut(cut, tilePx, bands, heightOf);

  // Largest-on-screen-first: residency walk order and fetch queue pop order.
  requests.sort((a, b) => b.screenPx - a.screenPx);

  return { cut: balanced, requests: { zWin, requests, subCameraDirLocal: camDir } };
}

/**
 * resolveCutResidency — walks from the leaf's own tile up toward (but not
 * including) `baseLevel`, returning the first resident hit, FLATTENED into
 * the leaf's own absolute atlas rect (never a raw ancestor rect + a
 * fallback-depth field for the renderer to apply later — there is no later
 * apply site, so an unflattened rect was silently wrong at every
 * `levelDelta > 0` leaf; see the git history of this function for the bug).
 * `[x, y]`'s low `levelDelta` bits give its position inside the resolved
 * ancestor's `2^levelDelta x 2^levelDelta` block of leaf-level tiles —
 * `x`'s directly (tile columns and atlas-uv `u` both increase east), `y`'s
 * AS-IS too: tile rows count south from the north pole, which is exactly
 * the atlas image's own top-to-bottom order (`TextureAtlas.slotUv`'s origin
 * is a slot's NORTH/top row) — no flip needed, unlike mesh-`v`. At
 * `levelDelta` 0 the block is `1x1` and the leaf's rect is the ancestor's
 * own, unchanged.
 *
 * The walk doesn't stop at the first hit: it resumes one level above it to
 * find a SECOND resident ancestor, strictly shallower than the first — the
 * crossfade's `fallback`, flattened into the leaf's own sub-rect the exact
 * same way. `readyAtMs` is only ever the first (resolved/primary) hit's own
 * timestamp; a shallower fallback's own upload time is irrelevant to when
 * the PRIMARY tile is fading in.
 */
function resolveCutResidency(input: {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly baseLevel: number;
  readonly residentSlot: (tile: SurfaceTileId) => ResidentLookupResult;
}): ResolvedTileResidency | null {
  const { z, x, y, baseLevel, residentSlot } = input;

  const primary = deepestResidentAncestor({ product: 'albedo', z, x, y }, baseLevel, residentSlot);
  if (primary === null) return null;

  const resumeDelta = primary.levelDelta + 1;
  const fallback = deepestResidentAncestor(
    { product: 'albedo', z: z - resumeDelta, x: x >> resumeDelta, y: y >> resumeDelta },
    baseLevel,
    residentSlot,
  );
  return {
    slot: primary.found.slot,
    ...flattenAtlasRect(primary.found, primary.levelDelta, x, y),
    readyAtMs: primary.found.readyAtMs,
    fallback:
      fallback === null
        ? null
        : flattenAtlasRect(fallback.found, resumeDelta + fallback.levelDelta, x, y),
  };
}

/** An ancestor's own atlas rect, narrowed to leaf `(x, y)`'s share of it —
 *  the low `levelDelta` bits of each, in the row order the header derives. */
function flattenAtlasRect(
  found: NonNullable<ResidentLookupResult>,
  levelDelta: number,
  x: number,
  y: number,
): Pick<ResolvedTileResidency, 'atlasUvOrigin' | 'atlasUvScale'> {
  const span = 1 << levelDelta;
  const offsetU = (x - (x >> levelDelta) * span) / span;
  const offsetV = (y - (y >> levelDelta) * span) / span;
  return {
    atlasUvOrigin: [
      found.atlasUvOrigin[0] + offsetU * found.atlasUvScale[0],
      found.atlasUvOrigin[1] + offsetV * found.atlasUvScale[1],
    ],
    atlasUvScale: [found.atlasUvScale[0] / span, found.atlasUvScale[1] / span],
  };
}
