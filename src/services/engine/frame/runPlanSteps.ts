/**
 * runPlanSteps — run one section's `plan` rows for one scope target, writing
 * each result into the `FramePlannerResultStore` before any GPU step of that target runs. A step
 * naming a planner absent from `planners` throws: unlike a pass or compute
 * row, a hand-authored `plan` line always names a row the composition owns.
 */

import type { FrameContentPlanner } from '../../../@types/engine/frame/FrameContentPlanner';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { PlannerScopeTarget } from '../../../@types/engine/frame/PlannerScopeTarget';

export function runPlanSteps(
  steps: readonly FrameStepSpec[],
  planners: readonly FrameContentPlanner<unknown>[],
  target: PlannerScopeTarget,
  state: PassState,
): void {
  for (const step of steps) {
    if (step.kind !== 'plan') continue;
    const planner = planners.find((p) => p.name === step.name);
    if (planner === undefined) {
      throw new Error(`runPlanSteps: no registered FrameContentPlanner named '${step.name}'`);
    }
    // `checkFrameOrder` rejects a scope mismatch at boot; the two branches
    // below are what narrow planner and target to each other, and the throw is
    // the leftover pairing no narrowing can rule out.
    if (target.scope === 'once') {
      if (planner.scope === 'once') {
        target.snapshot.plans.put(
          planner,
          undefined,
          planner.plan(target.snapshot, target.views, state),
        );
        continue;
      }
    } else if (planner.scope === 'perView') {
      target.view.snapshot.plans.put(planner, target.view, planner.plan(target.view, state));
      continue;
    }
    throw new Error(
      `runPlanSteps: planner '${step.name}' is '${planner.scope}', run against a '${target.scope}' target`,
    );
  }
}
