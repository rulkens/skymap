/**
 * checkFrameOrder — the once-at-boot cross-check over every `ViewRig`'s
 * program: catches a pass/compute a Layer contributes but no line draws, a
 * name listed twice, or a mistyped target — all invisible to `tsc`.
 * "Listed twice" is checked PER PROGRAM, so a section two rigs share
 * (`PRELUDE`) is fine; "some program draws it" runs ACROSS every program.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ContentCompute } from '../../../@types/engine/frame/ContentCompute';
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
  // The dest is a VIEW's own output, not a named target row, so only the
  // source enters the declared-target check.
  copy: (spec) => ({ ...NONE, targets: [spec.source] }),
};

export function checkFrameOrder(
  programs: readonly (readonly FrameStepSpec[])[],
  passes: readonly ContentPass[],
  computes: readonly ContentCompute[],
  targets: readonly Pick<RenderTargetSpec, 'id' | 'depth'>[],
): void {
  const present = new Set(passes.map((pass) => pass.name));
  const drawnAnywhere = new Set<string>();
  const computedAnywhere = new Set<string>();
  const captured = new Set<string>();
  const touchedTargets: string[] = [];
  const sampled: string[] = [];

  for (const order of programs) {
    // Fresh per program: two rigs sharing a section (`PRELUDE`) each submit it
    // in their own encoder, so only a repeat WITHIN one program is the silent
    // double-draw this guards against — a pass/compute name may share both,
    // on purpose (`'flow'` is both a compute and a pass), hence two maps.
    const drawCount = new Map<string, number>();
    const computeCount = new Map<string, number>();
    for (const spec of order) {
      const factsOf = STEP_FACTS[spec.kind] as (s: FrameStepSpec) => StepFacts;
      const facts = factsOf(spec);
      // `expandFrameOrder` drops a render line none of whose passes is present, so
      // its target — Layer-owned, left out with the Layer — is never touched.
      const drops = spec.kind === 'render' && !facts.drawn.some((name) => present.has(name));
      for (const name of facts.drawn) {
        drawCount.set(name, (drawCount.get(name) ?? 0) + 1);
        drawnAnywhere.add(name);
      }
      for (const name of facts.computed) {
        computeCount.set(name, (computeCount.get(name) ?? 0) + 1);
        computedAnywhere.add(name);
      }
      for (const name of facts.captured) captured.add(name);
      if (!drops) {
        touchedTargets.push(...facts.targets);
        sampled.push(...facts.sampled);
      }
    }
    for (const [name, count] of drawCount) {
      if (count > 1) {
        throw new Error(`checkFrameOrder: pass '${name}' is listed on ${count} FRAME_ORDER lines`);
      }
    }
    for (const [name, count] of computeCount) {
      if (count > 1) {
        throw new Error(
          `checkFrameOrder: compute '${name}' is listed on ${count} FRAME_ORDER lines`,
        );
      }
    }
  }

  for (const pass of passes) {
    if (!drawnAnywhere.has(pass.name) && !captured.has(pass.name)) {
      throw new Error(`checkFrameOrder: no FRAME_ORDER line draws contributed pass '${pass.name}'`);
    }
  }

  for (const compute of computes) {
    if (!computedAnywhere.has(compute.name)) {
      throw new Error(
        `checkFrameOrder: no FRAME_ORDER line runs contributed compute '${compute.name}'`,
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
