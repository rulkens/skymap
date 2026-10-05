import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { NODE_FADE_MS } from '../../../../data/starNodeFade';
import { walkStarOctreeCut } from '../../../../utils/star/walkStarOctreeCut';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { frameStarCutFrustum } from './frameStarCutFrustum';
import { fadeStateFor } from './starFadeState';
import { starSourcesInBand } from './starSourcesInBand';

/**
 * The WRITE half of the star cut and the ONLY writer of the per-node LOD fade
 * ramps (`starFadeState` owns the scheme): the Layer's `frame` hook calls it
 * once per real frame, and `computeStarCut` then reads what it left. Returns
 * the render-on-demand wake vote — a node still mid-fade. Writes ramps only,
 * never a node stream.
 */
export function advanceStarFades(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  settings: StarCatalogSettings,
  views: readonly FrameView[],
): boolean {
  if (!settings.enabled) return false;

  // `views[0]` is the anchor: its eye centres the walk and the rebased prune
  // frustum, its `snapshot.nowMs` stamps the ramps. `views` is the frusta to
  // union for the off-screen prune. The Layer's `frame` hook's views are never
  // capture faces (those own their cut and share no temporal state — see
  // `computeStarCut`).
  const view = views[0]!;
  const camPos: Vec3 = [view.drawCamPos[0], view.drawCamPos[1], view.drawCamPos[2]];
  const camPosPc: Vec3 = [
    camPos[0] * SCALE_UNITS.MPC_TO_PC,
    camPos[1] * SCALE_UNITS.MPC_TO_PC,
    camPos[2] * SCALE_UNITS.MPC_TO_PC,
  ];
  const camDistPc = Math.hypot(camPosPc[0], camPosPc[1], camPosPc[2]);

  const nowMs = view.snapshot.nowMs;
  const refineThreshold = settings.refineThreshold;
  const cutFrustum = frameStarCutFrustum(views, camPos, settings.sizePx, settings.glowOverlap);

  let anyFading = false;

  for (const { catalog, entry } of starSourcesInBand(runtime, settings, camDistPc)) {
    const cut = walkStarOctreeCut(catalog, camPosPc, entry.drawBudget, refineThreshold, cutFrustum);

    const fadeState = fadeStateFor(catalog);
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
      if (op !== target) anyFading = true;

      // Fully faded out: drop it (draws in neither stream, not re-listed).
      if (target === 0 && op <= 0) return;
      // Belt-and-braces: a node index outlives its catalog only across a
      // tier swap, which hands a fresh catalog object.
      if (idx >= nodeCount) return;

      activeFrame[idx] = frame;
      activeList[activeCount++] = idx;
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
    // below, so each active node is visited exactly once). The order nodes
    // land on the active list is the order `computeStarCut` emits them in.
    for (let i = 0; i < cut.count; i++) advanceNode(cut.nodeIndex[i]!, 1);
    for (let j = 0; j < prevActiveCount; j++) {
      const idx = prevActiveList[j]!;
      if (inCutFrame[idx] !== frame) advanceNode(idx, 0);
    }

    // Swap the double buffer (see `starFadeState`).
    fadeState.prevActiveList = activeList;
    fadeState.activeList = prevActiveList;
    fadeState.prevActiveCount = activeCount;
  }

  return anyFading;
}
