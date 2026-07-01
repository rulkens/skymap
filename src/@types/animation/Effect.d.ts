/**
 * Effect — the top-level tagged union of everything a clip timeline can contain.
 *
 * A clip's `timeline: Effect[]` is an ordered sequence of these. Every arm is a
 * plain serializable object — no functions, no class instances. The helpers in
 * `effectHelpers.ts` (Task 3) are the ONLY constructors; authors never write raw
 * `{ kind: … }` objects.
 *
 * ### Why Effect = CameraAction | SceneEffect | FocusBoundEffect | structural nodes?
 *
 * Camera motion and scene changes are independent axes: a camera tween says
 * nothing about what layers are visible, and a `show` cue says nothing about
 * where the camera is. Unioning them here keeps the timeline homogeneous (one
 * array, one type), while the discriminant `kind` lets the player split them at
 * runtime without an `instanceof` check or parallel arrays.
 *
 * `FocusBoundEffect` arms (`moveTargetId`, `dollyToId`, `focusId`) are the
 * UNRESOLVED authoring forms — they carry a `FocusId` instead of a concrete
 * `Vec3`/`SelectionRef`. They are rewritten by `resolveClipFoci` before
 * `compileClip` runs; `compileClip` throws if it ever sees one unresolved.
 *
 * The four structural nodes (`hold`, `wait`, `seq`, `all`, `fork`) compose
 * effects without nesting types: a `seq` holds a `children: Effect[]`, which can
 * itself contain `all`s and `fork`s. This recursive shape is the only reason
 * `Effect` is NOT a `.d.ts` of mutually-exclusive primitives — the self-reference
 * requires a forward declaration. TypeScript handles the recursion fine via a
 * type alias (no `interface` needed).
 *
 *   - `hold` — timed dwell: advance the clock by `sec` holding the current pose.
 *     The "pause at a meaningful scale" beat. Intentful: reads as a deliberate
 *     dwell, not just empty time.
 *
 *   - `wait` — pure timeline delay. Identical in mechanics to `hold`; the
 *     distinction is INTENT — `wait` offsets a following cue, `hold` is the beat
 *     itself.
 *
 *   - `seq` — play children IN ORDER; each starts when the previous ends.
 *
 *   - `all` — play children CONCURRENTLY; the block ends when the LONGEST child
 *     ends. The single-writer rule (one base writer per channel) is enforced here
 *     at registration time.
 *
 *   - `fork` — start `child` concurrently but do NOT wait for it; the block's
 *     duration ignores a fork. A `fork`ed perpetual `spin`/`oscillate` runs
 *     "under" the awaited timeline and is cancelled at clip end.
 *
 *   - `flyPath` — a multi-waypoint camera flythrough. Unlike chained `setVec`
 *     tweens (which corner at each point), it fits one arc-length-reparametrised
 *     Catmull-Rom through its `waypoints`, so the path is C1-smooth and
 *     perceived speed is uniform by default. It owns all four camera channels
 *     for its window (a single composite writer), so the base/`set` layer must
 *     not also write them there. `over` is the TOTAL travel seconds; `ease`
 *     shapes the whole leg's accel/decel. A `flyPath` may carry `id`-form
 *     waypoints, so `resolveClipFoci` rewrites it before `compileClip` — but
 *     unlike the `FocusBoundEffect` arms it is NOT consumed away: the resolved
 *     `flyPath` (all waypoints in `at`-form) survives into `compileClip`.
 *
 * ### Alternative rejected: separate `CameraEffect` and `SceneEffect` timelines
 *
 * Two parallel arrays would let the player split without discriminating on `kind`,
 * but it would prevent interleaving a camera move with a scene cue at a specific
 * beat position (e.g. "show flow exactly 5 s into the dolly"). A single timeline
 * preserves ordering semantics across both kinds.
 */

import type { CameraAction } from './CameraAction';
import type { FocusBoundEffect } from './FocusBoundEffect';
import type { SceneEffect } from './SceneEffect';
import type { PathWaypoint } from './PathWaypoint';
import type { Ease } from './Ease';
import type { SplineConfig } from './SplineConfig';
import type { PassByConfig } from './PassByConfig';

export type Effect =
  | CameraAction
  | SceneEffect
  | FocusBoundEffect
  | { readonly kind: 'hold'; readonly sec: number }
  | { readonly kind: 'wait'; readonly sec: number }
  | { readonly kind: 'seq'; readonly children: Effect[] }
  | { readonly kind: 'all'; readonly children: Effect[] }
  | { readonly kind: 'fork'; readonly child: Effect }
  | {
      readonly kind: 'flyPath';
      readonly waypoints: PathWaypoint[];
      readonly over: number;
      readonly ease: Ease;
      /**
       * Seconds to blend the live orientation into the down-the-path aim at the
       * start (the "align-in"). Omit for the builder default. Tunable so the
       * camera doesn't finish turning before it has begun translating.
       */
      readonly align?: number;
      /**
       * Seconds of ease ramp at EACH end for a trapezoidal speed envelope: ease
       * in over the first `rampSec`, cruise at constant speed, ease out over the
       * last `rampSec`. Omit (or 0) to use the named `ease` instead. Smaller =
       * shorter accel/decel + longer cruise; clamped so the two ramps never
       * exceed the take.
       */
      readonly rampSec?: number;
      /**
       * Path-level brake depth ∈ [0,1] applied at EVERY target — a local velocity
       * dip as the camera passes each waypoint (slow on approach + departure). A
       * per-waypoint `linger` overrides it. 0 (the default) cruises straight
       * through; 1 eases to a near-stop. Omit for the builder default (0).
       */
      readonly linger?: number;
      /**
       * Which spline basis fits the waypoints, plus the knobs that basis owns.
       * `{ kind: 'centripetal' }` (Catmull-Rom, banks early — the default) carries
       * nothing else; `{ kind: 'causalHermite', turnDelay?, lookAhead? }` (arrives
       * head-on, turns after) carries the overshoot + look-lead knobs INSIDE the
       * arm, so they can't be set on centripetal. Omit for the builder default
       * (`{ kind: 'centripetal' }`). See `SplineConfig`.
       */
      readonly spline?: SplineConfig;
      /**
       * How the eye flies PAST interior galaxy waypoints instead of through their
       * centres (offset + direction). Omit for through-centre
       * (the default — right for a group cloud, so a groups flythrough is
       * untouched). See `PassByConfig`.
       */
      readonly passBy?: PassByConfig;
    };
