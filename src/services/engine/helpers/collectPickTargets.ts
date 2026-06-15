/**
 * collectPickTargets — the single source of truth for "what is pickable
 * this frame, and is there anything to pick at all?"
 *
 * Three call sites need the same answer: the per-frame hover throttle
 * and the pick-debug overlay (`runFrame.ts`), and the click resolver
 * (`wireInput.ts`).  Each one (a) filters the renderer's loaded galaxy
 * catalogs by the live pick mask — a fading-out layer clears its bit
 * immediately so it stops claiming hits — and (b) decides whether to run
 * a pick pass at all.
 *
 * ### Why a helper rather than the gate repeated at each site
 *
 * Structure markers are independently pickable: `structureMarkerRenderer.pickRing`
 * draws cluster / supercluster / void / group rings into the SAME pick
 * texture, but they are NOT galaxy catalogs and never appear in
 * `loadedSources()`.  A naive "visibleSources is non-empty" gate would
 * make every structure ring unpickable — and the pick-debug overlay
 * black — the instant all galaxy catalogs are toggled off.  Folding both
 * parts into one helper keeps the "is anything pickable" rule in exactly
 * one place: a future pickable layer is added here once and all callers
 * inherit it.
 *
 * `markerCount()` mirrors `structureMarkersPass`'s enable gate — it drops
 * to 0 when every structure category is hidden or every ring has faded
 * out, so `hasAny` correctly reflects whether a ring is actually on
 * screen to be hit.
 *
 * The Milky Way is a third independently-pickable layer: its invisible
 * pick billboard claims the galactic centre, but only while the disk is
 * on screen.  Folding `mwVisible` into `hasAny` keeps a MW-only frame
 * (galaxies off, no structure markers, disk visible) running a pick pass
 * — same fix the structure-marker fold-in applied for cluster-only
 * frames.
 */

import type { PointRenderer } from '../../../@types/rendering/PointRenderer';
import type { PickSourceDraw } from '../../../@types/rendering/PickSourceDraw';
import type { StructureMarkerRenderer } from '../../../@types/rendering/StructureMarkerRenderer';

export type PickTargets = {
  /** Loaded galaxy catalogs whose pick-mask bit is set, in `Source` enum order. */
  readonly visibleSources: readonly PickSourceDraw[];
  /**
   * Whether a pick pass should run this frame: at least one visible
   * galaxy catalog OR at least one cluster / SC / void ring marker queued
   * OR the Milky-Way disk on screen.
   */
  readonly hasAny: boolean;
};

export function collectPickTargets(
  renderer: PointRenderer,
  pickMask: number,
  structureMarkerRenderer: StructureMarkerRenderer | null,
  // Whether the Milky-Way disk is on screen this frame (its invisible
  // pick billboard claims the galactic centre only then).  Defaults to
  // false so existing call sites that don't yet thread the gate keep the
  // pre-MW behaviour.
  mwVisible = false,
): PickTargets {
  const visibleSources = Array.from(renderer.loadedSources()).filter(
    (s) => ((pickMask >> s.source) & 1) !== 0,
  );
  const hasStructureMarkers =
    structureMarkerRenderer !== null && structureMarkerRenderer.markerCount() > 0;
  return {
    visibleSources,
    hasAny: visibleSources.length > 0 || hasStructureMarkers || mwVisible,
  };
}
