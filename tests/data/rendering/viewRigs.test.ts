import { describe, expect, it } from 'vitest';
import type { FrameStepSpec } from '../../../src/@types/engine/frame/FrameStepSpec';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';
import { FRAME_ORDER } from '../../../src/services/engine/frame/frameOrder';

const renderPasses = (steps: readonly FrameStepSpec[]) =>
  steps.flatMap((step) => (step.kind === 'render' ? step.passes : []));

describe('VIEW_RIGS', () => {
  it('mono program draws the same steps in the same order as FRAME_ORDER', () => {
    const monoSteps = VIEW_RIGS.mono.program.flatMap((section) => section.steps);
    expect(monoSteps).toEqual(FRAME_ORDER);
    // Every overlay pass of the pre-split OVERLAYS, rings and debug lines ahead of labels.
    expect(renderPasses(monoSteps).slice(-6)).toEqual([
      'selection-ring',
      'near0-selection-ring',
      'clip-path-debug',
      'marker-lines',
      'labels-cosmo',
      'labels-near',
    ]);
  });
});
