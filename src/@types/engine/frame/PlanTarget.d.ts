/**
 * PlanTarget — what `runPlanSteps` runs a section's `plan` rows against: the
 * frame-wide snapshot plus every view for a `once` section, or one view for
 * a `perView` section. Mirrors `ContentPlanner`'s own scope discriminant.
 */

import type { FrameView } from './FrameView';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type PlanTarget =
  | {
      readonly scope: 'once';
      readonly snapshot: ReadyFrameContext;
      readonly views: readonly FrameView[];
    }
  | { readonly scope: 'perView'; readonly view: FrameView };
