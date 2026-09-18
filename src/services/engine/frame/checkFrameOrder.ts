/**
 * checkFrameOrder — the once-at-boot cross-check on `FRAME_ORDER`. Nothing
 * type-checks a pass/compute name or a target string, so each failure it
 * catches would otherwise be silent: a Layer that adds a pass or a compute row
 * and forgets the order line never runs, a name listed twice runs twice, a
 * mistyped target filters to nothing. Names no present Layer owns are NOT an
 * error — that is how a Layer left out of a composition is omitted. Nor is a
 * pass that only a capture line rosters — a probe's sky blit exists for the
 * capture alone.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';

type StepFacts = {
  /** Names this line draws for the real view — the "exactly once" domain. */
  readonly drawn: readonly string[];
  /** Compute row names this line runs — its own "exactly once" domain. */
  readonly computed: readonly string[];
  /** Names this line draws into a capture — outside the "exactly once" domain. */
  readonly captured: readonly string[];
  readonly targets: readonly string[];
};

const NONE: StepFacts = { drawn: [], computed: [], captured: [], targets: [] };

// A table rather than a switch, for the reason `expandFrameOrder` gives.
const STEP_FACTS: {
  [K in FrameStepSpec['kind']]: (spec: Extract<FrameStepSpec, { readonly kind: K }>) => StepFacts;
} = {
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
  render: (spec) => ({ ...NONE, drawn: spec.passes, targets: [spec.target] }),
  foreground: (spec) => ({
    ...NONE,
    drawn: [...spec.near0Passes, ...spec.bodyPasses],
    targets: [spec.target],
  }),
  composite: (spec) => ({ ...NONE, targets: [spec.source, spec.dest] }),
  bloom: () => NONE,
  tonemap: (spec) => ({ ...NONE, targets: [spec.source, spec.dest] }),
};

export function checkFrameOrder(
  order: readonly FrameStepSpec[],
  passes: readonly ContentPass[],
  computes: readonly ContentCompute[],
  targetIds: readonly string[],
): void {
  const drawCount = new Map<string, number>();
  // Separate from `drawCount`: a pass and a compute row may share a name on
  // purpose (`'flow'` is both), which one map would misread as "listed twice".
  const computeCount = new Map<string, number>();
  const captured = new Set<string>();
  const targets: string[] = [];
  for (const spec of order) {
    const factsOf = STEP_FACTS[spec.kind] as (s: FrameStepSpec) => StepFacts;
    const facts = factsOf(spec);
    for (const name of facts.drawn) drawCount.set(name, (drawCount.get(name) ?? 0) + 1);
    for (const name of facts.computed) computeCount.set(name, (computeCount.get(name) ?? 0) + 1);
    for (const name of facts.captured) captured.add(name);
    targets.push(...facts.targets);
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

  const declared = new Set(targetIds);
  for (const target of targets) {
    if (!declared.has(target)) {
      throw new Error(
        `checkFrameOrder: step target '${target}' is not a declared render-target id`,
      );
    }
  }
}
