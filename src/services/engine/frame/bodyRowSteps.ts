/**
 * bodyRowSteps — one foreground body row, split at its `DepthSampledPasses`
 * marker (at most one): the marker's passes sample the depth the passes before
 * it wrote, so they take a depthless step and the rest of the row reloads depth;
 * those two get their own timing slots — the row's group key bills only the first.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { DepthSampledPasses } from '../../../@types/engine/frame/DepthSampledPasses';
import type { ForegroundStepSpec } from '../../../@types/engine/frame/ForegroundStepSpec';
import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import { resolvePassNames } from './resolvePassNames';

export function bodyRowSteps(
  spec: ForegroundStepSpec,
  slab: number,
  passes: readonly ContentPass[],
): readonly FrameStep[] {
  // Empty segments are left to `expandFrameOrder`'s `draws` filter.
  const step = (
    entries: readonly (string | DepthSampledPasses)[],
    depth: 'clear' | 'load' | 'sample',
    slot?: string,
  ): FrameStep => {
    if (entries.some((entry) => typeof entry !== 'string')) {
      throw new Error('bodyRowSteps: a body roster takes at most one sampleDepth marker');
    }
    return {
      kind: 'render',
      target: spec.target,
      slab,
      depth,
      passes: resolvePassNames(entries as readonly string[], passes),
      ...(slot === undefined ? {} : { slot }),
    };
  };
  const roster = spec.bodyPasses;
  const at = roster.findIndex((entry) => typeof entry !== 'string');
  if (at === -1) return [step(roster, 'clear')];
  return [
    step(roster.slice(0, at), 'clear'),
    step((roster[at] as DepthSampledPasses).sampleDepth, 'sample', 'SAMPLE_DEPTH'),
    step(roster.slice(at + 1), 'load', 'AFTER_DEPTH'),
  ];
}
