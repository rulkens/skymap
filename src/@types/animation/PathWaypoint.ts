/**
 * PathWaypoint — one waypoint in a `flyPath` camera flythrough.
 *
 * A waypoint is EITHER a concrete keyframe (`at` + `distance`) or a catalog
 * reference (`id`) resolved to a keyframe at play time by `resolveClipFoci`.
 * The two forms can be freely interleaved in a single `flyPath`, so an author
 * can sweep through named structures while dropping hand-placed control points
 * to shape the curve where the catalog positions alone would bend it wrong.
 *
 * ### Optional approach angle (`yaw` / `pitch`)
 *
 * Omit them and the path interpolates the approach angle across the leg (from
 * the clip's start framing toward the next specified angle), which is the
 * common case — you usually want to *sweep through* groups, not bank precisely
 * at each one. Supply them to pin the bank/tilt at that waypoint.
 *
 * ### Optional per-leg time (`over`)
 *
 * `over` is the seconds allotted to the leg LEADING INTO this waypoint. Omit it
 * and the leg's time is the arc-length share of the path's total duration
 * (`flyPath`'s `opts.over`) — i.e. uniform perceived speed, the default. Pin it
 * to slow one stretch down ("watch the view") or speed another up; the
 * remaining unpinned legs split what's left of the total by arc length. The
 * path never STOPS at a waypoint — a stop is a separate beat dwell, not a path
 * feature.
 *
 * ### Optional per-target slowdown (`linger`)
 *
 * `linger` ∈ [0,1] brakes the camera as it passes THIS waypoint — a local
 * velocity dip centred on the target (slow on approach, slow on departure),
 * unlike `over` which paces a whole leg uniformly. 0 cruises straight through;
 * 1 eases to a near-stop. Omit to inherit the `flyPath`'s path-level `linger`.
 * The path still never fully STOPS — a stop is a separate beat dwell.
 *
 * After `resolveClipFoci` runs, every waypoint is in `at`-form; `compileClip`
 * throws if it ever sees a surviving `id`-form (the readiness gate guarantees
 * it won't).
 */

import type { Vec3 } from '../math/Vec3';
import type { FocusId } from './FocusId';

export type PathWaypoint =
  | {
      readonly at: Vec3;
      readonly distance: number;
      readonly yaw?: number;
      readonly pitch?: number;
      readonly over?: number;
      readonly linger?: number;
      /**
       * The subject's world radius (Mpc), set by `resolveClipFoci` from
       * `focusFraming`. The unit a `flyPath`'s `passBy.offset` scales by — so an
       * `atFocus` galaxy can be flown past at "N radii". Absent on hand-placed
       * `atPoint` control points (they have no subject to fly past).
       */
      readonly radius?: number;
    }
  | {
      readonly id: FocusId;
      readonly yaw?: number;
      readonly pitch?: number;
      readonly over?: number;
      readonly linger?: number;
    };
