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
import { surfaceTileBandRequestAllowed } from './surfaceTileBandRequestAllowed';
import { equirectUvToDirection } from '../math/equirectUvToDirection';
import { surfacePatchAnchor } from './surfacePatchAnchor';

type ResidentLookupResult = {
  readonly slot: number;
  readonly atlasUvOrigin: readonly [number, number];
  readonly atlasUvScale: readonly [number, number];
  readonly readyAtMs: number;
} | null;

/** Shared by every leaf; `balanceSurfaceCut` rebuilds the ones it coarsens. */
const NO_COARSER_EDGES: SurfaceCutTile['edgeCoarser'] = [0, 0, 0, 0];

/**
 * cutSurfaceTiles — `planEarthTiles`'s walk, superseding it: one quadtree
 * walk, two products. `requests` is what to fetch (every tile in BOTH
 * products), `cut` is what to draw — each leaf's albedo resolved in the same
 * pass via the injected `residentSlot` ancestor-fallback lookup, its height
 * strictly its own (spec §5.2). Two walks re-deriving the same
 * horizon/frustum/refine logic would eventually desync; one walk can't.
 *
 * Height residency gates REFINEMENT, not just drawing, so the height level the
 * cut samples is a function of the cut alone and neighbours stay on nested
 * lattices throughout streaming. Which is why a node's cull is computed by its
 * PARENT (`probe`) and rides the stack: the parent has to know a child's
 * visibility before it can decide.
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
   *  `EARTH_TILE_LOD_BIAS`. */
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
  // Computed before the early return below so a degenerate/underground camera
  // still reports a (best-effort) sub-camera direction rather than none.
  const camDir: Vec3 =
    camLen > 0
      ? [camPosLocalM[0] / camLen, camPosLocalM[1] / camLen, camPosLocalM[2] / camLen]
      : [1, 0, 0];
  // Camera on or inside the surface: no horizon, nothing sensible to plan.
  if (!(camLen > radiusM))
    return { cut: [], requests: { zWin: baseLevel, requests: [], subCameraDirLocal: camDir } };
  // Horizon lies acos(radiusM/d) from the sub-camera point on the sphere —
  // the metres-native form of the old unit-sphere acos(1/d) (radiusM = 1
  // there), so the walk is unit-agnostic rather than assuming a unit sphere.
  const capAngle = Math.acos(radiusM / camLen);
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

    // 1. Horizon
    const centreAngle = Math.acos(
      Math.min(
        1,
        Math.max(-1, centre[0] * camDir[0] + centre[1] * camDir[1] + centre[2] * camDir[2]),
      ),
    );
    if (centreAngle - patchAngle > capAngle) return null;

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
    if (nInFront === 0) return null;
    // A sample past the near plane is dropped before it can corrupt the
    // bbox, but a STRADDLING patch's bbox is still meaningless: the true
    // footprint sweeps toward infinity as a sample nears w=0, so the
    // surviving corners alone can land anywhere, including a false reject
    // that prunes the whole subtree. Trust the bbox only when nothing was
    // dropped; otherwise treat the patch as screen-filling and force it to
    // the deepest level any band offers here.
    const straddlesNearPlane = nInFront < 9;
    if (!straddlesNearPlane && (maxX < -1 || minX > 1 || maxY < -1 || minY > 1)) return null;

    // NDC spans 2 units across the viewport, hence the halving.
    const screenPx = straddlesNearPlane
      ? Math.max(viewportPx[0], viewportPx[1])
      : Math.max(((maxX - minX) / 2) * viewportPx[0], ((maxY - minY) / 2) * viewportPx[1]);
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

  /** Both products of one tile — height rides every albedo request (§6.1),
   *  band-floor ancestors included: refinement needs posts, not pixels. */
  function request(z: number, x: number, y: number, screenPx: number): void {
    requests.push({ tile: { product: 'albedo', z, x, y }, screenPx });
    requests.push({ tile: { product: 'height', z, x, y }, screenPx });
  }

  /** This exact tile's height slot, or null. No ancestor climb, ever: §5.2. */
  function heightSlotOf(z: number, x: number, y: number): number | null {
    return residentSlot({ product: 'height', z, x, y })?.slot ?? null;
  }

  // Explicit stack, not recursion: allocation-free in a per-frame path. Five
  // numbers per node — its id plus `probe`'s two results, unpaid for twice.
  const stack: number[] = [];
  // Hoisted scratch for the four children's probe results.
  const childX = [0, 0, 0, 0];
  const childY = [0, 0, 0, 0];
  const childScreenPx = [0, 0, 0, 0];
  const childRequired = [0, 0, 0, 0];
  const childBakeable = [false, false, false, false];

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
      const childCols = cols * 2;
      const childRows = rows * 2;
      let visibleChildren = 0;
      let heightsReady = true;
      for (let q = 0; q < 4; q++) {
        const cx = x * 2 + (q & 1);
        const cy = y * 2 + (q >> 1);
        const probed = probe(z + 1, cx, cy);
        if (probed === null) continue;
        childX[visibleChildren] = cx;
        childY[visibleChildren] = cy;
        childScreenPx[visibleChildren] = probed.screenPx;
        childRequired[visibleChildren] = probed.required;
        const cu0 = cx / childCols;
        const cv1 = 1 - cy / childRows;
        const bakeable = surfaceTileBandRequestAllowed(
          bands,
          z + 1,
          cu0,
          cu0 + 1 / childCols,
          cv1 - 1 / childRows,
          cv1,
        );
        childBakeable[visibleChildren] = bakeable;
        visibleChildren++;
        // Only a child the walk would actually REQUEST can hold refinement
        // back: one no band bakes at z+1 can never become resident, and
        // waiting on it would freeze every deep band at its own boundary.
        if (bakeable && heightSlotOf(z + 1, cx, cy) === null) heightsReady = false;
      }

      if (heightsReady) {
        // Same band-request gate as the leaf branch: a would-be ancestor no
        // band bakes at this z has no file to fetch either.
        if (surfaceTileBandRequestAllowed(bands, z, u0, u1, v0, v1)) request(z, x, y, screenPx);
        for (let c = 0; c < visibleChildren; c++)
          stack.push(z + 1, childX[c]!, childY[c]!, childScreenPx[c]!, childRequired[c]!);
        continue;
      }

      // Refinement is waiting on height, so this node stays the leaf and its
      // children are fetched instead — ALL of them, not only the ones still
      // missing: a request is also the LRU touch that keeps a sibling's
      // height tile alive, and without it the first to land are evicted while
      // the last is in flight, and refinement never converges.
      for (let c = 0; c < visibleChildren; c++) {
        if (childBakeable[c]) request(z + 1, childX[c]!, childY[c]!, childScreenPx[c]!);
      }
      // Demand, not residency: `zWin` is the subsystem's engage gate, so a cold
      // start that cannot refine must still name the level it is asking for.
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
    if (surfaceTileBandRequestAllowed(bands, z, u0, u1, v0, v1)) request(z, x, y, screenPx);

    // §5.2: a leaf draws from its OWN height tile or not at all. Inheriting an
    // ancestor's posts would make neighbouring patches sample different height
    // levels as tiles arrive, and the cracks would flicker. Covers
    // `z <= baseLevel` too — nothing is atlas-resident there, in either product.
    const heightSlot = heightSlotOf(z, x, y);
    if (heightSlot === null) continue;

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
        heightSlot,
        edgeCoarser: NO_COARSER_EDGES,
      });
    }
  }

  // Largest-on-screen-first: residency walk order and fetch queue pop order.
  requests.sort((a, b) => b.screenPx - a.screenPx);

  return { cut, requests: { zWin, requests, subCameraDirLocal: camDir } };
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
 * The walk doesn't stop at the first hit: it keeps climbing to find a
 * SECOND resident ancestor, strictly shallower than the first — the
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

  let primary: {
    slot: number;
    atlasUvOrigin: readonly [number, number];
    atlasUvScale: readonly [number, number];
    readyAtMs: number;
  } | null = null;

  for (let levelDelta = 0; z - levelDelta > baseLevel; levelDelta++) {
    const ancestorZ = z - levelDelta;
    const ancX = x >> levelDelta;
    const ancY = y >> levelDelta;
    const found = residentSlot({ product: 'albedo', z: ancestorZ, x: ancX, y: ancY });
    if (found === null) continue;
    const span = 1 << levelDelta;
    const offsetU = (x - ancX * span) / span;
    const offsetV = (y - ancY * span) / span;
    const flattened: readonly [readonly [number, number], readonly [number, number]] = [
      [
        found.atlasUvOrigin[0] + offsetU * found.atlasUvScale[0],
        found.atlasUvOrigin[1] + offsetV * found.atlasUvScale[1],
      ],
      [found.atlasUvScale[0] / span, found.atlasUvScale[1] / span],
    ];
    if (primary === null) {
      primary = {
        slot: found.slot,
        atlasUvOrigin: flattened[0],
        atlasUvScale: flattened[1],
        readyAtMs: found.readyAtMs,
      };
      continue;
    }
    return { ...primary, fallback: { atlasUvOrigin: flattened[0], atlasUvScale: flattened[1] } };
  }
  return primary === null ? null : { ...primary, fallback: null };
}
