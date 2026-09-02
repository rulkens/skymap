/**
 * starCatalogLayer — the survey (Gaia bin) stars as additive point sprites in
 * the depthless HDR accumulation, the wide-field twin of `starPointsLayer`.
 *
 * ### The two-stream split (leaf here, aggregate + composite in siblings)
 *
 * The octree cut splits into two visual species with very different GPU cost.
 * LEAF nodes (childless, real point-source stars, ~1.5 px dots) are trivial
 * fill; AGGREGATE nodes (interior flux-mip glows whose radius fills the box
 * footprint × the glow-overlap spread) are the fill-bound bulk of the pass —
 * measured at tens-to-hundreds of full screens of additive overdraw at
 * kpc-scale zoom. So the streams draw into different targets:
 *
 *   - `starCatalogLayer` (this file) draws the LEAF stream at full resolution
 *     into the HDR target, keeping the per-fragment hue-preserving knee. Its
 *     output is unchanged from the single-stream era.
 *   - `starAggregatesLayer` draws the AGGREGATE stream LINEAR into the half-res
 *     `star-aggregates` offscreen (quartering its fragment cost).
 *   - `starAggregateUpsampleLayer` composites that offscreen back into HDR,
 *     applying the knee to the SUMMED aggregate field — which also fixes the
 *     LOD compression asymmetry (a stack of sub-knee aggregate quads now
 *     compresses like a concentrated bright leaf does).
 *
 * All three share ONE per-frame CPU pass — `prepareStarCut` — which runs the
 * octree walk, advances the LOD fades, and PARTITIONS each drawn node into the
 * leaf or aggregate stream by its `childMask` (0 ⇒ leaf). It is memoised on the
 * frame's `ctx` so whichever of the two consuming layers draws first triggers
 * the walk + fade advance exactly once, and the other reads the cache — the
 * walk is the pass's dominant CPU cost and the fade advance MUST tick once per
 * frame (a second dt-step would double-advance the ramps). All three layers
 * gate on the SAME `starCatalogVisible` projection, so the aggregate producer
 * and its upsample consumer can never disagree (the stale-offscreen trap the
 * volume liveness projection also guards against).
 *
 * ### Why NEAR0 + the f64 rebase seam (same trap as `starPointsLayer`)
 *
 * COSMO's near plane (0.01 Mpc) would clip the parsec-scale star anchors, so
 * this row projects through NEAR0 while still accumulating into the HDR target
 * so the stars ride the same tone-map as the galaxies. And like the seeded
 * point anchors, each octree node's box origin is a parsec-scale coordinate
 * near-equal to the NEAR0 view translation during the local-map approach: an
 * f32 subtraction cancels catastrophically and jitters the sprites. So the
 * walk rebases in f64 before narrowing — each box origin re-expressed
 * camera-relative (`computeStarCut` inlines that seam allocation-free, keyed on
 * `ctx.drawCamPos` which equals the NEAR0 view origin; the math mirrors
 * `starNodeOriginRelCamMpc`, still the standalone home `resolveStarRecord`
 * reuses) — and each layer narrows the vp via
 * `narrowMat4(rebaseViewProj(view.slab.vp, camPos))`. The renderer stays a dumb
 * f32 pipeline; the precision seam lives here.
 *
 * ### The shared-vp invariant (load-bearing)
 *
 * The star renderer's camera uniform is ONE shared buffer rewritten on every
 * `draw` call — safe only because every source in a frame receives the
 * IDENTICAL rebased vp. So each layer computes the rebased vp ONCE per frame,
 * before its per-source loop, and hands the same matrix reference to every
 * source's draw. There is deliberately no per-source rebase.
 *
 * ### The crossfade — a recede band to the procedural Milky-Way cloud
 *
 * The near-field star bubble hands off to the procedural Milky-Way point cloud
 * as the camera pulls back to galactic scale (spec §7, ~2→5 kpc). That handoff
 * is a recede-direction `fadeBand` keyed on the camera's heliocentric parsec
 * distance, endpoints carried per-source in the registry row's `crossfadePc`
 * ({ inner, outer }): full inside `inner`, gone past `outer`. The MW impostor's
 * own `milkyWayApproachSun` band fades it in the complementary direction, so the
 * two crossfade across the same kpc window. The band IS the far gate — there is
 * no `FOREGROUND_MAX_DISTANCE_MPC` cut, because the bubble extends well past the
 * ≤25 pc scene stars. V1 accepts a visible density seam (calibration deferred).
 *
 * ### Per-node LOD fades — dissolving the octree-box pop
 *
 * The draw cut (`walkStarOctreeCut`) is a budget-limited best-first walk re-run
 * every frame, so it is VIEW-DEPENDENT: rotating changes which nodes make the
 * cut, and a split/merge transition swaps a parent aggregate for its children
 * instantly. Left alone, every membership change is a hard one-frame pop — the
 * user sees octree boxes flicker in and out while navigating. So the walk keeps
 * a persistent per-node fade (`fadeStateByCatalog`) and ramps each node's opacity
 * 0→1 as it enters the cut and 1→0 as it leaves, holding a leaving node in the
 * draw list until it reaches 0. The per-node draw opacity handed to the renderer
 * is `sourceCrossfade × nodeFade`. A split crossfades exactly (see `NODE_FADE_MS`
 * on why linear conserves flux). A mid-ramp frame must keep the loop ticking so
 * the dissolve finishes; `computeStarCut` surfaces that as the `anyNodeFading`
 * flag on its result rather than firing a wake itself. runFrame runs
 * `prepareStarCut` as a per-frame planner and forwards the flag to
 * `shouldKeepTicking` — the SINGLE authority on must-the-loop-tick. That is the
 * same gate-at-one-place discipline this pass already follows for the DRAW
 * decision via `starCatalogVisible`: the vote is computed here, decided there.
 *
 * ### The walk off-screen prune — and its one fade interaction (REVIEW THIS)
 *
 * `computeStarCut` builds a NEAR0 frustum (`buildCutFrustum`) and hands it to
 * `walkStarOctreeCut`, which prunes off-screen subtrees at their common ancestor
 * — the dominant CPU win (a ~44k-node star-field walk drops to ~12k with the
 * pick-safe slack this ships, roughly halving the walk's wall time; see the
 * walk's header). The prune is COARSE (pick-covering slack) and the renderer's
 * exact per-node cull stays the precise filter, so nothing visible is wrong-
 * dropped. But it CHANGES ONE BEHAVIOUR worth a reviewer's eye: a node that
 * rotates back into the frustum now re-enters the cut as a NEWCOMER (opacity 0)
 * and fades in over `NODE_FADE_MS`, where before the prune it was already in the
 * cut (drawn at opacity 1, merely dropped by the renderer's exact cull) and
 * popped in instantly at the screen edge. So during a pan/rotate the leading edge
 * now shows a ~250 ms fade-in band instead of an instant edge. This is subtle at
 * the near-static perf poses but visible in fast interactive rotation. If it
 * reads as a lag, the fix is to seed frustum-driven newcomers at opacity 1
 * (distinguishing them from LOD-split newcomers, which must still start at 0) —
 * deliberately left out of this change so the prune lands as a pure, measurable
 * optimisation first.
 *
 * ### When it draws (house rule: gate at `enabled`, opacity 0 ⇒ no render)
 *
 * `starCatalogVisible` gates on the `starCatalogRenderer` handle (null
 * pre-bootstrap), the `starCatalogs.enabled` master gate, and at least one
 * loaded catalog whose per-item toggle is on AND whose crossfade opacity is
 * still > 0. An additive pass drawing nothing is correctly invisible, but
 * skipping it wholesale also skips the `beginRenderPass` and the tile-RAM
 * round-trip — so a fully-faded or toggled-off bubble costs zero GPU. It reads
 * the absolute camera (`ctx.drawCamPos`) while `draw` reads NEAR0's
 * origin-relative `view.camPos`; the two coincide because `RENDER_ORIGIN_MPC`
 * is the heliocentric origin.
 *
 * ### Pickable (leaf stars only), and the Sun-exclusion note
 *
 * The Gaia bin IS pickable: `drawPick` stamps every visible LEAF star's packed
 * identity into the NEAR0 r32uint pick pass — via `starCatalogPickRenderer` and
 * the leaf-only, visible-only `starPickLeafDraws` filter — so a hover/click over
 * a resolved star yields a Field-star selection. AGGREGATE glows are never
 * pickable: a flux mip that stands in for a whole subtree has no single star to
 * name. A star's identity is its record index; it is not persisted to disk (the
 * source code is composed at pick time from the pick uniform, never baked into
 * the record), so a tier swap can stale a saved index — accepted, it clears on
 * mismatch. The Sun is excluded from the catalog at build time (it is the
 * origin, drawn by the true-scale `starSpheresLayer`/`starPointsLayer` seed), so
 * the octree carries no record at [0,0,0] to double the local starfield.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SourceType } from '../../../../@types/data/SourceType';
import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import type { SurveyStarCatalogSourceEntry } from '../../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';
import type { StarDrawStream } from '../../../../@types/rendering/StarCatalogRenderer';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { StarCatalogRenderer } from '../../../../@types/rendering/StarCatalogRenderer';
import { NEAR0, slabViewOf } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { frustumPlanesFromViewProj } from '../../../../utils/camera/frustumPlanesFromViewProj';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { DEFAULT_STAR_SIZE_PX } from '../../../../data/defaults';
import {
  walkStarOctreeCut,
  type StarCutFrustum,
} from '../../../gpu/renderers/starCatalog/walkStarOctreeCut';
import { starOctreeIndex } from '../../../gpu/renderers/starCatalog/starOctreeIndex';
import { starPickLeafDraws } from '../../../gpu/renderers/starCatalog/starPickLeafDraws';
import { starExposureRamp } from '../../../gpu/renderers/starCatalog/starExposureRamp';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

// The star octree grid is parsec-based; the scene frame is Mpc. This is the
// inverse of PC_TO_MPC, kept a single source of truth off SCALE_UNITS.
const MPC_TO_PC = 1 / SCALE_UNITS.PC_TO_MPC;

/**
 * The 24-float destination `frustumPlanesFromViewProj` writes each frame — six
 * unit-normalized `(nx, ny, nz, d)` planes. Reused by BOTH `drawStream` and
 * `drawPick` because the star pass is single-threaded and non-reentrant: the
 * same discipline the rebased-vp narrowing already relies on (one shared camera
 * uniform, one rebased matrix per frame). A per-frame `new Float32Array(24)`
 * would allocate on every draw of the hot path this cull exists to make cheaper.
 */
const frustumScratch = new Float32Array(24);

/**
 * Scratch for the WALK's off-screen prune (distinct from `frustumScratch`, which
 * the draw/pick passes reuse later in the same frame). `computeStarCut` derives
 * the NEAR0 rebased vp once per frame, extracts its six clip planes into
 * `cutPlanesMpcScratch` (scene-Mpc units), then rescales the distance term into
 * parsecs in `cutPlanesPcScratch` — the frame the walk's box math already lives
 * in. Reused across frames and per-source within a frame (the frustum is
 * source-independent); the walk reads it synchronously, the same non-reentrant
 * discipline the rest of this pass follows.
 */
const cutPlanesMpcScratch = new Float32Array(24);
const cutPlanesPcScratch = new Float64Array(24);
// Inferred-mutable (no `StarCutFrustum` annotation) so the two margins can be
// rewritten each frame; a mutable object is still assignable to the readonly
// `StarCutFrustum` parameter.
const cutFrustumScratch = {
  planesPc: cutPlanesPcScratch,
  angularMarginRad: 0,
  worldSpread: 1,
};

/**
 * A leaf star's minimum on-screen glow radius, in pixels. It has no shared TS
 * home — keep in sync with `lib/starPhotometry.wesl` STAR_GLOW_MIN_PX (the
 * WESL/TS twin discipline this subsystem uses). Used to size the leaf cull
 * sphere's angular slack; the `STAR_GLOW_MAX_PX` cap is intentionally ignored
 * (this is conservative cull slack, not photometry — over-keeping is free, a
 * false cull would wink a visible star out).
 */
const STAR_GLOW_MIN_PX = 1.5;

/**
 * The pick pass floors every leaf billboard to this clickable pixel radius (a
 * 7 px footprint) so a sub-pixel star stays clickable — keep in sync with
 * `starCatalog/vertex.wesl` STAR_PICK_MIN_RADIUS_PX. The pick cull sphere must
 * cover that inflated footprint, or a node whose dot has left the screen but
 * whose clickable floor still touches the edge would be culled (an unclickable
 * edge star). So the pick margin floors the leaf px radius at this value where
 * the visual margin uses the bare `STAR_GLOW_MIN_PX`.
 */
const STAR_PICK_MIN_RADIUS_PX = 3.5;

/**
 * Derive the per-frame angular cull slack (radians per unit camera distance) for
 * the leaf cull sphere — the `glowMarginAngleRad` the renderers add as
 * `length(center) · margin` (see `StarCatalogDrawArgs.glowMarginAngleRad`). A
 * leaf draws as a fixed-PIXEL dot, so its world footprint grows with distance; a
 * node whose box CENTRE has just crossed a clip plane can still paint on-screen
 * pixels, and the slack keeps it.
 *
 *   - `radiansPerPx = fovYRad / viewportHeightPx` — the angle one vertical
 *     pixel subtends at the LIVE camera FOV, the exact conversion the vertex
 *     stage's pixel-size-to-clip math inverts.
 *   - `leafPxRadius = STAR_GLOW_MIN_PX · (sizePx / STAR_SIZE_REF_PX)` — the dot's
 *     glow radius in pixels, scaled by the user's dot size relative to the
 *     reference size (`DEFAULT_STAR_SIZE_PX`, the WESL STAR_SIZE_REF_PX twin).
 *
 * Two margins because the pick pass inflates every leaf to the 3.5 px clickable
 * floor: `pick` floors `leafPxRadius` at `STAR_PICK_MIN_RADIUS_PX` BEFORE the
 * radians conversion, so `max(a,b)·radiansPerPx` covers the larger of the two
 * footprints. Conservative round-up is fine — this is slack, not photometry.
 *
 * Returns a mutated module-level scratch (read synchronously by the caller before
 * any other call) rather than a fresh object — the same non-reentrant discipline
 * `frustumScratch` and the rebased-vp narrowing already rely on, keeping the
 * per-draw path allocation-free.
 */
const marginScratch = { leaf: 0, pick: 0 };
function starCullMargins(
  sizePx: number,
  viewportHeightPx: number,
  fovYRad: number,
): typeof marginScratch {
  const radiansPerPx = fovYRad / viewportHeightPx;
  const leafPxRadius = STAR_GLOW_MIN_PX * (sizePx / DEFAULT_STAR_SIZE_PX);
  marginScratch.leaf = leafPxRadius * radiansPerPx;
  marginScratch.pick = Math.max(leafPxRadius, STAR_PICK_MIN_RADIUS_PX) * radiansPerPx;
  return marginScratch;
}

/**
 * Build this frame's WALK off-screen-prune frustum from the NEAR0 rebased vp —
 * the exact matrix the star draws clip against, so the coarse prune agrees with
 * what the GPU would keep. Returns the reused `cutFrustumScratch`; its planes are
 * rescaled from scene-Mpc into the parsec frame the walk's box math lives in, and
 * its slack is sized to the WIDEST downstream footprint so the prune can never
 * wrong-drop a node the exact per-node renderer cull would still paint:
 *   - leaves spill an angular amount (fixed-pixel dot), sized to the PICK 3.5px
 *     clickable floor (≥ the visual glow) because the pick pass recomputes the
 *     SAME cut and a clickable edge star must survive — mirrors `starCullMargins`;
 *   - aggregates spread their glow by the dot-size/overlap scale (world slack).
 */
function buildCutFrustum(
  ctx: ReadyFrameContext,
  sizePx: number,
  glowOverlap: number,
): StarCutFrustum | null {
  // No NEAR0 slab resolvable ⇒ no frustum to prune against: fall back to the
  // full (un-pruned) walk. In a real frame `deriveSlabs` always yields NEAR0, so
  // this only trips for hand-built test contexts — the walk stays correct either
  // way, just cheaper when a frustum is available.
  if (ctx.slabs?.[NEAR0] === undefined) return null;
  const near0 = slabViewOf(ctx, NEAR0);
  const rebasedVp = narrowMat4(rebaseViewProj(near0.slab.vp, near0.camPos));
  const planesMpc = frustumPlanesFromViewProj(rebasedVp, cutPlanesMpcScratch);
  // A plane test `n·p_mpc + d ≥ 0` with `p_mpc = p_pc · PC_TO_MPC` divides
  // through by `PC_TO_MPC` to `n·p_pc + d·MPC_TO_PC ≥ 0`: unit normals carry
  // over, only the distance term rescales into parsecs.
  for (let b = 0; b < 24; b += 4) {
    cutPlanesPcScratch[b] = planesMpc[b]!;
    cutPlanesPcScratch[b + 1] = planesMpc[b + 1]!;
    cutPlanesPcScratch[b + 2] = planesMpc[b + 2]!;
    cutPlanesPcScratch[b + 3] = planesMpc[b + 3]! * MPC_TO_PC;
  }
  const sizeScale = sizePx / DEFAULT_STAR_SIZE_PX;
  const radiansPerPx = ctx.fovYRad / ctx.canvasSize.height;
  const leafPxRadius = STAR_GLOW_MIN_PX * sizeScale;
  cutFrustumScratch.angularMarginRad =
    Math.max(leafPxRadius, STAR_PICK_MIN_RADIUS_PX) * radiansPerPx;
  cutFrustumScratch.worldSpread = Math.max(1, sizeScale * glowOverlap);
  return cutFrustumScratch;
}

/**
 * Milliseconds for a node's LOD fade to travel the full 0→1 (or 1→0). Linear
 * ramp: complementary linear fades conserve total glow flux EXACTLY across a
 * split/merge, because a record's integrated screen luminance is linear in its
 * opacity, and an aggregate's flux equals the summed flux of the children that
 * replace it — so `parentFlux·(1−t) + childrenFlux·t = F` for all t. An eased
 * ramp would momentarily under- or over-count. 250 ms is quick enough to feel
 * instant while still killing the single-frame box-pop.
 */
const NODE_FADE_MS = 250;

/**
 * A catalog's per-node LOD-fade state, persisted across frames. The best-first
 * cut (`walkStarOctreeCut`) is view-dependent — rotating the camera or crossing
 * a split/merge threshold changes which nodes are in the cut — so every
 * membership change would be a hard one-frame pop without this. Each frame:
 * nodes newly in the cut enter at opacity 0 heading to 1; nodes that left the
 * cut stay in the draw list heading to 0, and are dropped once they reach 0.
 *
 * ── Flat typed arrays + frame stamps, not a `Map<number, NodeFade>` ─────────
 *
 * At star-field zoom the cut is ~46k nodes EVERY frame. The old shape kept a
 * `Map<nodeIndex, { opacity, seen }>`, so each frame paid: a hash lookup +
 * `.set` of a fresh `{opacity,seen}` heap object per NEWCOMER, and a full
 * `for..of` iteration over the whole Map (its entries are scattered heap objects,
 * cache-miss-bound) to advance + prune. Replacing it with arrays indexed BY the
 * node index turns every access into a contiguous typed-array read — no hashing,
 * no per-entry heap object, no Map iteration order. The arrays are sized to
 * `catalog.nodes.length` and allocated ONCE per catalog (≈7.5 MB on the large
 * tier — load-time scale, not per-frame), so steady-state frames allocate zero.
 *
 * ── The two-stamp scheme (replaces Map membership) ─────────────────────────
 *
 * The Map answered two membership questions implicitly (is a node in the cut?
 * still fading and worth advancing?). Two monotonic per-node frame stamps answer
 * them without a set:
 *   - `inCutFrame[idx] === frame` ⇒ this node is in THIS frame's walk cut
 *     (target 1); otherwise it is leaving (target 0). Set in pass 1.
 *   - `activeFrame[idx] === frame` ⇒ this node was processed onto THIS frame's
 *     active list (still ≥ 0 opacity, drawn in some stream). Used both to detect
 *     a NEWCOMER (`activeFrame[idx] !== frame - 1` — it was not active last frame,
 *     so seed its opacity at 0) and, via `activeList`, to walk the *previous*
 *     frame's active set without scanning all N nodes.
 * `frame` is the catalog's own monotonic counter, `++`ed at the top of each
 * advance, so it starts at 1 and stamp 0 (the Uint32Array zero-fill) is never a
 * live stamp — a fresh catalog's zero-filled stamps can never false-match.
 *
 * `activeList` / `prevActiveList` are a DOUBLE BUFFER: each frame reads the
 * previous frame's active indices out of `prevActiveList` (to advance the nodes
 * that left the cut toward 0) while rebuilding this frame's set into `activeList`,
 * then swaps the two references. Rebuilding in place while reading would corrupt
 * the read, and scanning all N nodes to find the fading ones would defeat the
 * point — the active set is the cut plus a bounded tail of leaving nodes, far
 * smaller than N. The active list can never exceed N (each node appears once), so
 * it is sized to N and never grows.
 *
 * Keyed by the CATALOG object, not the source code, for two free properties:
 *   1. Test + tier-swap isolation — a replaced catalog (tier change) is a new
 *      object, so it starts with fresh fade state and the old arrays are GC'd via
 *      the WeakMap; a stale node index can never index into the wrong catalog.
 *   2. It is still per-SOURCE in practice — the renderer holds exactly one
 *      catalog per source (`loadedCatalogs` yields one each), so per-catalog IS
 *      per-source, with none of the manual invalidation source-keying needs.
 *
 * `clockMs` is the catalog's own last-drawn frame time, so `dt` is derived
 * without a shared module clock (every catalog is drawn on the same frame, so a
 * per-catalog clock yields the identical dt a global one would). `null` on the
 * first frame a catalog is seen, which snaps every node straight to its target
 * (dt = Infinity ⇒ step = 1): the star bubble's first paint is its steady state,
 * and only later membership CHANGES animate — the same first-frame rule
 * `foregroundLabelsLayer` uses.
 */
type StarFadeState = {
  /** Per-node current LOD opacity; meaningful only while the node is active. */
  opacity: Float32Array;
  /** Frame stamp: node was in THIS frame's walk cut (target 1). Set in pass 1. */
  inCutFrame: Uint32Array;
  /** Frame stamp: node was appended to THIS frame's active list (drawn ≥ 0). */
  activeFrame: Uint32Array;
  /** This frame's active node indices, filled `[0, activeCount)`; sized to N. */
  activeList: Int32Array;
  /** The PREVIOUS frame's active node indices, `[0, prevActiveCount)`. */
  prevActiveList: Int32Array;
  /** Number of nodes appended to `prevActiveList` (last frame's active count). */
  prevActiveCount: number;
  /** The catalog's own last-drawn frame time; `null` snaps the first frame. */
  clockMs: number | null;
  /** Monotonic per-catalog counter; `++`ed each advance, so stamp 0 is never live. */
  frame: number;
};
const fadeStateByCatalog = new WeakMap<StarCatalog, StarFadeState>();

function fadeStateFor(catalog: StarCatalog): StarFadeState {
  let state = fadeStateByCatalog.get(catalog);
  if (state === undefined) {
    const n = catalog.nodes.length;
    // The active list can never exceed N (each node is appended at most once per
    // frame), so N is a hard upper bound and the buffers never grow. `max(1, n)`
    // keeps a degenerate empty catalog from allocating a zero-length buffer.
    const cap = Math.max(1, n);
    state = {
      opacity: new Float32Array(n),
      inCutFrame: new Uint32Array(n),
      activeFrame: new Uint32Array(n),
      activeList: new Int32Array(cap),
      prevActiveList: new Int32Array(cap),
      prevActiveCount: 0,
      clockMs: null,
      frame: 0,
    };
    fadeStateByCatalog.set(catalog, state);
  }
  return state;
}

/**
 * A source's recede-direction crossfade opacity at the camera's heliocentric
 * parsec distance: full (1) inside `inner`, gone (0) past `outer`. `fadeBand`
 * reads the direction from the edge ordering — `inner < outer` is a recede
 * fade (full at the low edge).
 */
function crossfadeOpacity(entry: SurveyStarCatalogSourceEntry, camDistPc: number): number {
  return fadeBand({ fullAt: entry.crossfadePc.inner, goneAt: entry.crossfadePc.outer }, camDistPc);
}

/**
 * The shared visibility gate for all three star layers (leaf, aggregate,
 * upsample). Enabled if the renderer exists, the master toggle is on, and ANY
 * loaded catalog is toggled on and still inside its crossfade band. All three
 * layers delegate their `enabled` here so the aggregate producer and its
 * upsample consumer never disagree — the same shared-projection discipline the
 * volume liveness gate uses.
 */
export function starCatalogVisible(state: EngineState, ctx: ReadyFrameContext): boolean {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return false;
  if (!state.settings.starCatalogs.enabled) return false;

  const camDistPc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]) * MPC_TO_PC;

  for (const { source } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    // Only a SURVEY catalog can be in `loadedCatalogs` (a seeded one ships no
    // bin), so the `binBaseName` half of the guard is a narrowing device rather
    // than a live filter — it buys the crossfade band this layer draws by.
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;
    if (!state.settings.starCatalogs.items[entry.id].enabled) continue;
    if (crossfadeOpacity(entry, camDistPc) > 0) return true;
  }
  return false;
}

/**
 * One draw stream's per-source node data, as REUSED grow-only flat typed arrays.
 * The leaf stream carries only childless (real-star) nodes with `isAggregate`
 * all 0; the aggregate stream only interior flux-mip nodes with `isAggregate`
 * all 1. Each layer assembles `StarCatalogDrawArgs` from one of these plus the
 * per-frame shared scalars.
 *
 * ── Flat typed arrays, not arrays-of-objects (the allocation fix) ───────────
 *
 * At star-field zoom the cut draws tens of thousands of nodes EVERY frame. The
 * old shape allocated a `{ nodeIndex, firstRecord, recordCount }` object, a
 * `Vec3` origin, and pushed onto six growing JS arrays PER node — ~5 short-lived
 * objects per drawn node, a measured 10-12 ms/frame of GC churn during
 * navigation. This mirrors the trick `walkStarOctreeCut`'s own snapshot already
 * uses: `count` valid entries indexed into module-persistent typed arrays that
 * GROW BY DOUBLING but never shrink or reallocate steady-state. The scalar
 * fields index `[i]`; the origin packs THREE f32 per node, indexed `[3*i + k]`.
 *
 * ── Reused across frames, INVALIDATED by the next `computeStarCut` (non-reentrant) ─
 *
 * These arrays PERSIST per catalog (see `streamsByCatalog`) and are `reset` +
 * refilled each frame rather than reallocated. So a `PreparedStarCut` is a VIEW
 * over them, invalidated by the next `computeStarCut` call — the same contract
 * `walkStarOctreeCut`'s snapshot already carries. It is safe because the leaf and
 * aggregate layers both consume within the SAME frame's `ctx` (memoised, so the
 * walk runs once and both read one cached result before the next frame recomputes),
 * and the pick path recomputes on its own fresh `ctx` AFTER the visual frame drew.
 * Leaf and aggregate are SEPARATE stream objects, so both coexist for the whole
 * frame; a consumer that must hold two frames' data at once copies out first.
 */
export type StarNodeStream = {
  /** Number of valid drawn nodes — read only `[0, count)` of every array below. */
  count: number;
  /** Per-node `catalog.nodes` slot (parallel; used by `starPickLeafDraws` + debug). */
  nodeIndex: Int32Array;
  /** Per-node record-slice base (`node.firstRecord`). */
  firstRecord: Uint32Array;
  /** Per-node instance count (leaf → N stars; aggregate → 1). */
  recordCount: Uint32Array;
  /** Per-node box origin, camera-relative Mpc — THREE f32 per node (`[3*i + k]`). */
  originRelCamMpc: Float32Array;
  /** Per-node box edge in Mpc (the in-cell offset unit = /1024). */
  cellScaleMpc: Float32Array;
  /** Per-node leaf-vs-aggregate flag: 0 = leaf, 1 = aggregate. */
  isAggregate: Uint8Array;
  /** Per-node flux-reconstruction multiplier (1 for a leaf; subtree count for an aggregate). */
  subtreeStarCount: Float32Array;
  /** Per-node draw opacity (source crossfade × node LOD fade). */
  opacity: Float32Array;
};

/** One source's partitioned cut: the leaf stream and the aggregate stream. */
export type PreparedStarSource = {
  source: SourceType;
  leaf: StarNodeStream;
  aggregate: StarNodeStream;
};

/**
 * The per-frame star cut, shared by the leaf / aggregate / upsample layers. The
 * per-source partitioned streams plus the source-independent shader scalars
 * (base dot size, exposure-ramped brightness trim, aggregate glow spread,
 * aggregate peak ceiling) — each computed once and forwarded identically to
 * every source's draw.
 *
 * `anyNodeFading` is the render-on-demand wake VOTE, surfaced as data rather
 * than fired here: true while any node's LOD ramp is mid-flight this frame, so
 * the loop must schedule another frame to finish the dissolve. It is read by
 * `shouldKeepTicking` (via runFrame's planner step) — the single authority on
 * must-the-loop-tick, the same gate-at-one-place discipline `starCatalogVisible`
 * already follows for the draw decision. See the module header.
 */
export type PreparedStarCut = {
  sources: PreparedStarSource[];
  sizePx: number;
  brightness: number;
  glowOverlap: number;
  aggregateIntensityCap: number;
  anyNodeFading: boolean;
};

/** A fresh stream with backing arrays at `cap` node capacity (grown as needed). */
function createStream(cap: number): StarNodeStream {
  return {
    count: 0,
    nodeIndex: new Int32Array(cap),
    firstRecord: new Uint32Array(cap),
    recordCount: new Uint32Array(cap),
    originRelCamMpc: new Float32Array(cap * 3),
    cellScaleMpc: new Float32Array(cap),
    isAggregate: new Uint8Array(cap),
    subtreeStarCount: new Float32Array(cap),
    opacity: new Float32Array(cap),
  };
}

/** Reset a stream for a new frame — keep the backing arrays, drop the contents. */
function resetStream(stream: StarNodeStream): void {
  stream.count = 0;
}

/**
 * Grow every backing array of `stream` to at least `min` node capacity by
 * DOUBLING (allocate new, copy live contents, swap) — the same grow-only trick
 * `walkStarOctreeCut`'s `growCut` uses. Called only when a push hits capacity, so
 * steady-state frames never reallocate.
 */
function growStream(stream: StarNodeStream, min: number): void {
  let cap = stream.nodeIndex.length;
  while (cap < min) cap *= 2;
  const nodeIndex = new Int32Array(cap);
  nodeIndex.set(stream.nodeIndex);
  stream.nodeIndex = nodeIndex;
  const firstRecord = new Uint32Array(cap);
  firstRecord.set(stream.firstRecord);
  stream.firstRecord = firstRecord;
  const recordCount = new Uint32Array(cap);
  recordCount.set(stream.recordCount);
  stream.recordCount = recordCount;
  const originRelCamMpc = new Float32Array(cap * 3);
  originRelCamMpc.set(stream.originRelCamMpc);
  stream.originRelCamMpc = originRelCamMpc;
  const cellScaleMpc = new Float32Array(cap);
  cellScaleMpc.set(stream.cellScaleMpc);
  stream.cellScaleMpc = cellScaleMpc;
  const isAggregate = new Uint8Array(cap);
  isAggregate.set(stream.isAggregate);
  stream.isAggregate = isAggregate;
  const subtreeStarCount = new Float32Array(cap);
  subtreeStarCount.set(stream.subtreeStarCount);
  stream.subtreeStarCount = subtreeStarCount;
  const opacity = new Float32Array(cap);
  opacity.set(stream.opacity);
  stream.opacity = opacity;
}

/** Append one drawn node to `stream`, growing the backing arrays if full. */
function pushStreamNode(
  stream: StarNodeStream,
  nodeIndex: number,
  firstRecord: number,
  recordCount: number,
  ox: number,
  oy: number,
  oz: number,
  cellScaleMpc: number,
  isAggregate: number,
  subtreeStarCount: number,
  opacity: number,
): void {
  const i = stream.count;
  if (i >= stream.nodeIndex.length) growStream(stream, i + 1);
  stream.nodeIndex[i] = nodeIndex;
  stream.firstRecord[i] = firstRecord;
  stream.recordCount[i] = recordCount;
  const o = i * 3;
  stream.originRelCamMpc[o] = ox;
  stream.originRelCamMpc[o + 1] = oy;
  stream.originRelCamMpc[o + 2] = oz;
  stream.cellScaleMpc[i] = cellScaleMpc;
  stream.isAggregate[i] = isAggregate;
  stream.subtreeStarCount[i] = subtreeStarCount;
  stream.opacity[i] = opacity;
  stream.count = i + 1;
}

/**
 * The two draw streams (leaf + aggregate) PERSIST per catalog across frames and
 * are reset+refilled each frame — never freshly allocated. Keyed by the CATALOG
 * object exactly like `fadeStateByCatalog`, for the same two free properties: a
 * replaced catalog (tier swap) is a new object, so it starts with fresh streams
 * and the old pair is GC'd with the WeakMap; and per-catalog IS per-source since
 * the renderer holds one catalog per source. The pair is what makes a
 * `PreparedStarCut` a reused view — see `StarNodeStream`'s non-reentrancy note.
 */
type CatalogStreams = { leaf: StarNodeStream; aggregate: StarNodeStream };
const streamsByCatalog = new WeakMap<StarCatalog, CatalogStreams>();

function streamsFor(catalog: StarCatalog): CatalogStreams {
  let streams = streamsByCatalog.get(catalog);
  if (streams === undefined) {
    streams = { leaf: createStream(1024), aggregate: createStream(1024) };
    streamsByCatalog.set(catalog, streams);
  }
  return streams;
}

/**
 * Per-frame memo: `prepareStarCut` runs the walk + fade advance exactly once
 * per frame even though both the aggregate and leaf layers call it. Keyed on
 * the frame's `ctx` object — `deriveFrameContext` mints a fresh one each frame —
 * so a new frame recomputes and the previous entry is GC'd with its `ctx`. The
 * fade advance mutating `fadeStateByCatalog` is what makes the once-per-frame
 * guarantee load-bearing: a second dt-step would double-advance the ramps.
 */
const preparedByCtx = new WeakMap<ReadyFrameContext, PreparedStarCut | null>();

/**
 * Walk every loaded catalog's octree, advance its per-node LOD fades, and
 * PARTITION the resulting cut into a leaf stream (childless real-star nodes)
 * and an aggregate stream (interior flux-mip nodes) by `childMask`. Returns the
 * per-source streams plus the shared shader scalars and the `anyNodeFading`
 * wake vote, or `null` when the star pass is not live (no renderer, master
 * off). Memoised on `ctx` (see `preparedByCtx`); the fade advance runs on the
 * first call for a frame only. The wake vote is DATA on the result — runFrame
 * forwards it to `shouldKeepTicking`, the single authority (see module header).
 */
export function prepareStarCut(state: EngineState, ctx: ReadyFrameContext): PreparedStarCut | null {
  if (preparedByCtx.has(ctx)) return preparedByCtx.get(ctx)!;

  const result = computeStarCut(state, ctx);
  preparedByCtx.set(ctx, result);
  return result;
}

function computeStarCut(state: EngineState, ctx: ReadyFrameContext): PreparedStarCut | null {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return null;
  if (!state.settings.starCatalogs.enabled) return null;

  // The camera-relative parsec position the walk keys off, and the heliocentric
  // distance the crossfade + exposure ramp read. `ctx.drawCamPos` equals the
  // NEAR0 view origin (RENDER_ORIGIN_MPC is the heliocentric origin), so the
  // walk is a pure function of (state, ctx) — no SlabView needed here.
  const camPos: Vec3 = [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]];
  const camPosPc: Vec3 = [camPos[0] * MPC_TO_PC, camPos[1] * MPC_TO_PC, camPos[2] * MPC_TO_PC];
  const camDistPc = Math.hypot(camPosPc[0], camPosPc[1], camPosPc[2]);

  const nowMs = ctx.nowMs;
  const sizePx = state.settings.starCatalogs.sizePx;

  // Scale-dependent DISPLAY exposure rides on `brightness`: `starExposureRamp`
  // lifts the whole starfield from its near-field baseline (1x) toward the
  // whole-galaxy anchor as the camera pulls back — the perceptual fix for a
  // monitor that can't dark-adapt. It reuses the SAME `camDistPc` the crossfade
  // keyed off (converted to Mpc). The user slider stays a PURE trim on top.
  const brightness =
    state.settings.starCatalogs.brightness *
    starExposureRamp(
      camDistPc * SCALE_UNITS.PC_TO_MPC,
      state.settings.starCatalogs.exposureNearX,
      state.settings.starCatalogs.exposureMidX,
      state.settings.starCatalogs.exposureFarX,
    );

  const refineThreshold = state.settings.starCatalogs.refineThreshold;
  const glowOverlap = state.settings.starCatalogs.glowOverlap;
  const aggregateIntensityCap = state.settings.starCatalogs.aggregateIntensityCap;

  // This frame's off-screen prune frustum — source-independent, built once from
  // the NEAR0 rebased vp and handed to every source's walk. See `buildCutFrustum`
  // and `walkStarOctreeCut`'s header for why pruning off-screen subtrees at their
  // common ancestor is the dominant CPU win.
  const cutFrustum = buildCutFrustum(ctx, sizePx, glowOverlap);

  const sources: PreparedStarSource[] = [];
  // Tracks whether ANY node is mid-fade across ALL sources this frame. Surfaced
  // on the returned `PreparedStarCut` as the render-on-demand wake vote — the
  // wake decision itself lives in `shouldKeepTicking`, not here (see the
  // module header). One flag per frame.
  let anyNodeFading = false;

  for (const { source, catalog } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    // See `starCatalogVisible`: a loaded catalog is always a SURVEY row; the
    // null check narrows to the variant carrying `drawBudget` / `crossfadePc`.
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;
    if (!state.settings.starCatalogs.items[entry.id].enabled) continue;

    const sourceCrossfade = crossfadeOpacity(entry, camDistPc);
    if (sourceCrossfade <= 0) continue; // faded out — additive draw of nothing

    const cut = walkStarOctreeCut(catalog, camPosPc, entry.drawBudget, refineThreshold, cutFrustum);

    // The load-time index: the walk's box geometry + scalar node fields, plus
    // the `childMask` leaf-vs-aggregate discriminant and the flux-glow subtree
    // counts — all flat typed arrays, memoised per catalog. The partition loop
    // below reads ONLY these arrays and the fade state's arrays; it touches NO
    // `catalog.nodes[idx]` object and calls no morton decode (both were per-node
    // cache-miss + arithmetic costs the walk already paid at load time). Note
    // `boxOriginPc[idx*3]` was baked as exactly `gridOrigin + mortonDecode3 ·
    // (cellEdgePc · 2^level)` in f64 — the identical expression the layer used to
    // inline per frame — so the camera-relative origins are bit-identical.
    const { boxOriginPc, boxEdgePc, firstRecord, recordCount, childMask, subtreeCounts } =
      starOctreeIndex(catalog);

    // ── Advance this catalog's per-node LOD fades ──────────────────────────
    const fadeState = fadeStateFor(catalog);
    const dtMs =
      fadeState.clockMs === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, nowMs - fadeState.clockMs);
    fadeState.clockMs = nowMs;
    const step = Math.min(1, dtMs / NODE_FADE_MS);
    // This frame's stamp (see `StarFadeState`): `inCutFrame[idx] === frame` ⇒ in
    // the cut (target 1); a monotonic counter starting at 1, so the zero-filled
    // stamps of a fresh catalog never false-match.
    const frame = ++fadeState.frame;
    const { opacity, inCutFrame, activeFrame } = fadeState;
    const prevActiveList = fadeState.prevActiveList;
    const prevActiveCount = fadeState.prevActiveCount;
    const activeList = fadeState.activeList;
    const nodeCount = catalog.nodes.length;

    // Reuse this catalog's persistent stream pair (reset, then refilled) rather
    // than allocating fresh arrays — the allocation fix. Both streams coexist for
    // the whole frame (leaf into HDR, aggregate into the half-res offscreen).
    const { leaf, aggregate } = streamsFor(catalog);
    resetStream(leaf);
    resetStream(aggregate);

    // The node-origin precision seam, inlined ALLOCATION-FREE. `boxOriginPc` was
    // baked in f64 (see `starOctreeIndex`); the large-minus-large camera
    // subtraction stays in f64 (JS number) and narrows to f32 only on the array
    // write in `pushStreamNode`, so a node origin near-equal to the NEAR0 view
    // origin keeps every significant bit the f32 upload needs. This is exactly
    // `starNodeOriginRelCamMpc`'s math, kept in lockstep with it and
    // `resolveStarRecord`.
    const pcToMpc = SCALE_UNITS.PC_TO_MPC;

    // Advance one node's fade toward `target`, then (if still visible) append it
    // to the active list and PARTITION it into the leaf or aggregate stream by
    // its `childMask` (0 ⇒ leaf, records are real stars; !== 0 ⇒ aggregate, a
    // subtree collapsed to its flux mip) — NOT its level: a fat leaf sits at
    // level > 0 yet is a leaf. A fading-out node draws BEYOND the walk's budget
    // for a few frames; that overdraw is bounded by cut churn and accepted rather
    // than capped (capping would reintroduce the box-pop the fade exists to
    // remove). `activeCount` is a closure-captured cursor into `activeList`.
    let activeCount = 0;
    const advanceNode = (idx: number, target: number): void => {
      let op = opacity[idx]!;
      if (op < target) op = Math.min(target, op + step);
      else if (op > target) op = Math.max(target, op - step);
      opacity[idx] = op;
      if (op !== target) anyNodeFading = true;

      // Fully faded out: drop it (draws in neither stream, not re-listed).
      if (target === 0 && op <= 0) return;
      // A node index outlives its catalog only across a tier swap, which hands a
      // fresh catalog object (and fade state) — belt-and-braces against a stale
      // index; the index arrays are parallel to `catalog.nodes`, so this bound is
      // equivalent to the old `catalog.nodes[idx] === undefined` guard.
      if (idx >= nodeCount) return;

      activeFrame[idx] = frame;
      activeList[activeCount++] = idx;

      const isAgg = childMask[idx] !== 0;
      const stream = isAgg ? aggregate : leaf;
      const o3 = idx * 3;
      const ox = boxOriginPc[o3]! * pcToMpc - camPos[0];
      const oy = boxOriginPc[o3 + 1]! * pcToMpc - camPos[1];
      const oz = boxOriginPc[o3 + 2]! * pcToMpc - camPos[2];
      const cellScaleMpc = boxEdgePc[idx]! * pcToMpc;

      pushStreamNode(
        stream,
        idx,
        firstRecord[idx]!,
        recordCount[idx]!,
        ox,
        oy,
        oz,
        cellScaleMpc,
        isAgg ? 1 : 0,
        // Flux-reconstruction multiplier: a leaf record is one real star (1); an
        // aggregate record stands in for its whole subtree (its star count).
        isAgg ? subtreeCounts[idx]! : 1,
        sourceCrossfade * op,
      );
    };

    // Pass 1 — stamp this frame's cut and seed newcomers. The cut is a reused
    // SoA snapshot (invalidated by the next walk), so its indices are consumed
    // here before the next source walks.
    for (let i = 0; i < cut.count; i++) {
      const idx = cut.nodeIndex[i]!;
      inCutFrame[idx] = frame;
      // A NEWCOMER (not active last frame) enters at opacity 0. Reading the stamp
      // replaces the old Map's "is this key present?" membership test.
      if (activeFrame[idx] !== frame - 1) opacity[idx] = 0;
    }

    // Pass 2 — advance + partition the UNION of (this frame's cut) and (the
    // previous frame's active list). The cut nodes head to 1; a previously-active
    // node not in this cut heads to 0 (and is dropped once it reaches 0). The cut
    // is a covering partition (unique nodes), and the `inCutFrame` check excludes
    // cut members from the prev-list loop, so each active node is visited exactly
    // once.
    for (let i = 0; i < cut.count; i++) advanceNode(cut.nodeIndex[i]!, 1);
    for (let j = 0; j < prevActiveCount; j++) {
      const idx = prevActiveList[j]!;
      if (inCutFrame[idx] !== frame) advanceNode(idx, 0);
    }

    // Swap the double buffer: this frame's active list becomes next frame's
    // `prevActiveList`; the old prev buffer is recycled as next frame's scratch.
    fadeState.prevActiveList = activeList;
    fadeState.activeList = prevActiveList;
    fadeState.prevActiveCount = activeCount;

    sources.push({ source, leaf, aggregate });
  }

  return { sources, sizePx, brightness, glowOverlap, aggregateIntensityCap, anyNodeFading };
}

/**
 * Draw one stream of a prepared cut into the open pass: compute the rebased vp
 * once (the shared-vp invariant) and issue one `renderer.draw` per source that
 * has nodes in the stream. Shared by the leaf and aggregate layers — the only
 * difference is which `StarDrawStream` (and which per-source sub-stream) each
 * selects.
 */
function drawStream(
  renderer: StarCatalogRenderer,
  pass: GPURenderPassEncoder,
  view: SlabView,
  prep: PreparedStarCut,
  stream: StarDrawStream,
  fovYRad: number,
  viewSlot: number,
): void {
  const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
  // Extract the six clip planes ONCE from the SAME rebased vp the draws use — the
  // exact matrix the GPU clips against, which is what makes the cull visually
  // lossless — and derive the leaf angular slack once. Both are source-independent
  // and forwarded identically to every source's draw (the shared-vp invariant).
  const frustumPlanes = frustumPlanesFromViewProj(rebasedVp, frustumScratch);
  const glowMarginAngleRad = starCullMargins(prep.sizePx, view.viewportPx[1], fovYRad).leaf;
  // The aggregate stream's knee normally lands in `star-upsample`, over the
  // summed half-res field. A sky-cubemap capture face (`viewSlot !== 0`) has
  // no such pass behind it — the face IS the sky the lens samples — so the
  // aggregate quads carry the knee themselves there, or captured glows read
  // brighter and more saturated than the same stars in the direct view drawn
  // beside them at the band crossfade.
  const knee = stream === 'leaf' || viewSlot !== 0;
  for (const s of prep.sources) {
    const nodes = s[stream];
    if (nodes.count === 0) continue;
    renderer.draw(pass, {
      source: s.source,
      stream,
      knee,
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      drawCount: nodes.count,
      firstRecord: nodes.firstRecord,
      recordCount: nodes.recordCount,
      originRelCamMpc: nodes.originRelCamMpc,
      cellScaleMpc: nodes.cellScaleMpc,
      isAggregate: nodes.isAggregate,
      subtreeStarCount: nodes.subtreeStarCount,
      opacity: nodes.opacity,
      sizePx: prep.sizePx,
      brightness: prep.brightness,
      glowOverlap: prep.glowOverlap,
      aggregateIntensityCap: prep.aggregateIntensityCap,
      frustumPlanes,
      glowMarginAngleRad,
      viewSlot,
    });
  }
}

export { drawStream };

export const starCatalogLayer: ContentLayer = {
  name: 'star-catalog',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',
  // Sky-cubemap capture roster (Task 13b): the survey LEAF stream is part of
  // the black-hole lens's captured "sky".
  skyCapture: true,

  enabled: starCatalogVisible,

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return;
    const prep = prepareStarCut(state, ctx);
    if (prep === null) return;
    // The LEAF stream: full-resolution point stars into HDR, per-glow knee.
    drawStream(renderer, pass, view, prep, 'leaf', ctx.fovYRad, ctx.viewSlot);
  },

  // Pick aspect — stamps every visible LEAF star's packed identity into the
  // NEAR0 r32uint pick pass. The pick pass runs on a FRESH `ctx` minted by
  // `pickFrameContext` (→ `deriveFrameContext` from `lastPose.current`, the pose
  // the last frame actually rendered), so `prepareStarCut`'s per-`ctx` memo
  // (`preparedByCtx`) MISSES and recomputes the leaf cut here — a second octree
  // walk, but against that same last-rendered camera, so the pick lands exactly
  // where the sprite drew. The alternative — threading the visual frame's cached
  // cut into the pick path — would braid pick into frame ordering (the pick pass
  // could only run if a visual frame had cached first); recomputing keeps the
  // pick a pure function of the last-rendered pose. The cost is one extra
  // traversal on a PICKED frame, which is acceptable because picks are
  // event-driven, not per-frame. The recompute also re-advances the per-node LOD
  // fades, but that stays monotonic — the fade `clockMs` clamps `dt ≥ 0`, so the
  // second walk can only nudge a ramp forward, never rewind it. Aggregates and
  // opacity-0 leaves are filtered out by `starPickLeafDraws` (leaf-only,
  // visible-only): an aggregate glow names no single star, and an invisible
  // newcomer / fully-faded leaf must not claim the cursor.
  //
  // The rebased vp is computed ONCE before the per-source loop — the same
  // shared-vp discipline `drawStream` follows (every source in a frame receives
  // the identical `narrowMat4(rebaseViewProj(...))` matrix; the pick renderer's
  // camera uniform is one shared buffer, safe only under that invariant).
  //
  // This row self-binds its own @group(0) pick camera inside the renderer's
  // `draw`, like the Milky-Way pick: on NEAR0 there is no shared point-pick
  // prefix to inherit or restore (that contract is a COSMO-pass fact). Visibility
  // is NOT re-checked here — the pick program filters by `enabled`
  // (`starCatalogVisible`, the foreground-distance + crossfade gate) against the
  // pick-time camera, the SAME gate the draw program runs, so a cosmic-zoom
  // frame never reaches this draw and `pick:near0` is not even allocated for it.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.starCatalogPickRenderer;
    if (pickRenderer === null) return;
    const prep = prepareStarCut(state, ctx);
    if (prep === null) return;

    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
    // Same once-per-draw plane extraction as `drawStream`, off the identical
    // rebased vp — the pick cull must agree with the visual cull so a picked and
    // a drawn star always partition the frustum the same way. The margin uses the
    // PICK branch: every leaf is floored to the 3.5 px clickable footprint, so the
    // cull sphere must cover that inflated dot (a false cull here = an unclickable
    // edge star, forbidden), which the visual 1.5 px slack would undercover.
    const frustumPlanes = frustumPlanesFromViewProj(rebasedVp, frustumScratch);
    const glowMarginAngleRad = starCullMargins(prep.sizePx, view.viewportPx[1], ctx.fovYRad).pick;
    for (const d of starPickLeafDraws(prep)) {
      pickRenderer.draw(pass, {
        source: d.source,
        vp: rebasedVp,
        viewportPx: view.viewportPx,
        drawCount: d.drawCount,
        firstRecord: d.firstRecord,
        recordCount: d.recordCount,
        originRelCamMpc: d.originRelCamMpc,
        cellScaleMpc: d.cellScaleMpc,
        sizePx: prep.sizePx,
        frustumPlanes,
        glowMarginAngleRad,
      });
    }
  },
};
