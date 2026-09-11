/**
 * expandFrameOrder — `FRAME_ORDER` plus this frame's own lists into the step
 * sequence the executor walks. The three expanding kinds (`capture`,
 * `foreground`, `lens`) are what the frame used to pass as separate program
 * parameters; each can expand to nothing, which is the lens's zero-dispatch
 * guarantee.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { ToneMap } from '../../../@types/rendering/ToneMap';
import { COSMO, NEAR0, isBodySlabIndex } from './slabs';

export type FrameInputs = {
  readonly tone: ToneMap;
  readonly bloomEnabled: boolean;
  readonly foregroundChain: readonly number[];
  readonly skyCubemapFacesToCapture: readonly CubeFace[];
  readonly lensBodySlabs: readonly number[];
};

type ExpandStep<K extends FrameStepSpec['kind']> = (
  spec: Extract<FrameStepSpec, { readonly kind: K }>,
  passes: readonly ContentPass[],
  frame: FrameInputs,
) => readonly FrameStep[];

/** Authored names → the contributed rows, in authored order; absent names drop. */
function resolve(names: readonly string[], passes: readonly ContentPass[]): readonly ContentPass[] {
  return names
    .map((name) => passes.find((pass) => pass.name === name))
    .filter((pass): pass is ContentPass => pass !== undefined);
}

/**
 * Dispatch is a TABLE, not a switch: `executeFrame` advertises itself as the
 * frame's only switch, and an eight-arm sibling would make that false.
 */
const EXPAND_STEP: { [K in FrameStepSpec['kind']]: ExpandStep<K> } = {
  compute: (spec) => [{ kind: 'compute', name: spec.name }],
  capture: (spec, passes, frame) =>
    frame.skyCubemapFacesToCapture.flatMap((face): readonly FrameStep[] => [
      {
        kind: 'render',
        target: spec.target,
        slab: COSMO,
        face,
        passes: resolve(spec.cosmoPasses, passes),
      },
      {
        kind: 'render',
        target: spec.target,
        slab: NEAR0,
        face,
        passes: resolve(spec.near0Passes, passes),
      },
    ]),
  render: (spec, passes) => [
    {
      kind: 'render',
      target: spec.target,
      slab: spec.slab,
      passes: resolve(spec.passes, passes),
      ...(spec.slot === undefined ? {} : { slot: spec.slot }),
    },
  ],
  foreground: (spec, passes, frame) =>
    frame.foregroundChain.map((slab) => ({
      kind: 'render',
      target: spec.target,
      slab,
      depthLoad: 'clear',
      passes: resolve(isBodySlabIndex(slab) ? spec.bodyPasses : spec.near0Passes, passes),
    })),
  lens: (spec, passes, frame) =>
    frame.lensBodySlabs.map((slab) => ({
      kind: 'render',
      target: spec.target,
      slab,
      passes: resolve(spec.passes, passes),
    })),
  composite: (spec) => [
    {
      kind: 'composite',
      step: { source: spec.source, dest: spec.dest, blend: 'over', tone: null },
    },
  ],
  bloom: (_spec, _passes, frame) => (frame.bloomEnabled ? [{ kind: 'bloom' }] : []),
  tonemap: (spec, _passes, frame) => [
    {
      kind: 'composite',
      step: { source: spec.source, dest: spec.dest, blend: 'replace', tone: frame.tone },
    },
  ],
};

/** A render step with nothing left to draw never opens a pass. */
function draws(step: FrameStep): boolean {
  return step.kind !== 'render' || (step.passes?.length ?? 0) > 0;
}

/**
 * Two render steps a merge may fold together: everything the pass descriptor is
 * built from must agree, so only the roster differs. `depthLoad` is in the key
 * because folding two depth-CLEARING foreground rows would drop a clear.
 */
function sameGroup(a: FrameStep, b: FrameStep): boolean {
  return (
    a.kind === 'render' &&
    b.kind === 'render' &&
    a.target === b.target &&
    a.slab === b.slab &&
    a.face === b.face &&
    a.depthLoad === b.depthLoad
  );
}

/**
 * The price of authoring the roster around the lens: outside the fade band the
 * lens line emits nothing and the `(hdr, NEAR0)` roster would pay a pass
 * boundary on an rgba16float target every frame. Consecutive steps sharing a
 * group fold back into one, keeping the FIRST line's timing slot — so the
 * merged step bills the bare group key, as it did before the split.
 */
function mergeAdjacent(steps: readonly FrameStep[]): readonly FrameStep[] {
  const merged: FrameStep[] = [];
  for (const step of steps) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined &&
      sameGroup(previous, step) &&
      previous.kind === 'render' &&
      step.kind === 'render'
    ) {
      merged[merged.length - 1] = {
        ...previous,
        passes: [...(previous.passes ?? []), ...(step.passes ?? [])],
      };
      continue;
    }
    merged.push(step);
  }
  return merged;
}

export function expandFrameOrder(
  order: readonly FrameStepSpec[],
  passes: readonly ContentPass[],
  frame: FrameInputs,
): readonly FrameStep[] {
  const steps: FrameStep[] = [];
  for (const spec of order) {
    // The table's rows self-narrow; the lookup itself cannot, so it is cast once.
    const expand = EXPAND_STEP[spec.kind] as ExpandStep<FrameStepSpec['kind']>;
    steps.push(...expand(spec as never, passes, frame));
  }
  return mergeAdjacent(steps.filter(draws));
}
