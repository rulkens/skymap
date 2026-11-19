/**
 * The dome program's occlusion-mask chain, as authored order: each face writes its mask
 * after its foreground, the resample gathers the five, and only then may anything read
 * the result. `checkFrameOrder` proves names and targets; it does not prove order.
 */
import { describe, expect, it } from 'vitest';

import type { FrameStepSpec } from '../../../src/@types/engine/frame/FrameStepSpec';
import type { RenderStepSpec } from '../../../src/@types/engine/frame/RenderStepSpec';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';

const domeSteps: readonly FrameStepSpec[] = VIEW_RIGS.dome.program.flatMap(
  (section) => section.steps,
);
const renderLineOf = (pass: string): RenderStepSpec =>
  domeSteps.find(
    (step): step is RenderStepSpec => step.kind === 'render' && step.passes.includes(pass),
  )!;

describe('VIEW_RIGS.dome', () => {
  it('the dome program writes the occlusion mask before the overlays read it', () => {
    const faceMask = renderLineOf('occlusion-mask');
    const resample = renderLineOf('dome-occlusion-resample');
    const foreground = domeSteps.findIndex((step) => step.kind === 'foreground');

    expect(domeSteps.indexOf(faceMask)).toBeGreaterThan(foreground);
    expect(faceMask.target).toBe('dome-cube-occlusion');
    // Without the declaration the distance channel reads "no surface" everywhere.
    expect(faceMask.depth).toEqual({ sample: 'foreground:0' });
    expect(domeSteps.indexOf(resample)).toBeGreaterThan(domeSteps.indexOf(faceMask));
    expect(resample.target).toBe('dome-occlusion');
  });
});
