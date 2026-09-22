/**
 * checkFrameOrder — the once-at-boot cross-check on `FRAME_ORDER`. Nothing
 * type-checks a pass/compute/planner name or a target string, so each
 * failure it catches would otherwise be silent: a Layer that adds a pass or a
 * compute row and forgets the order line never runs, a name listed twice runs
 * twice, a mistyped target filters to nothing. Names no present Layer owns
 * are NOT an error for a pass or a compute — that is how a Layer left out of
 * a composition is omitted. A `plan` line is stricter: it always names a row
 * the composition owns, so an unmatched name throws immediately.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { ContentPlanner } from '../../../@types/engine/frame/ContentPlanner';
import type { FrameSection } from '../../../@types/engine/frame/FrameSection';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import type { RenderTargetSpec } from '../../../@types/engine/frame/RenderTargetSpec';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { rosterPassNames } from '../../../utils/render/rosterPassNames';

type StepFacts = {
  /** Names this line draws for the real view — the "exactly once" domain. */
  readonly drawn: readonly string[];
  /** Compute row names this line runs — its own "exactly once" domain. */
  readonly computed: readonly string[];
  /** Names this line draws into a capture — outside the "exactly once" domain. */
  readonly captured: readonly string[];
  readonly targets: readonly string[];
  /** A `render` line's declared `{ sample }` source id, when it has one. */
  readonly sampled: readonly string[];
};

const NONE: StepFacts = { drawn: [], computed: [], captured: [], targets: [], sampled: [] };

// A table rather than a switch, for the reason `expandFrameOrder` gives.
const STEP_FACTS: {
  [K in FrameStepSpec['kind']]: (spec: Extract<FrameStepSpec, { readonly kind: K }>) => StepFacts;
} = {
  // Handled by its own loop below (it needs the enclosing section's scope);
  // contributes nothing to the counts this table drives.
  plan: () => NONE,
  compute: (spec) => ({ ...NONE, computed: [spec.name] }),
  capture: (spec) => ({
    ...NONE,
    captured: [...spec.cosmoPasses, ...spec.near0Passes, ...spec.bodyPasses],
    // Resolved through the table so the check still proves the capture lands in
    // a declared render-target row; a bogus key is already a typecheck error.
    // Only a sky row names one — a probe's faces are its subject's own cube.
    targets: spec.captures.flatMap((key) => {
      const row = CUBEMAP_CAPTURES[key];
      return row.kind === 'sky' ? [row.target] : [];
    }),
  }),
  render: (spec) => ({
    ...NONE,
    drawn: spec.passes,
    targets: [spec.target],
    sampled: typeof spec.depth === 'object' ? [spec.depth.sample] : [],
  }),
  foreground: (spec) => ({
    ...NONE,
    drawn: [...spec.near0Passes, ...rosterPassNames(spec.bodyPasses)],
    targets: [spec.target],
  }),
  composite: (spec) => ({ ...NONE, targets: [spec.source, spec.dest] }),
  bloom: () => NONE,
  tonemap: (spec) => ({ ...NONE, targets: [spec.source, spec.dest] }),
};

export function checkFrameOrder(
  sections: readonly FrameSection[],
  passes: readonly ContentPass[],
  computes: readonly ContentCompute[],
  planners: readonly ContentPlanner<unknown>[],
  targets: readonly Pick<RenderTargetSpec, 'id' | 'depth'>[],
): void {
  const drawCount = new Map<string, number>();
  // Separate from `drawCount`: a pass and a compute row may share a name on
  // purpose (`'flow'` is both), which one map would misread as "listed twice".
  const computeCount = new Map<string, number>();
  const planCount = new Map<string, number>();
  const captured = new Set<string>();
  const touchedTargets: string[] = [];
  const sampled: string[] = [];
  const present = new Set(passes.map((pass) => pass.name));
  const computeByName = new Map(computes.map((compute) => [compute.name, compute]));
  const plannerByName = new Map(planners.map((planner) => [planner.name, planner]));

  for (const section of sections) {
    // A `plan` row must lead its section — the shape `runPlanSteps` relies on
    // to run every plan before the section's first GPU step.
    let sawNonPlan = false;
    for (const spec of section.steps) {
      if (spec.kind === 'plan') {
        if (sawNonPlan) {
          throw new Error(
            `checkFrameOrder: plan row '${spec.name}' follows a non-plan row — plan rows lead their section`,
          );
        }
        planCount.set(spec.name, (planCount.get(spec.name) ?? 0) + 1);
        const planner = plannerByName.get(spec.name);
        if (planner === undefined) {
          throw new Error(
            `checkFrameOrder: plan row names '${spec.name}', which no registered ContentPlanner declares`,
          );
        }
        if (planner.scope !== section.scope) {
          throw new Error(
            `checkFrameOrder: plan row '${spec.name}' has scope '${planner.scope}', but its section is '${section.scope}'`,
          );
        }
        continue;
      }
      sawNonPlan = true;
      if (spec.kind === 'compute') {
        const compute = computeByName.get(spec.name);
        if (compute !== undefined && compute.scope !== section.scope) {
          throw new Error(
            `checkFrameOrder: compute row '${spec.name}' has scope '${compute.scope}', but its section is '${section.scope}'`,
          );
        }
      }
      const factsOf = STEP_FACTS[spec.kind] as (s: FrameStepSpec) => StepFacts;
      const facts = factsOf(spec);
      // `expandFrameOrder` drops a render line none of whose passes is present, so
      // its target — Layer-owned, left out with the Layer — is never touched.
      const drops = spec.kind === 'render' && !facts.drawn.some((name) => present.has(name));
      for (const name of facts.drawn) drawCount.set(name, (drawCount.get(name) ?? 0) + 1);
      for (const name of facts.computed) computeCount.set(name, (computeCount.get(name) ?? 0) + 1);
      for (const name of facts.captured) captured.add(name);
      if (!drops) {
        touchedTargets.push(...facts.targets);
        sampled.push(...facts.sampled);
      }
    }
  }

  for (const pass of passes) {
    const count = drawCount.get(pass.name) ?? 0;
    if (count === 0 && !captured.has(pass.name)) {
      throw new Error(`checkFrameOrder: no FRAME_ORDER line draws contributed pass '${pass.name}'`);
    }
    if (count > 1) {
      throw new Error(
        `checkFrameOrder: pass '${pass.name}' is listed on ${count} FRAME_ORDER lines`,
      );
    }
  }

  for (const compute of computes) {
    const count = computeCount.get(compute.name) ?? 0;
    if (count === 0) {
      throw new Error(
        `checkFrameOrder: no FRAME_ORDER line runs contributed compute '${compute.name}'`,
      );
    }
    if (count > 1) {
      throw new Error(
        `checkFrameOrder: compute '${compute.name}' is listed on ${count} FRAME_ORDER lines`,
      );
    }
  }

  for (const planner of planners) {
    const count = planCount.get(planner.name) ?? 0;
    if (count === 0) {
      throw new Error(
        `checkFrameOrder: no FRAME_ORDER line plans registered planner '${planner.name}'`,
      );
    }
    if (count > 1) {
      throw new Error(
        `checkFrameOrder: planner '${planner.name}' is listed on ${count} FRAME_ORDER lines`,
      );
    }
  }

  const declared = new Map(targets.map((row) => [row.id, row.depth]));
  for (const target of touchedTargets) {
    if (!declared.has(target)) {
      throw new Error(
        `checkFrameOrder: step target '${target}' is not a declared render-target id`,
      );
    }
  }

  for (const source of sampled) {
    if (!declared.has(source) || declared.get(source) === null) {
      throw new Error(
        `checkFrameOrder: step samples depth of '${source}', which is not a depth-bearing render-target row`,
      );
    }
  }
}
