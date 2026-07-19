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
 * walk rebases in f64 before narrowing — the node origins via
 * `starNodeOriginRelCamMpc` (each box origin re-expressed camera-relative,
 * keyed on `ctx.drawCamPos` which equals the NEAR0 view origin) — and each
 * layer narrows the vp via `narrowMat4(rebaseViewProj(view.slab.vp, camPos))`.
 * The renderer stays a dumb f32 pipeline; the precision seam lives here.
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
 * own `milkyWayApproach` band fades it in the complementary direction, so the
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
 * on why linear conserves flux). Mid-ramp frames wake the loop below.
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
import type { StarCatalogSourceEntry } from '../../../../@types/data/starCatalog/StarCatalogSourceEntry';
import type { StarDrawStream } from '../../../../@types/rendering/StarCatalogRenderer';
import type { StarNodeDraw } from '../../../gpu/renderers/starCatalog/walkStarOctreeCut';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { SlabView } from '../../../../@types/engine/frame/SlabView';
import type { StarCatalogRenderer } from '../../../../@types/rendering/StarCatalogRenderer';
import { NEAR0 } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { walkStarOctreeCut } from '../../../gpu/renderers/starCatalog/walkStarOctreeCut';
import { starPickLeafDraws } from '../../../gpu/renderers/starCatalog/starPickLeafDraws';
import { starNodeOriginRelCamMpc } from '../../../gpu/renderers/starCatalog/starNodeOriginRelCamMpc';
import { starExposureRamp } from '../../../gpu/renderers/starCatalog/starExposureRamp';
import { subtreeStarCounts } from '../../../gpu/renderers/starCatalog/subtreeStarCounts';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

// The star octree grid is parsec-based; the scene frame is Mpc. This is the
// inverse of PC_TO_MPC, kept a single source of truth off SCALE_UNITS.
const MPC_TO_PC = 1 / SCALE_UNITS.PC_TO_MPC;

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

/** One octree node's temporal LOD-fade state: current opacity + where it heads. */
type NodeFade = { opacity: number; target: number };

/**
 * A catalog's per-node LOD-fade state, persisted across frames. The best-first
 * cut (`walkStarOctreeCut`) is view-dependent — rotating the camera or crossing
 * a split/merge threshold changes which nodes are in the cut — so every
 * membership change would be a hard one-frame pop without this. Each frame:
 * nodes newly in the cut enter at opacity 0 heading to 1; nodes that left the
 * cut stay in the draw list heading to 0, and are dropped once they reach 0.
 *
 * Keyed by the CATALOG object, not the source code, for two free properties:
 *   1. Test + tier-swap isolation — a replaced catalog (tier change) is a new
 *      object, so it starts with fresh fade state and the old map is GC'd via
 *      the WeakMap; a stale node index can never index into the wrong catalog.
 *   2. It is still per-SOURCE in practice — the renderer holds exactly one
 *      catalog per source (`loadedCatalogs` yields one each), so per-catalog IS
 *      per-source, with none of the manual invalidation source-keying needs.
 *
 * `clockMs` is the catalog's own last-drawn frame time, so `dt` is derived
 * without a shared module clock (every catalog is drawn on the same frame, so a
 * per-catalog clock yields the identical dt a global one would). `null` on the
 * first frame a catalog is seen, which snaps every node straight to its target:
 * the star bubble's first paint is its steady state, and only later membership
 * CHANGES animate — the same first-frame rule `foregroundLabelsLayer` uses.
 */
type StarFadeState = { fades: Map<number, NodeFade>; clockMs: number | null };
const fadeStateByCatalog = new WeakMap<StarCatalog, StarFadeState>();

function fadeStateFor(catalog: StarCatalog): StarFadeState {
  let state = fadeStateByCatalog.get(catalog);
  if (state === undefined) {
    state = { fades: new Map(), clockMs: null };
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
function crossfadeOpacity(entry: StarCatalogSourceEntry, camDistPc: number): number {
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
    if (entry.type !== 'starCatalog') continue;
    if (!state.settings.starCatalogs.items[entry.id].enabled) continue;
    if (crossfadeOpacity(entry, camDistPc) > 0) return true;
  }
  return false;
}

/**
 * One draw stream's per-source node arrays, parallel to `nodeDraws`. The leaf
 * stream carries only childless (real-star) nodes with `isAggregate` all 0; the
 * aggregate stream only interior flux-mip nodes with `isAggregate` all 1. Each
 * layer assembles `StarCatalogDrawArgs` from one of these plus the per-frame
 * shared scalars.
 */
export type StarNodeStream = {
  nodeDraws: StarNodeDraw[];
  originRelCamMpc: Vec3[];
  cellScaleMpc: number[];
  isAggregate: number[];
  subtreeStarCount: number[];
  opacity: number[];
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
 */
export type PreparedStarCut = {
  sources: PreparedStarSource[];
  sizePx: number;
  brightness: number;
  glowOverlap: number;
  aggregateIntensityCap: number;
};

function emptyStream(): StarNodeStream {
  return {
    nodeDraws: [],
    originRelCamMpc: [],
    cellScaleMpc: [],
    isAggregate: [],
    subtreeStarCount: [],
    opacity: [],
  };
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
 * per-source streams plus the shared shader scalars, or `null` when the star
 * pass is not live (no renderer, master off). Memoised on `ctx` (see
 * `preparedByCtx`); the fade advance and the render-on-demand wake fire on the
 * first call for a frame only.
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

  const sources: PreparedStarSource[] = [];
  // Tracks whether ANY node is mid-fade across ALL sources this frame, to keep
  // the render-on-demand loop ticking. One flag per frame — a single request
  // wakes the whole loop.
  let anyNodeFading = false;

  for (const { source, catalog } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    if (entry.type !== 'starCatalog') continue;
    if (!state.settings.starCatalogs.items[entry.id].enabled) continue;

    const sourceCrossfade = crossfadeOpacity(entry, camDistPc);
    if (sourceCrossfade <= 0) continue; // faded out — additive draw of nothing

    const cut = walkStarOctreeCut(catalog, camPosPc, entry.drawBudget, refineThreshold);

    // ── Advance this catalog's per-node LOD fades ──────────────────────────
    const fadeState = fadeStateFor(catalog);
    const dtMs =
      fadeState.clockMs === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, nowMs - fadeState.clockMs);
    fadeState.clockMs = nowMs;
    const step = Math.min(1, dtMs / NODE_FADE_MS);
    const fades = fadeState.fades;

    // Retarget: nodes in the cut head to full (seeding newcomers at 0), nodes
    // that left the cut head to 0. The cut is a reused SoA snapshot (invalidated
    // by the next walk), so its indices are copied here before the next source.
    const inCut = new Set<number>();
    for (let i = 0; i < cut.count; i++) {
      const nodeIndex = cut.nodeIndex[i]!;
      inCut.add(nodeIndex);
      const f = fades.get(nodeIndex);
      if (f === undefined) fades.set(nodeIndex, { opacity: 0, target: 1 });
      else f.target = 1;
    }
    for (const [idx, f] of fades) if (!inCut.has(idx)) f.target = 0;

    const counts = subtreeStarCounts(catalog);

    // Advance + prune + PARTITION in ONE pass over the fade map. A node routes
    // to the leaf or aggregate stream by its `childMask` (0 ⇒ leaf, records are
    // real stars; !== 0 ⇒ aggregate, a subtree collapsed to its flux mip) —
    // NOT its level: a fat leaf sits at level > 0 yet is a leaf. A fading-out
    // node draws BEYOND the walk's budget for a few frames; that overdraw is
    // bounded by cut churn and accepted rather than capped (capping would
    // reintroduce the box-pop the fade exists to remove).
    const leaf = emptyStream();
    const aggregate = emptyStream();
    for (const [idx, f] of fades) {
      if (f.opacity < f.target) f.opacity = Math.min(f.target, f.opacity + step);
      else if (f.opacity > f.target) f.opacity = Math.max(f.target, f.opacity - step);
      if (f.opacity !== f.target) anyNodeFading = true;

      // Fully faded out: drop it from the map (and it draws in neither stream).
      if (f.opacity <= 0 && f.target === 0) {
        fades.delete(idx);
        continue;
      }

      // A node index outlives its catalog only across a tier swap, which hands
      // a fresh catalog object (and fade state) — so this is belt-and-braces
      // against a stale index; drop it rather than deref undefined.
      const node = catalog.nodes[idx];
      if (node === undefined) {
        fades.delete(idx);
        continue;
      }

      const isAgg = node.childMask !== 0;
      const stream = isAgg ? aggregate : leaf;
      const seam = starNodeOriginRelCamMpc(catalog, node, camPos);
      stream.nodeDraws.push({
        nodeIndex: idx,
        firstRecord: node.firstRecord,
        recordCount: node.recordCount,
      });
      stream.originRelCamMpc.push(seam.originRelCamMpc);
      stream.cellScaleMpc.push(seam.cellScaleMpc);
      stream.isAggregate.push(isAgg ? 1 : 0);
      // Flux-reconstruction multiplier: a leaf record is one real star (1); an
      // aggregate record stands in for its whole subtree (its star count).
      stream.subtreeStarCount.push(isAgg ? counts[idx]! : 1);
      stream.opacity.push(sourceCrossfade * f.opacity);
    }

    sources.push({ source, leaf, aggregate });
  }

  if (anyNodeFading) state.subsystems.scheduler.requestRender();

  return { sources, sizePx, brightness, glowOverlap, aggregateIntensityCap };
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
): void {
  const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, view.camPos));
  for (const s of prep.sources) {
    const nodes = s[stream];
    if (nodes.nodeDraws.length === 0) continue;
    renderer.draw(pass, {
      source: s.source,
      stream,
      vp: rebasedVp,
      viewportPx: view.viewportPx,
      nodeDraws: nodes.nodeDraws,
      originRelCamMpc: nodes.originRelCamMpc,
      cellScaleMpc: nodes.cellScaleMpc,
      isAggregate: nodes.isAggregate,
      subtreeStarCount: nodes.subtreeStarCount,
      opacity: nodes.opacity,
      sizePx: prep.sizePx,
      brightness: prep.brightness,
      glowOverlap: prep.glowOverlap,
      aggregateIntensityCap: prep.aggregateIntensityCap,
    });
  }
}

export { drawStream };

export const starCatalogLayer: ContentLayer = {
  name: 'star-catalog',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled: starCatalogVisible,

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.starCatalogRenderer;
    if (renderer === null) return;
    const prep = prepareStarCut(state, ctx);
    if (prep === null) return;
    // The LEAF stream: full-resolution point stars into HDR, per-glow knee.
    drawStream(renderer, pass, view, prep, 'leaf');
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
    for (const d of starPickLeafDraws(prep)) {
      pickRenderer.draw(pass, {
        source: d.source,
        vp: rebasedVp,
        viewportPx: view.viewportPx,
        nodeDraws: d.nodeDraws,
        originRelCamMpc: d.originRelCamMpc,
        cellScaleMpc: d.cellScaleMpc,
        sizePx: prep.sizePx,
      });
    }
  },
};
