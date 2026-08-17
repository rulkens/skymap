/**
 * stubResolveClipFoci — a duration-neutral stand-in for `resolveClipFoci`,
 * so a clip's length can be measured WITHOUT catalog data or a live camera.
 *
 * `compileClip` throws on unresolved id-bearing leaves, and the real
 * resolution pass needs loaded catalogs plus the live camera pose. For
 * TIMING, none of that matters: every id-bearing arm resolves to a concrete
 * leaf that keeps its authored `over` seconds (see `resolveClipFoci` — the
 * catalog supplies positions, never durations), and flyPath waypoint
 * positions touch duration only through dwell-window clipping at the take's
 * pinned ends — verified geometry-independent (identical totals across
 * disjoint synthetic position sets when this tool was built).
 *
 * So the rewrite is:
 *   - `moveTargetId` / `dollyToId` / `lookAtId` / `strafeId` / `spinToId` /
 *     `aimAlong` → `hold` of the same `over`. A hold writes no camera
 *     channel, so it can never trip the single-writer validation that the
 *     genuinely-resolved clip passes.
 *   - `focusId` → a zero-length `wait` (resolution makes it a point cue).
 *   - id-form `flyPath` waypoints → at-form with deterministic synthetic
 *     positions (spread out so the spline never degenerates).
 *
 * The result compiles to the exact `durationSec` the resolved clip would
 * have. Nothing else about it is meaningful — do NOT evaluate camera poses
 * or cues from a stub-resolved clip.
 */

import type { ClipData } from '../../../src/@types/animation/ClipData';
import type { Effect } from '../../../src/@types/animation/Effect';
import type { PathWaypoint } from '../../../src/@types/animation/PathWaypoint';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Deterministic, non-collinear spread — keeps the fitted spline healthy. */
function syntheticAt(n: number): Vec3 {
  return [n * 8, (n % 3) * 2, -n * 5];
}

function stubWaypoint(w: PathWaypoint, n: number): PathWaypoint {
  if (!('id' in w)) return w; // already concrete
  return {
    at: syntheticAt(n),
    distance: 3,
    radius: 1,
    ...(w.yaw !== undefined ? { yaw: w.yaw } : {}),
    ...(w.pitch !== undefined ? { pitch: w.pitch } : {}),
    ...(w.over !== undefined ? { over: w.over } : {}),
    ...(w.linger !== undefined ? { linger: w.linger } : {}),
  };
}

function stubEffect(effect: Effect, counter: { n: number }): Effect {
  switch (effect.kind) {
    case 'seq':
      return { kind: 'seq', children: effect.children.map((c) => stubEffect(c, counter)) };
    case 'all':
      return { kind: 'all', children: effect.children.map((c) => stubEffect(c, counter)) };
    case 'fork':
      return { kind: 'fork', child: stubEffect(effect.child, counter) };
    // Focus-bound moves resolve to leaves with the SAME authored `over` — a
    // hold of that length is duration-equivalent and channel-silent.
    case 'moveTargetId':
    case 'dollyToId':
    case 'lookAtId':
    case 'strafeId':
    case 'spinToId':
    case 'aimAlong':
      return { kind: 'hold', sec: effect.over };
    // Resolves to a point-in-time focus cue — zero awaited duration.
    case 'focusId':
      return { kind: 'wait', sec: 0 };
    case 'flyPath': {
      const waypoints = effect.waypoints.map((w) => {
        counter.n += 1;
        return stubWaypoint(w, counter.n);
      });
      return { ...effect, waypoints };
    }
    // Concrete camera actions, scene effects, hold/wait — nothing to resolve.
    default:
      return effect;
  }
}

/**
 * Rewrite every id-bearing leaf in `clip` to a duration-equivalent concrete
 * stand-in, so `compileClip` accepts it and reports the true `durationSec`.
 */
export function stubResolveClipFoci(clip: ClipData): ClipData {
  const counter = { n: 0 };
  return { ...clip, timeline: clip.timeline.map((e) => stubEffect(e, counter)) };
}
