/**
 * PlannerScopeTarget — what `runPlanSteps` hands each planner, shaped by its
 * scope: a `'once'` planner gets the frame snapshot and every view; a
 * `'perView'` planner gets the one view it plans for.
 */

import type { FrameView } from './FrameView';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type PlannerScopeTarget =
  | {
      readonly scope: 'once';
      readonly snapshot: ReadyFrameContext;
      readonly views: readonly FrameView[];
    }
  | { readonly scope: 'perView'; readonly view: FrameView };
