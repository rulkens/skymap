/**
 * restartRequested — whether a retained target's first touch this frame clears, read off the
 * named per-view planner's value for `view`. Either wiring bug below throws: a silent fallback
 * would load forever and pile the target up additively.
 */

import type { FrameContentPlanner } from '../../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../@types/engine/frame/FrameView';

export function restartRequested(
  plannerName: string,
  view: FrameView,
  planners: readonly FrameContentPlanner<unknown>[],
): boolean {
  const planner = planners.find((p) => p.name === plannerName);
  if (planner === undefined) {
    throw new Error(`restartRequested: no planner named '${plannerName}'`);
  }
  const restart = (view.snapshot.plans.get(planner, view) as { restart?: unknown } | null)?.restart;
  if (typeof restart !== 'boolean') {
    throw new Error(`restartRequested: planner '${plannerName}' planned no boolean 'restart'`);
  }
  return restart;
}
