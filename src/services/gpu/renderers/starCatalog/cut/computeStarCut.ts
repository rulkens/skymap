import type { Vec3 } from '../../../../../@types/math/Vec3';
import type { PassState } from '../../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../../@types/engine/frame/FrameView';
import type { PreparedStarSource } from '../../../../../@types/rendering/PreparedStarSource';
import type { PreparedStarCut } from '../../../../../@types/rendering/PreparedStarCut';
import { walkStarOctreeCut } from '../../../../../utils/star/walkStarOctreeCut';
import { starOctreeIndex } from '../../../../../utils/star/starOctreeIndex';
import { starExposureRamp } from '../../../../../utils/star/starExposureRamp';
import { starSourceDrawOpacity } from '../../../../../utils/star/starSourceDrawOpacity';
import { SOURCE_REGISTRY } from '../../../../../data/sources';
import { SCALE_UNITS } from '../../../../../data/scaleUnits';
import { frameStarCutFrustum } from './frameStarCutFrustum';
import { fadeStateFor } from './starFadeState';
import { streamsFor } from './starCatalogStreams';
import { pushStarNode } from './starNodeStream';

/**
 * Runs long by design: this is the sole owner of the NEAR0/f64-rebase
 * catastrophic-cancellation landmine (see below).
 *
 * PURE: partition every loaded catalog's drawn set into a leaf stream
 * (real-star nodes) and an aggregate stream (flux-mip nodes), at each node's
 * current LOD-fade opacity — never touching a ramp or a stamp, so the pick
 * path's fresh post-frame ctx can recompute freely. `null` when the star pass
 * is not live (no renderer, master off).
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
 * The capture face's own walk prunes against the SAME rebased vps, via
 * `frameStarCutFrustum` — all rebased about THIS cut's origin.
 *
 * Per-node LOD fades (see `starFadeState` for the bookkeeping, the two-stamp
 * scheme, the double buffer, and why the ramp is linear; `advanceStarFades` is
 * their one writer) dissolve the cut's view-dependent pop as nodes enter/leave
 * the walk's budget-limited best-first result. A real frame view therefore
 * draws the active list that advance left, with no walk of its own.
 *
 * A sky-cubemap capture face (`view.viewKind === 'capture'`) shares no temporal
 * state with the main view's fade: it walks fresh and every cut node draws at
 * opacity 1.
 *
 * `views[0]` is the anchor: its eye becomes `originMpc`, its `viewSlot` picks
 * the CPU stream pair, its `viewKind` decides the capture path. `views` is the
 * frusta to union for that capture walk's off-screen prune. Both callers pass
 * the same list for both — a lone view anchors itself; `runFrame`'s call
 * anchors on its canvas view.
 */
export function computeStarCut(
  state: PassState,
  views: readonly FrameView[],
): PreparedStarCut | null {
  const renderer = state.gpu.starCatalogRenderer;
  if (renderer === null) return null;
  if (!state.settings.starCatalogs.enabled) return null;

  const view = views[0]!;
  // `view.drawCamPos` equals the NEAR0 view origin.
  const camPos: Vec3 = [view.drawCamPos[0], view.drawCamPos[1], view.drawCamPos[2]];
  const camPosPc: Vec3 = [
    camPos[0] * SCALE_UNITS.MPC_TO_PC,
    camPos[1] * SCALE_UNITS.MPC_TO_PC,
    camPos[2] * SCALE_UNITS.MPC_TO_PC,
  ];
  const camDistPc = Math.hypot(camPosPc[0], camPosPc[1], camPosPc[2]);

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

  const glowOverlap = state.settings.starCatalogs.glowOverlap;
  const aggregateIntensityCap = state.settings.starCatalogs.aggregateIntensityCap;

  // Only the capture path walks, so only it needs a prune frustum — built once
  // here rather than per source, which it is independent of.
  const isCapture = view.viewKind === 'capture';
  const cutFrustum = isCapture ? frameStarCutFrustum(views, camPos, sizePx, glowOverlap) : null;

  const sources: PreparedStarSource[] = [];

  for (const { source, catalog } of renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    const sourceCrossfade = starSourceDrawOpacity(entry, state.settings.starCatalogs, camDistPc);
    if (sourceCrossfade <= 0) continue; // faded out — additive draw of nothing
    // Re-narrows to the variant carrying `drawBudget`; the compiler, not a
    // second copy of the gate, keeps this in step with the predicate above.
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;

    // The load-time index (`starOctreeIndex`): box geometry, `childMask`
    // (leaf-vs-aggregate), and subtree flux-glow counts as flat typed arrays.
    const { boxOriginPc, boxEdgePc, firstRecord, recordCount, childMask, subtreeCounts } =
      starOctreeIndex(catalog);

    // Reuse this catalog's persistent stream pair rather than allocating
    // fresh arrays every frame (see `starNodeStream`).
    const { leaf, aggregate } = streamsFor(catalog, view.viewSlot);
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

    if (isCapture) {
      const cut = walkStarOctreeCut(
        catalog,
        camPosPc,
        entry.drawBudget,
        state.settings.starCatalogs.refineThreshold,
        cutFrustum,
      );
      for (let i = 0; i < cut.count; i++) emitNode(cut.nodeIndex[i]!, 1);
      sources.push({ source, leaf, aggregate });
      continue;
    }

    // The active list `advanceStarFades` left after its swap — the drawn set,
    // in its emission order, fade-outs included. Empty for a catalog no
    // advance has reached yet.
    const { opacity, prevActiveList, prevActiveCount } = fadeStateFor(catalog);
    for (let i = 0; i < prevActiveCount; i++) {
      const idx = prevActiveList[i]!;
      emitNode(idx, opacity[idx]!);
    }
    sources.push({ source, leaf, aggregate });
  }

  return {
    sources,
    originMpc: camPos,
    sizePx,
    brightness,
    glowOverlap,
    aggregateIntensityCap,
  };
}
