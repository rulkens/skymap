/**
 * FramePlannerResultStore — this frame's store of planner results, minted per
 * frame on `ReadyFrameContext.plans`. A pass reads the data planned for its
 * view with `get(planner, view)`. A `'once'` result is filed by planner name;
 * a `'perView'` result also by the `FrameView` it was planned for. Reading
 * something never planned THROWS by design: there is no canvas-shaped
 * fallback a dome face could silently read as its own. `awake` and
 * `settling` OR every result put this frame.
 */

import type { FrameContentPlanner } from './FrameContentPlanner';
import type { FrameView } from './FrameView';
import type { PlannerResult } from './PlannerResult';

export type FramePlannerResultStore = {
  /** THROWS on a miss: an unplanned planner, or a view it never planned for. */
  get<T>(planner: FrameContentPlanner<T>, view?: FrameView): T;
  put<T>(
    planner: FrameContentPlanner<T>,
    view: FrameView | undefined,
    result: PlannerResult<T>,
  ): void;
  /** OR-fold of every `put` result's `awake` so far this frame. */
  readonly awake: boolean;
  /** OR-fold of every `put` result's `settling` so far this frame. */
  readonly settling: boolean;
};
