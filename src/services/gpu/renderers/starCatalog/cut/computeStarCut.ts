import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarSource } from '../../../../../@types/rendering/PreparedStarSource';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { NEAR0, slabViewOf } from '../../../../engine/frame/slabs';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { NODE_FADE_MS } from '../../../../../data/starNodeFade';
import { walkStarOctreeCut } from '../../../../../utils/star/walkStarOctreeCut';
import { starOctreeIndex } from '../../../../../utils/star/starOctreeIndex';
import { starExposureRamp } from '../../../../../utils/star/starExposureRamp';
import { starCrossfadeOpacity } from '../../../../../utils/star/starCrossfadeOpacity';
import { buildStarCutFrustum } from '../../../../../utils/star/buildStarCutFrustum';
import { SOURCE_REGISTRY } from '../../../../../data/sources';
import { SCALE_UNITS } from '../../../../../data/scaleUnits';
import { fadeStateFor } from './starFadeState';
import { streamsFor } from './starCatalogStreams';
import { pushStarNode } from './starNodeStream';

/**
 * Walk every loaded catalog's octree and PARTITION the resulting cut into a
 * leaf stream (childless real-star nodes) and an aggregate stream (interior
 * flux-mip nodes) by `childMask`, reading each node's CURRENT LOD-fade opacity
 * — pure over the fade state when `advanceFades` is false, and the ONLY place
 * that advances a ramp when `advanceFades` is true (see `prepareStarCut` /
 * `advanceStarFades`, its two callers). `null` when the star pass is not live
 * (no renderer, master off).
 *
 * ### Why NEAR0 + the f64 rebase seam (same trap as `starPointsPass`)
 *
 * COSMO's near plane (0.01 Mpc) would clip the parsec-scale star anchors, so
 * this walk projects through NEAR0. Each octree node's box origin is a
 * parsec-scale coordinate near-equal to the NEAR0 view translation during the
 * local-map approach: an f32 subtraction cancels catastrophically and jitters
 * the sprites. So the walk rebases in f64 before narrowing — each box origin
 * re-expressed camera-relative (inlined below, allocation-free, keyed on
 * `ctx.drawCamPos` which equals the NEAR0 view origin; the math mirrors
 * `starNodeOriginRelCamMpc`, still the standalone home `resolveStarRecord`
 * reuses) — and the off-screen-prune frustum narrows the SAME
 * `rebaseViewProj(near0.slab.vp, near0.camPos)` via `buildStarCutFrustum`. When
 * no NEAR0 slab is resolvable (a hand-built test context; a real frame always
 * has one) the frustum is `null` and the walk falls back to its full,
 * un-pruned form — still correct, just costlier.
 *
 * ### Per-node LOD fades — dissolving the octree-box pop
 *
 * The draw cut (`walkStarOctreeCut`) is a budget-limited best-first walk re-run
 * every frame, so it is VIEW-DEPENDENT: rotating changes which nodes make the
 * cut, and a split/merge transition swaps a parent aggregate for its children
 * instantly. Left alone, every membership change is a hard one-frame pop — the
 * user sees octree boxes flicker in and out while navigating. So the walk keeps
 * a persistent per-node fade (`starFadeState`) and ramps each node's opacity
 * 0→1 as it enters the cut and 1→0 as it leaves, holding a leaving node in the
 * draw list until it reaches 0. The per-node draw opacity handed to the renderer
 * is `sourceCrossfade × nodeFade`. `anyNodeFading` on the result is the
 * render-on-demand wake vote (see `runFrame`'s `shouldKeepTicking`) — this
 * function only surfaces the flag, never fires a wake itself.
 *
 * A sky-cubemap capture face (`ctx.viewSlot !== 0`) shares no temporal state
 * with the main view's fade: every one of its cut nodes draws at opacity 1
 * (the capture branch below), and `anyNodeFading` is left untouched.
 */
export function computeStarCut(
  state: PassState,
  ctx: ReadyFrameContext,
  advanceFades: boolean,
): PreparedStarCut | null {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return null;
  if (!state.settings.starCatalogs.enabled) return null;

  // The camera-relative parsec position the walk keys off, and the heliocentric
  // distance the crossfade + exposure ramp read. `ctx.drawCamPos` equals the
  // NEAR0 view origin (RENDER_ORIGIN_MPC is the heliocentric origin), so the
  // walk is a pure function of (state, ctx) — no SlabView needed here.
  const camPos: Vec3 = [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]];
  const camPosPc: Vec3 = [
    camPos[0] * SCALE_UNITS.MPC_TO_PC,
    camPos[1] * SCALE_UNITS.MPC_TO_PC,
    camPos[2] * SCALE_UNITS.MPC_TO_PC,
  ];
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
  // the NEAR0 rebased vp and handed to every source's walk. `slabs?.[NEAR0]`
  // absent only for a hand-built test ctx; see `buildStarCutFrustum`'s header.
  // `canvasHeightPx` stays unread by `ctx.canvasSize` unless a NEAR0 slab
  // resolved — a hand-built test ctx may carry no `canvasSize` at all, and
  // `buildStarCutFrustum` never touches the value when `rebasedVp` is null.
  let rebasedVp: Float32Array | null = null;
  let canvasHeightPx = 0;
  if (ctx.slabs?.[NEAR0] !== undefined) {
    const near0 = slabViewOf(ctx, NEAR0);
    rebasedVp = narrowMat4(rebaseViewProj(near0.slab.vp, near0.camPos));
    canvasHeightPx = ctx.canvasSize.height;
  }
  const cutFrustum = buildStarCutFrustum(
    rebasedVp,
    ctx.fovYRad,
    canvasHeightPx,
    sizePx,
    glowOverlap,
  );

  const sources: PreparedStarSource[] = [];
  // Tracks whether ANY node is mid-fade across ALL sources this frame. Surfaced
  // on the returned `PreparedStarCut` as the render-on-demand wake vote — the
  // wake decision itself lives in `shouldKeepTicking`, not here. One flag per
  // frame.
  let anyNodeFading = false;

  for (const { source, catalog } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    // See `starCatalogVisible`: a loaded catalog is always a SURVEY row; the
    // null check narrows to the variant carrying `drawBudget` / `crossfadePc`.
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;
    if (!state.settings.starCatalogs.items[entry.id].enabled) continue;

    const sourceCrossfade = starCrossfadeOpacity(entry.crossfadePc, camDistPc);
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

    // Reuse this catalog's persistent stream pair (reset, then refilled) rather
    // than allocating fresh arrays — the allocation fix. Both streams coexist for
    // the whole frame (leaf into HDR, aggregate into the half-res offscreen).
    const { leaf, aggregate } = streamsFor(catalog, ctx.viewSlot);
    leaf.count = 0;
    aggregate.count = 0;

    // The node-origin precision seam, inlined ALLOCATION-FREE. `boxOriginPc` was
    // baked in f64 (see `starOctreeIndex`); the large-minus-large camera
    // subtraction stays in f64 (JS number) and narrows to f32 only on the array
    // write in `pushStarNode`, so a node origin near-equal to the NEAR0 view
    // origin keeps every significant bit the f32 upload needs. This is exactly
    // `starNodeOriginRelCamMpc`'s math, kept in lockstep with it and
    // `resolveStarRecord`.
    const pcToMpc = SCALE_UNITS.PC_TO_MPC;

    // Emit one drawn node into its leaf/aggregate stream at draw opacity
    // `sourceCrossfade × op`, PARTITIONED by `childMask` (0 ⇒ leaf, records are
    // real stars; !== 0 ⇒ aggregate) — NOT by level: a fat leaf sits at level > 0
    // yet is a leaf. Shared by the main view's fade-advanced push (`advanceNode`
    // below) and the capture branch's opacity-1 push, so the two never duplicate
    // the origin/cell-scale derivation.
    const emitNode = (idx: number, op: number): void => {
      const isAgg = childMask[idx] !== 0;
      const stream = isAgg ? aggregate : leaf;
      const o3 = idx * 3;
      const ox = boxOriginPc[o3]! * pcToMpc - camPos[0];
      const oy = boxOriginPc[o3 + 1]! * pcToMpc - camPos[1];
      const oz = boxOriginPc[o3 + 2]! * pcToMpc - camPos[2];
      const cellScaleMpc = boxEdgePc[idx]! * pcToMpc;

      pushStarNode(
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

    // A capture view (a sky-cubemap face, `viewSlot !== 0`) renders one static
    // frame with no temporal continuity to protect, so it must not read or write
    // the main view's per-node fade state — that state is keyed per CATALOG (see
    // `StarFadeState`), not per ctx, and up to six face contexts run before the
    // main view each real frame. Every cut node draws at full opacity instead of
    // entering as a fade-from-0 NEWCOMER; `anyNodeFading` is left untouched (a
    // capture never votes to keep the loop ticking).
    if (ctx.viewSlot !== 0) {
      for (let i = 0; i < cut.count; i++) emitNode(cut.nodeIndex[i]!, 1);
      sources.push({ source, leaf, aggregate });
      continue;
    }

    const fadeState = fadeStateFor(catalog);

    if (!advanceFades) {
      // Read-only partition: emit each cut node at whatever opacity the
      // frame's ONE `advanceStarFades` call left it at (0 for a node it has
      // never seen — a NEWCOMER only becomes visible once that call reaches
      // it). No mutation here, so the pick path's fresh post-frame ctx can
      // recompute the cut without perturbing the ramps.
      const { opacity } = fadeState;
      for (let i = 0; i < cut.count; i++) {
        const idx = cut.nodeIndex[i]!;
        emitNode(idx, opacity[idx]!);
      }
      sources.push({ source, leaf, aggregate });
      continue;
    }

    // ── Advance this catalog's per-node LOD fades ──────────────────────────
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

    // Advance one node's fade toward `target`, then (if still visible) append it
    // to the active list and emit it. A fading-out node draws BEYOND the walk's
    // budget for a few frames; that overdraw is bounded by cut churn and accepted
    // rather than capped (capping would reintroduce the box-pop the fade exists
    // to remove). `activeCount` is a closure-captured cursor into `activeList`.
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

      emitNode(idx, op);
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
