import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../../../@types/engine/frame/ReadyFrameContext';
import type { PreparedStarSource } from '../../../../../@types/rendering/PreparedStarSource';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { NEAR0 } from '../../../../engine/frame/slabs';
import { rebaseViewProj } from '../../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../../utils/math/narrowMat4';
import { NODE_FADE_MS } from '../../../../../data/starNodeFade';
import { walkStarOctreeCut } from '../../../../../utils/star/walkStarOctreeCut';
import { starOctreeIndex } from '../../../../../utils/star/starOctreeIndex';
import { starExposureRamp } from '../../../../../utils/star/starExposureRamp';
import { starSourceDrawOpacity } from '../../../../../utils/star/starSourceDrawOpacity';
import { buildStarCutFrustum } from '../../../../../utils/star/buildStarCutFrustum';
import { SOURCE_REGISTRY } from '../../../../../data/sources';
import { SCALE_UNITS } from '../../../../../data/scaleUnits';
import { fadeStateFor } from './starFadeState';
import { streamsFor } from './starCatalogStreams';
import { pushStarNode } from './starNodeStream';

/**
 * Runs long by design: this is the sole owner of the NEAR0/f64-rebase
 * catastrophic-cancellation landmine (see below).
 *
 * Walk every loaded catalog's octree and partition the cut into a leaf
 * stream (real-star nodes) and an aggregate stream (flux-mip nodes), reading
 * each node's current LOD-fade opacity — pure when `advanceFades` is false,
 * and the only place that advances the fade ramp when true (see
 * `readStarCut` / `advanceStarCut`, its two callers). `null` when the
 * star pass is not live (no renderer, master off).
 *
 * NEAR0 + the f64 rebase seam (catastrophic cancellation, same trap
 * `starPointsPass` documents): COSMO's near plane (0.01 Mpc) would clip the
 * parsec-scale star anchors, so this walk projects through NEAR0. An octree
 * node's box origin is a parsec-scale coordinate near-equal to the NEAR0 view
 * translation during the local-map approach — subtracting them in f32 first
 * cancels catastrophically and the sprite jitters onto a coarse grid. So the
 * camera subtraction stays in f64 (JS number) below and narrows to f32 only
 * on the array write in `pushStarNode`; this mirrors `starNodeOriginRelCamMpc`
 * (the standalone home `resolveStarRecord` reuses), kept in lockstep with it.
 * The off-screen-prune frustum narrows the SAME rebased vp via
 * `buildStarCutFrustum` — one per view of `views`, all rebased about THIS
 * cut's origin, so the walk runs once over the union of the rig's frusta; with
 * no NEAR0 slab resolvable (a hand-built test context) the frustum is `null`
 * and the walk falls back to its full, un-pruned form.
 *
 * Per-node LOD fades (see `starFadeState` for the bookkeeping, the two-stamp
 * scheme, the double buffer, and why the ramp is linear) dissolve the cut's
 * view-dependent pop as nodes enter/leave the walk's budget-limited
 * best-first result. `anyNodeFading` on the result is the render-on-demand
 * wake vote (`runFrame`'s `shouldKeepTicking`) — this function only surfaces
 * the flag, never fires a wake itself.
 *
 * A sky-cubemap capture face (`ctx.viewKind === 'capture'`) shares no temporal
 * state with the main view's fade: every one of its cut nodes draws at opacity
 * 1, and `anyNodeFading` is left untouched.
 */
export function computeStarCut(
  state: PassState,
  ctx: ReadyFrameContext,
  views: readonly ReadyFrameContext[],
  advanceFades: boolean,
): PreparedStarCut | null {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return null;
  if (!state.settings.starCatalogs.enabled) return null;

  // `ctx.drawCamPos` equals the NEAR0 view origin.
  const camPos: Vec3 = [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]];
  const camPosPc: Vec3 = [
    camPos[0] * SCALE_UNITS.MPC_TO_PC,
    camPos[1] * SCALE_UNITS.MPC_TO_PC,
    camPos[2] * SCALE_UNITS.MPC_TO_PC,
  ];
  const camDistPc = Math.hypot(camPosPc[0], camPosPc[1], camPosPc[2]);

  const nowMs = ctx.nowMs;
  const sizePx = state.settings.starCatalogs.sizePx;

  // DISPLAY exposure (see `starExposureRamp`), on the same `camDistPc` the
  // crossfade below reads.
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

  // This frame's off-screen prune frustum, source-independent (see the
  // header): one plane set per view, each rebased about THIS cut's origin
  // rather than the view's own eye, so every view prunes in the frame the
  // walk's boxes live in. `slabs?.[NEAR0]` is absent only for a hand-built
  // test ctx — then there is nothing to prune against at all.
  const rebasedVps: Float32Array[] = [];
  // The widest view drives the angular slack (see `buildStarCutFrustum`).
  let canvasHeightPx = 1;
  let fovYRad = 0;
  if (views.every((view) => view.slabs?.[NEAR0] !== undefined)) {
    for (const view of views) {
      rebasedVps.push(narrowMat4(rebaseViewProj(view.slabs[NEAR0]!.vp, camPos)));
      if (view.fovYRad / view.canvasSize.height > fovYRad / canvasHeightPx) {
        fovYRad = view.fovYRad;
        canvasHeightPx = view.canvasSize.height;
      }
    }
  }
  const cutFrustum = buildStarCutFrustum(rebasedVps, fovYRad, canvasHeightPx, sizePx, glowOverlap);

  const sources: PreparedStarSource[] = [];
  // Render-on-demand wake vote across all sources this frame (see the header).
  let anyNodeFading = false;

  for (const { source, catalog } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    const sourceCrossfade = starSourceDrawOpacity(entry, state.settings.starCatalogs, camDistPc);
    if (sourceCrossfade <= 0) continue; // faded out — additive draw of nothing
    // Re-narrows to the variant carrying `drawBudget`; the compiler, not a
    // second copy of the gate, keeps this in step with the predicate above.
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;

    const cut = walkStarOctreeCut(catalog, camPosPc, entry.drawBudget, refineThreshold, cutFrustum);

    // The load-time index (`starOctreeIndex`): box geometry, `childMask`
    // (leaf-vs-aggregate), and subtree flux-glow counts as flat typed arrays.
    const { boxOriginPc, boxEdgePc, firstRecord, recordCount, childMask, subtreeCounts } =
      starOctreeIndex(catalog);

    // Reuse this catalog's persistent stream pair rather than allocating
    // fresh arrays every frame (see `starNodeStream`).
    const { leaf, aggregate } = streamsFor(catalog, ctx.viewSlot);
    leaf.count = 0;
    aggregate.count = 0;

    // f64 the whole way (see the header's rebase seam); only `pushStarNode`'s
    // array write narrows to f32.
    const pcToMpc = SCALE_UNITS.PC_TO_MPC;

    // Partitioned by `childMask`, NOT by level: a fat leaf sits at level > 0
    // yet is a leaf.
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
        firstRecord[idx]!,
        recordCount[idx]!,
        ox,
        oy,
        oz,
        cellScaleMpc,
        isAgg ? 1 : 0,
        // Flux-reconstruction multiplier: a leaf record is one real star (1);
        // an aggregate record stands in for its whole subtree (its star count).
        isAgg ? subtreeCounts[idx]! : 1,
        sourceCrossfade * op,
      );
    };

    // A capture view shares no temporal state with the main view's fade (see
    // the header).
    if (ctx.viewKind === 'capture') {
      for (let i = 0; i < cut.count; i++) emitNode(cut.nodeIndex[i]!, 1);
      sources.push({ source, leaf, aggregate });
      continue;
    }

    const fadeState = fadeStateFor(catalog);

    if (!advanceFades) {
      // Read-only: emits at whatever opacity `advanceStarCut` left this
      // frame's ONE call at, so the pick path's fresh post-frame ctx can
      // recompute the cut without perturbing the ramps.
      const { opacity } = fadeState;
      for (let i = 0; i < cut.count; i++) {
        const idx = cut.nodeIndex[i]!;
        emitNode(idx, opacity[idx]!);
      }
      sources.push({ source, leaf, aggregate });
      continue;
    }

    const dtMs =
      fadeState.clockMs === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, nowMs - fadeState.clockMs);
    fadeState.clockMs = nowMs;
    const step = Math.min(1, dtMs / NODE_FADE_MS);
    // This frame's stamp (see `StarFadeState`'s two-stamp scheme).
    const frame = ++fadeState.frame;
    const { opacity, inCutFrame, activeFrame } = fadeState;
    const prevActiveList = fadeState.prevActiveList;
    const prevActiveCount = fadeState.prevActiveCount;
    const activeList = fadeState.activeList;
    const nodeCount = catalog.nodes.length;

    // A fading-out node draws beyond the walk's budget for a few frames;
    // that overdraw is bounded by cut churn and accepted rather than capped
    // (capping would reintroduce the box-pop the fade exists to remove).
    let activeCount = 0;
    const advanceNode = (idx: number, target: number): void => {
      let op = opacity[idx]!;
      if (op < target) op = Math.min(target, op + step);
      else if (op > target) op = Math.max(target, op - step);
      opacity[idx] = op;
      if (op !== target) anyNodeFading = true;

      // Fully faded out: drop it (draws in neither stream, not re-listed).
      if (target === 0 && op <= 0) return;
      // Belt-and-braces: a node index outlives its catalog only across a
      // tier swap, which hands a fresh catalog object.
      if (idx >= nodeCount) return;

      activeFrame[idx] = frame;
      activeList[activeCount++] = idx;

      emitNode(idx, op);
    };

    // Pass 1 — stamp this frame's cut and seed newcomers (the cut snapshot is
    // reused/invalidated by the next walk, so read it before the next source).
    for (let i = 0; i < cut.count; i++) {
      const idx = cut.nodeIndex[i]!;
      inCutFrame[idx] = frame;
      // A NEWCOMER (not active last frame) enters at opacity 0.
      if (activeFrame[idx] !== frame - 1) opacity[idx] = 0;
    }

    // Pass 2 — cut nodes head to opacity 1; a previously-active node outside
    // this cut heads to 0 (`inCutFrame` excludes cut members from the loop
    // below, so each active node is visited exactly once).
    for (let i = 0; i < cut.count; i++) advanceNode(cut.nodeIndex[i]!, 1);
    for (let j = 0; j < prevActiveCount; j++) {
      const idx = prevActiveList[j]!;
      if (inCutFrame[idx] !== frame) advanceNode(idx, 0);
    }

    // Swap the double buffer (see `starFadeState`).
    fadeState.prevActiveList = activeList;
    fadeState.activeList = prevActiveList;
    fadeState.prevActiveCount = activeCount;

    sources.push({ source, leaf, aggregate });
  }

  return {
    sources,
    originMpc: camPos,
    sizePx,
    brightness,
    glowOverlap,
    aggregateIntensityCap,
    anyNodeFading,
  };
}
