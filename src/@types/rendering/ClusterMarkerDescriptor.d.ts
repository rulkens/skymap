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
  /** Category — drives which draw bucket this descriptor lands in (per-category source-code uniform). */
  readonly category: PoiCategory;
  /** World-space centre. */
  readonly worldPos: Vec3;
  /** Ring radius AND halo half-extent in Mpc. */
  readonly physicalRadiusMpc: number;
  /** RGB tint for the halo (premultiplied alpha applied via haloAlpha). */
  readonly haloColor: Vec3;
  /** RGB tint for the ring. */
  readonly ringColor: Vec3;
  /** [0..1] halo alpha after fade math.  0 → halo pass should skip this descriptor entirely (voids, fully-faded). */
  readonly haloAlpha: number;
  /** [0..1] ring alpha after fade math.  0 → ring also skipped. */
  readonly ringAlpha: number;
};
