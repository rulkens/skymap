/**
 * The rigs' programs as authored data: the dome's occlusion-mask chain in order (each
 * face writes its mask after its foreground, the resample gathers the five, the labels
 * read the result), and mono's overlays held to what they were before the dome got any.
 */
import { describe, expect, it } from 'vitest';

import type { FrameStepSpec } from '../../../src/@types/engine/frame/FrameStepSpec';
import type { RenderStepSpec } from '../../../src/@types/engine/frame/RenderStepSpec';
import type { ViewRig } from '../../../src/@types/engine/frame/ViewRig';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';
import { COSMO, NEAR0 } from '../../../src/services/engine/frame/slabs';

const domeSteps: readonly FrameStepSpec[] = VIEW_RIGS.dome.program.flatMap(
  (section) => section.steps,
);
const renderLineOf = (pass: string): RenderStepSpec =>
  domeSteps.find(
    (step): step is RenderStepSpec => step.kind === 'render' && step.passes.includes(pass),
  )!;

const labelLines = (rig: ViewRig): readonly RenderStepSpec[] =>
  rig.program
    .flatMap((section) => section.steps)
    .filter(
      (step): step is RenderStepSpec =>
        step.kind === 'render' && step.passes.some((pass) => pass.startsWith('labels-')),
    )
    .filter((step) => step.target === 'swap');

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
    for (const reader of labelLines(VIEW_RIGS.dome)) {
      expect(domeSteps.indexOf(reader)).toBeGreaterThan(domeSteps.indexOf(resample));
    }
  });

  it('the dome program ends with the label passes and no selection ring', () => {
    const overlays = VIEW_RIGS.dome.program.at(-1)!;
    expect(overlays.scope).toBe('once');
    expect(
      overlays.steps.map((step) => (step.kind === 'render' ? step.passes : step.kind)),
    ).toEqual([['labels-cosmo'], ['labels-near'], ['letterbox']]);
    expect(VIEW_RIGS.dome.outputProjection).toBe('equidistant');
  });

  // On the dome `foreground:0` holds the last face alone when the overlays draw: a label
  // step that binds it hides captions behind a body that is somewhere else on the dome.
  it("the dome's label steps sample the occlusion mask, never foreground:0", () => {
    const lines = labelLines(VIEW_RIGS.dome);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.mask).toEqual({ sample: 'dome-occlusion' });
      expect(line.depth).toBeUndefined();
    }
  });
});

describe('VIEW_RIGS.mono', () => {
  it("mono's overlays are unchanged", () => {
    expect(VIEW_RIGS.mono.program.at(-1)!.steps).toEqual([
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
      { kind: 'render', target: 'swap', slab: COSMO, passes: ['letterbox'], slot: 'LETTERBOX' },
    ]);
    expect(VIEW_RIGS.mono.outputProjection).toBe('pinhole');
  });
});
