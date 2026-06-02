/**
 * FocusState — selected-POI state for the cluster-viz focus mode.
 *
 * The focus subsystem (created in plan 4) owns one of these at a time:
 * either the user has a POI selected and the field is fully populated,
 * or `active === false` and the rest of the fields hold whatever was
 * last selected (so the uniform-write path doesn't have to special-case
 * "no selection" — the shader reads `active === false` and skips the
 * member alpha-multiplier branch).
 *
 * Why a single record (rather than `FocusState | null`):
 *   - The shader uniform block is always present in the bind group;
 *     a `null` would require either a separate "active" flag bookkept
 *     in the subsystem or a per-frame conditional bind-group rebind.
 *     Carrying `active: boolean` in-band keeps the shader and CPU
 *     paths uniform.
 *   - The `memberPackedIds` array is reused across same-POI re-focus
 *     events; nullifying it on deactivation would force a recomputation
 *     on every reactivation. Same field, `active = false`, no recompute.
 *
 * **Not yet wired into `EngineState`.** This file lands the type for
 * plan 4 to import; plan 4's bootstrap adds the `state.focus` field
 * and the subsystem that mutates it.
 */

import type { Vec3 } from '../../math/Vec3';

export type FocusState = {
  /**
   * Stable POI identifier (matches `PointOfInterest.id`). Used to key
   * the membership cache (`(poiId, dataRev) → packedIds`) and to wire
   * the URL hash echo.
   */
  readonly poiId: string;

  /**
   * POI category — drives the camera framing multiplier (plan 3 §5.3)
   * and the InfoCard layout. All three categories share one fade rule
   * (interior galaxies stay bright), so the shader needs no per-category
   * bit.
   */
  readonly category: 'cluster' | 'supercluster' | 'void';

  /**
   * Packed-identity members from `clusterMembership(...)`. CPU-side
   * consumers (InfoCard count text, tour iterator, etc.) read this
   * directly; the shader's membership test recomputes per-vertex from
   * `(center, radiusMpc)` rather than uploading this array.
   */
  readonly memberPackedIds: readonly number[];

  /**
   * World-space center of the POI (Mpc). Mirrors
   * `PointOfInterest.worldPos`. Carried separately so the focus
   * uniform write doesn't have to re-resolve the POI by id every frame.
   */
  readonly center: Vec3;

  /**
   * Physical radius of the structure in Mpc — same value the POI's
   * marker ring is drawn at, and the cone-search radius that produced
   * `memberPackedIds`.
   */
  readonly radiusMpc: number;

  /**
   * `true` while the focus is engaged; `false` after a clear gesture
   * (click empty space, close button, ESC). The shader reads this
   * to short-circuit the member alpha-multiplier branch when no
   * selection is active.
   */
  readonly active: boolean;
};
