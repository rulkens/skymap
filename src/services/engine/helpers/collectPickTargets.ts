/**
 * collectPickTargets — the single source of truth for "what is pickable
 * this frame, and is there anything to pick at all?"
 *
 * Three call sites need the same answer: the per-frame hover throttle
 * and the pick-debug overlay (`runFrame.ts`), and the click resolver
 * (`wireInput.ts`).  Each one (a) filters the renderer's loaded galaxy
 * surveys by the live pick mask — a fading-out layer clears its bit
 * immediately so it stops claiming hits — and (b) decides whether to run
 * a pick pass at all.
 *
 * ### Why a helper rather than the gate repeated at each site
 *
 * Before the bulk cluster catalog landed, part (b) was simply
 * "visibleSources is non-empty", written as a bare `length === 0` bail
 * at each of the three sites.  Clusters then became independently
 * pickable: `clusterMarkerRenderer.pickRing` draws cluster / SC / void
 * rings into the SAME pick texture, but they are NOT galaxy surveys and
 * never appear in `loadedSources()`.  So the old gate made every cluster
 * unpickable — and the pick-debug overlay black — the instant all galaxy
 * surveys were toggled off.  Patching the extra `|| hasClusterMarkers`
 * clause into three (four, counting the renderer's own guard) gates
 * would have re-spread the same logic.  Folding both parts into one
 * helper keeps the "is anything pickable" rule in exactly one place: a
 * future pickable layer is added here once and all callers inherit it.
 *
 * `markerCount()` mirrors `clusterMarkersPass`'s enable gate — it drops
 * to 0 when the cluster category is hidden or every ring has faded out,
 * so `hasAny` correctly reflects whether a cluster ring is actually on
 * screen to be hit.
 */

import type { PointRenderer } from '../../../@types/rendering/PointRenderer';
import type { PickSourceDraw } from '../../../@types/rendering/PickSourceDraw';
import type { ClusterMarkerRenderer } from '../../../@types/rendering/ClusterMarkerRenderer';

export type PickTargets = {
  /** Loaded galaxy surveys whose pick-mask bit is set, in `Source` enum order. */
  readonly visibleSources: readonly PickSourceDraw[];
  /**
   * Whether a pick pass should run this frame: at least one visible
   * galaxy survey OR at least one cluster / SC / void ring marker queued.
   */
  readonly hasAny: boolean;
};

export function collectPickTargets(
  renderer: PointRenderer,
  pickMask: number,
  clusterMarkerRenderer: ClusterMarkerRenderer | null,
): PickTargets {
  const visibleSources = Array.from(renderer.loadedSources()).filter(
    (s) => ((pickMask >> s.source) & 1) !== 0,
  );
  const hasClusterMarkers =
    clusterMarkerRenderer !== null && clusterMarkerRenderer.markerCount() > 0;
  return { visibleSources, hasAny: visibleSources.length > 0 || hasClusterMarkers };
}
