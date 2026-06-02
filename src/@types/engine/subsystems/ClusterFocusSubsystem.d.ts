import type { PointOfInterest } from './PointOfInterest';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { Destroyable } from '../../rendering/Destroyable';

/**
 * ClusterFocusSubsystem — owns cluster "focus mode": when a cluster /
 * supercluster / void POI is focused, non-member galaxies fade to ~8%
 * alpha over ~400 ms so the structure's membership pops out. All three
 * categories behave identically (the focused structure's interior
 * galaxies stay bright; voids are just an underdense case).
 *
 * ### Focus-driven, not imperative
 *
 * The selection subsystem's `focused()` slot is the single source of
 * truth ("a cluster POI is focused" *is* "focus active"). So instead of
 * scattering focusOn / clearFocus calls across every focus-mutating
 * site, this subsystem exposes one per-frame `update(focusedPoi, now)`
 * that diffs the focused POI's id against the currently-active id and
 * drives the fade. No call sites to keep in sync.
 *
 * ### GPU re-derives membership
 *
 * The points vertex shader re-derives `distance(p.position, center) <
 * radius` per-vertex, so this subsystem never computes a CPU member list
 * — it only supplies center, radius, and the smoothstep blend. (The pure
 * `clusterMembership` fn stays available if a future feature needs an
 * explicit count/list.)
 */
export type ClusterFocusSubsystem = {
  readonly id: 'clusterFocus';

  /**
   * Per-frame state sync. Diffs `focusedPoi?.id` against the currently
   * active id:
   *   - changed to a focus-eligible POI (cluster | supercluster | void):
   *     latch center/radius, fade toward 1 over 400 ms.
   *   - changed to null OR a non-eligible POI (famousGalaxy): fade toward
   *     0, keeping the last center/radius until blend settles at 0.
   *   - unchanged id: no-op (no re-fade).
   */
  update(focusedPoi: PointOfInterest | null, nowMs: number): void;

  /**
   * Pure read: ticks the fade and returns the live uniform value. At
   * rest (no POI focused) returns an all-zero value (blend=0).
   */
  produceFocusUniforms(nowMs: number): FocusUniformsValue;

  /** True only while the fade is animating (drives render-on-demand). */
  isAwake(nowMs: number): boolean;
} & Destroyable;
