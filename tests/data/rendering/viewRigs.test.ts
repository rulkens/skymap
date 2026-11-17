import { describe, expect, it } from 'vitest';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';
import { FRAME_ORDER } from '../../../src/services/engine/frame/frameOrder';
import { COSMO, NEAR0 } from '../../../src/services/engine/frame/slabs';

describe('VIEW_RIGS', () => {
  it('mono program draws the same steps in the same order as before the overlays builder', () => {
    const monoSteps = VIEW_RIGS.mono.program.flatMap((section) => section.steps);
    expect(monoSteps).toEqual(FRAME_ORDER);
    // The overlay tail exactly as ee682ac07 authored it: two swap passes, rings first.
    expect(monoSteps.slice(-2)).toEqual([
      {
        kind: 'render',
        target: 'swap',
        slab: COSMO,
        depth: { sample: 'foreground:0' },
        passes: ['selection-ring', 'labels-cosmo'],
      },
      {
        kind: 'render',
        target: 'swap',
        slab: NEAR0,
        depth: { sample: 'foreground:0' },
        passes: ['near0-selection-ring', 'labels-near', 'clip-path-debug'],
      },
    ]);
  });
});
