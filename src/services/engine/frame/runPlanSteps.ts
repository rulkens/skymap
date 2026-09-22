/**
 * runPlanSteps — run one section's `plan` rows for one scope target, writing
 * each result into `Plans` before any GPU step of that target runs. A step
 * naming a planner absent from `planners` throws: unlike a pass or compute
 * row, a hand-authored `plan` line always names a row the composition owns.
 */

import type { ContentPlanner } from '../../../@types/engine/frame/ContentPlanner';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';

type PlanTarget =
  | {
      readonly scope: 'once';
      readonly snapshot: ReadyFrameContext;
      readonly views: readonly FrameView[];
    }
  | { readonly scope: 'perView'; readonly view: FrameView };

export function runPlanSteps(
  steps: readonly FrameStepSpec[],
  planners: readonly ContentPlanner<unknown>[],
  target: PlanTarget,
  state: PassState,
): void {
  for (const step of steps) {
    if (step.kind !== 'plan') continue;
    const planner = planners.find((p) => p.name === step.name);
    if (planner === undefined) {
      throw new Error(`runPlanSteps: no registered ContentPlanner named '${step.name}'`);
    }
    if (target.scope === 'once') {
      if (planner.scope !== 'once') {
        throw new Error(
          `runPlanSteps: planner '${step.name}' is 'perView', run against a 'once' target`,
        );
      }
      target.snapshot.plans.put(
        planner,
        undefined,
        planner.plan(target.snapshot, target.views, state),
      );
    } else {
      if (planner.scope !== 'perView') {
        throw new Error(
          `runPlanSteps: planner '${step.name}' is 'once', run against a 'perView' target`,
        );
      }
      target.view.snapshot.plans.put(planner, target.view, planner.plan(target.view, state));
    }
  }
}
