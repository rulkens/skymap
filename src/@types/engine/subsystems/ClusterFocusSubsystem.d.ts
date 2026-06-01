import type { PointOfInterest } from './PointOfInterest';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { Destroyable } from '../../rendering/Destroyable';

/**
 * ClusterFocusSubsystem — owns cluster "focus mode": when a cluster /
 * supercluster / void POI is the current selection, non-member galaxies
 * fade to ~8% alpha over ~400 ms so the structure's membership pops out.
 *
 * ### Selection-driven, not imperative
 *
 * Selection is already the single source of truth ("a cluster POI is
 * selected" *is* "focus active"). So instead of scattering focusOn /
 * clearFocus calls across every selection-mutating site, this subsystem
 * exposes one per-frame `update(selectedPoi, now)` that diffs the
 * selected POI's id against the currently-focused id and drives the
 * fade. No call sites to keep in sync.
 *
 * ### GPU re-derives membership
 *
 * The points vertex shader re-derives `distance(p.position, center) <
 * radius` per-vertex, so this subsystem never computes a CPU member list
 * — it only supplies center, radius, invert, and the smoothstep blend.
 * (The pure `clusterMembership` fn stays available if a future feature
 * needs an explicit count/list.)
 */
export type ClusterFocusSubsystem = {
  readonly id: 'clusterFocus';

  /**
   * Per-frame state sync. Diffs `selectedPoi?.id` against the currently
   * focused id:
   *   - changed to a focus-eligible POI (cluster | supercluster | void):
   *     latch center/radius/invert, fade toward 1 over 400 ms.
   *   - changed to null OR a non-eligible POI (famousGalaxy): fade toward
   *     0, keeping the last center/radius until blend settles at 0.
   *   - unchanged id: no-op (no re-fade).
   */
  update(selectedPoi: PointOfInterest | null, nowMs: number): void;

  /**
   * Pure read: ticks the fade and returns the live uniform value. At
   * rest (no POI focused) returns an all-zero value (blend=0).
   */
  produceFocusUniforms(nowMs: number): FocusUniformsValue;

  /** True only while the fade is animating (drives render-on-demand). */
  isAwake(nowMs: number): boolean;
} & Destroyable;
