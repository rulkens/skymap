/**
 * checkFrameOrder — the once-at-boot cross-check on `FRAME_ORDER`. Nothing
 * type-checks a pass name or a target string, so each failure it catches would
 * otherwise be silent: a Layer that adds a pass and forgets the order line
 * never draws, a name listed twice draws twice, a mistyped target filters to
 * nothing. Names no present Layer owns are NOT an error — that is how a Layer
 * left out of a composition is omitted.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';

type StepFacts = {
  /** Names this line draws for the real view — the "exactly once" domain. */
  readonly drawn: readonly string[];
  /** Names this line RE-draws into a capture target; they must also be drawn. */
  readonly captured: readonly string[];
  readonly targets: readonly string[];
};

const NONE: StepFacts = { drawn: [], captured: [], targets: [] };

// A table rather than a switch, for the reason `expandFrameOrder` gives.
const STEP_FACTS: {
  [K in FrameStepSpec['kind']]: (spec: Extract<FrameStepSpec, { readonly kind: K }>) => StepFacts;
} = {
  compute: () => NONE,
  capture: (spec) => ({
    drawn: [],
    captured: [...spec.cosmoPasses, ...spec.near0Passes],
    targets: [spec.target],
  }),
  render: (spec) => ({ drawn: spec.passes, captured: [], targets: [spec.target] }),
  foreground: (spec) => ({
    drawn: [...spec.near0Passes, ...spec.bodyPasses],
    captured: [],
    targets: [spec.target],
  }),
  lens: (spec) => ({ drawn: spec.passes, captured: [], targets: [spec.target] }),
  composite: (spec) => ({ drawn: [], captured: [], targets: [spec.source, spec.dest] }),
  bloom: () => NONE,
  tonemap: (spec) => ({ drawn: [], captured: [], targets: [spec.source, spec.dest] }),
};

export function checkFrameOrder(
  order: readonly FrameStepSpec[],
  passes: readonly ContentPass[],
  targetIds: readonly string[],
): void {
  const drawCount = new Map<string, number>();
  const captured: string[] = [];
  const targets: string[] = [];
  for (const spec of order) {
    const factsOf = STEP_FACTS[spec.kind] as (s: FrameStepSpec) => StepFacts;
    const facts = factsOf(spec);
    for (const name of facts.drawn) drawCount.set(name, (drawCount.get(name) ?? 0) + 1);
    captured.push(...facts.captured);
    targets.push(...facts.targets);
  }

  for (const pass of passes) {
    const count = drawCount.get(pass.name) ?? 0;
    if (count === 0) {
      throw new Error(`checkFrameOrder: no FRAME_ORDER line draws contributed pass '${pass.name}'`);
    }
    if (count > 1) {
      throw new Error(
        `checkFrameOrder: pass '${pass.name}' is listed on ${count} FRAME_ORDER lines`,
      );
    }
  }

  for (const name of captured) {
    if (!drawCount.has(name)) {
      throw new Error(`checkFrameOrder: capture roster names '${name}', which no line draws`);
    }
  }

  const declared = new Set(targetIds);
  for (const target of targets) {
    if (!declared.has(target)) {
      throw new Error(
        `checkFrameOrder: step target '${target}' is not a declared render-target id`,
      );
    }
  }
}
