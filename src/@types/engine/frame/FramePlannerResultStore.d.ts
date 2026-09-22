/**
 * Plans — the ONE home for this frame's planned data, on
 * `ReadyFrameContext.plans`, minted once per frame (`createPlans`) and shared
 * by every `FrameView` the same way `snapshot` itself is. A `'once'` value is
 * keyed by planner name alone; a `'perView'` value additionally by `FrameView`
 * identity — there is no canvas-shaped fallback a face could misread as its own.
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
