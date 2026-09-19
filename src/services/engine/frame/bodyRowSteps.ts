/**
 * bodyRowSteps — one foreground body row, split at each `DepthSampledPasses`
 * marker: a marker's passes sample the depth the passes before it wrote, so they
 * take a depthless step and the rest of the row reloads depth. Each later
 * segment gets its own timing slot — the row's group key bills only the first.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ForegroundStepSpec } from '../../../@types/engine/frame/ForegroundStepSpec';
import type { FrameStep } from '../../../@types/engine/frame/FrameStep';
import { resolvePassNames } from './resolvePassNames';

export function bodyRowSteps(
  spec: ForegroundStepSpec,
  slab: number,
  passes: readonly ContentPass[],
): readonly FrameStep[] {
  const steps: FrameStep[] = [];
  const emit = (names: readonly string[], depth: 'clear' | 'load' | 'sample', slot?: string) => {
    if (names.length === 0) return;
    steps.push({
      kind: 'render',
      target: spec.target,
      slab,
      depth,
      passes: resolvePassNames(names, passes),
      ...(slot === undefined ? {} : { slot }),
    });
  };
  let run: string[] = [];
  let runDepth: 'clear' | 'load' = 'clear';
  let runSlot: string | undefined;
  let marker = 0;
  for (const entry of spec.bodyPasses) {
    if (typeof entry === 'string') {
      run.push(entry);
      continue;
    }
    emit(run, runDepth, runSlot);
    emit(entry.sampleDepth, 'sample', `SAMPLE_DEPTH_${marker}`);
    run = [];
    runDepth = 'load';
    runSlot = `AFTER_DEPTH_${marker}`;
    marker += 1;
  }
  emit(run, runDepth, runSlot);
  return steps;
}
