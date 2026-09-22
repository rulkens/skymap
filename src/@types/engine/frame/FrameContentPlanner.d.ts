/**
 * ContentPlanner — one CPU planning step and its own scope. WHERE it runs is
 * not here: `FRAME_ORDER` names the row on the `{ kind: 'plan' }` line that
 * states its place, mirroring `ContentCompute`. `scope` is the ONLY
 * discriminant, and it decides the shape of `plan` itself: a `'once'` row
 * plans over every view of the frame, a `'perView'` row plans one.
 */

import type { FrameView } from './FrameView';
import type { PassState } from './PassState';
import type { PlannerResult } from './PlannerResult';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type FrameContentPlanner<T> =
  | {
      readonly name: string;
      readonly scope: 'once';
      plan(
        snapshot: ReadyFrameContext,
        views: readonly FrameView[],
        state: PassState,
      ): PlannerResult<T>;
    }
  | {
      readonly name: string;
      readonly scope: 'perView';
      plan(view: FrameView, state: PassState): PlannerResult<T>;
    };
