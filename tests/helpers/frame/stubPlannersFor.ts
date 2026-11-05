/**
 * stubPlannersFor — derives inert plan stubs from a section's own
 * `{ kind: 'plan' }` steps, so a new Layer planner row costs a fixture
 * nothing: a stub list that drifted from the section would already fail
 * `checkFrameOrder`'s "every plan row names a registered planner" rule.
 */

import type { FrameContentPlanner } from '../../../src/@types/engine/frame/FrameContentPlanner';
import type { FrameSection } from '../../../src/@types/engine/frame/FrameSection';
import type { PlannerStepSpec } from '../../../src/@types/engine/frame/PlannerStepSpec';

export function stubPlannersFor(section: FrameSection): readonly FrameContentPlanner<unknown>[] {
  const planSteps = section.steps.filter((step): step is PlannerStepSpec => step.kind === 'plan');
  return section.scope === 'once'
    ? planSteps.map(
        (step): FrameContentPlanner<unknown> => ({
          name: step.name,
          scope: 'once',
          plan: () => ({ value: undefined, awake: false, settling: false }),
        }),
      )
    : planSteps.map(
        (step): FrameContentPlanner<unknown> => ({
          name: step.name,
          scope: 'perView',
          plan: () => ({ value: undefined, awake: false, settling: false }),
        }),
      );
}
