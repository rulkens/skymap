/**
 * One per-POI marker descriptor produced by `poiSubsystem.produceMarkers`
 * and consumed by `clusterMarkerRenderer.setMarkers`.
 *
 * Why a separate descriptor type instead of reusing `PointOfInterest`?
 * Separation of concerns: a descriptor carries only what the renderer
 * needs to draw one marker (already-evaluated tints, already-faded
 * alphas), so the renderer never has to know about category styles or
 * apparent-size math.  The subsystem boundary keeps `produceMarkers`
 * the single owner of every per-frame, per-POI computation.
 */

import type { Vec3 } from '../math/Vec3';
import type { PoiCategory } from '../../services/engine/subsystems/poiSubsystem';

export type ClusterMarkerDescriptor = {
  /**
   * Stable POI id (mirrors `PointOfInterest.id`).  CPU-side metadata
   * only — the renderer ignores this field when packing the GPU
   * instance buffer.  Why carry it then?  Two downstream consumers
   * need to correlate a marker back to its source POI: (a) the
   * selection layer that bumps `ringAlpha` for the focused POI, and
   * (b) the pick-ring path that has to turn a hovered ring back into
   * a POI id.  Carrying the id on the descriptor keeps both lookups
   * O(1) per marker without exposing the subsystem's `pois` array to
   * every consumer.
   */
  readonly id: string;
  /** Category — drives which draw bucket this descriptor lands in (per-category source-code uniform). */
  readonly category: PoiCategory;
  /** World-space centre. */
  readonly worldPos: Vec3;
  /**
   * Ring radius AND halo half-extent in Mpc.  Semantic-free at the
   * renderer layer — the producer (poiSubsystem.produceMarkers) feeds
   * the POI's `apparentRadiusMpc` here (the wider "named" extent
   * rather than the virial core), so the ring frames the cluster as
   * the user thinks of it, not the gravitationally-bound core.  The
   * core is used elsewhere (camera focus tween, InfoCard "r" line).
   */
  readonly radiusMpc: number;
  /** RGB tint for the halo (premultiplied alpha applied via haloAlpha). */
  readonly haloColor: Vec3;
  /** RGB tint for the ring. */
  readonly ringColor: Vec3;
  /** [0..1] halo alpha after fade math.  0 → halo pass should skip this descriptor entirely (voids, fully-faded). */
  readonly haloAlpha: number;
  /** [0..1] ring alpha after fade math.  0 → ring also skipped. */
  readonly ringAlpha: number;
};
