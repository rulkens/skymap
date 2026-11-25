/**
 * PlannerScopeTarget — what `runPlanSteps` hands each planner, shaped by its
 * scope: a `'once'` planner gets the frame snapshot and every view; a
 * `'perView'` planner gets the one view it plans for, plus the plan memory its
 * `prev` comes from.
 */

import type { FrameView } from './FrameView';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { PerViewPlanMemory } from './PerViewPlanMemory';

export type PlannerScopeTarget =
  | {
      readonly scope: 'once';
      readonly snapshot: ReadyFrameContext;
      readonly views: readonly FrameView[];
    }
  | {
      readonly scope: 'perView';
      readonly view: FrameView;
      /** Last frame's values; `runPlanSteps` reads `prev` here. */
      readonly previous: PerViewPlanMemory;
      /** This frame's values, filled beside each `put`; `renderFrame` installs them for next frame. */
      readonly next: Map<string, Map<string, unknown>>;
    };
