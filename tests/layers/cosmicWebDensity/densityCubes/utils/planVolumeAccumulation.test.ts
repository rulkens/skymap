import { describe, it, expect } from 'vitest';
import type { Tier } from '../../../../../packages/shared/src/@types/data/Tier';
import type { VolumeAccumulationPlan } from '../../../../../src/layers/cosmicWebDensity/@types/VolumeAccumulationPlan';
import { planVolumeAccumulation } from '../../../../../src/layers/cosmicWebDensity/densityCubes/utils/planVolumeAccumulation';

const prevAt = (sample: number, inputsKey: string | null = 'k'): VolumeAccumulationPlan => ({
  inputsKey,
  sample,
  restart: sample === 1,
  draw: true,
  inputs: { jitterIndex: 0, steps: 128, weight: 1 / sample },
});

const plan = (
  prev: VolumeAccumulationPlan | undefined,
  stillFrames: number,
  inputsKey: string | null = 'k',
  tier: Tier = 'medium',
  frameIndex = 100,
) => planVolumeAccumulation(prev, { stillFrames }, { tier, frameIndex }, inputsKey);

describe('planVolumeAccumulation', () => {
  it('a moving view restarts and does not vote loading', () => {
    const r = plan(prevAt(5), 0);
    expect(r.value).toMatchObject({ sample: 1, restart: true, draw: true });
    expect(r.value.inputs.weight).toBe(1);
    expect(r.awake).toBe(true);
    expect(r.loading).toBe(false);
  });

  it('no previous value restarts, voting loading at rest', () => {
    const r = plan(undefined, 3);
    expect(r.value).toMatchObject({ sample: 1, restart: true, draw: true });
    expect(r.loading).toBe(true);
  });

  it('a changed inputs key restarts at rest', () => {
    const r = plan(prevAt(9, 'old'), 3, 'new');
    expect(r.value).toMatchObject({ sample: 1, restart: true, draw: true, inputsKey: 'new' });
    expect(r.loading).toBe(true);
  });

  it('still and unchanged counts up at weight 1/n', () => {
    const r = plan(prevAt(3), 4);
    expect(r.value).toMatchObject({ sample: 4, restart: false, draw: true });
    expect(r.value.inputs.weight).toBe(0.25);
    expect(r.awake).toBe(true);
    expect(r.loading).toBe(true);
  });

  it('the cap-th sample draws and stops voting; the next frame holds without drawing', () => {
    const last = plan(prevAt(15), 4);
    expect(last.value).toMatchObject({ sample: 16, restart: false, draw: true });
    expect(last.awake).toBe(false);
    expect(last.loading).toBe(false);

    const held = plan(last.value, 5);
    expect(held.value).toMatchObject({ sample: 16, restart: false, draw: false });
    expect(held.awake).toBe(false);
    expect(held.loading).toBe(false);
  });

  it('small caps at 8 with 64 steps', () => {
    const last = plan(prevAt(7), 4, 'k', 'small');
    expect(last.value).toMatchObject({ sample: 8, draw: true });
    expect(last.value.inputs.steps).toBe(64);
    expect(plan(last.value, 5, 'k', 'small').value.draw).toBe(false);
  });

  it('the jitter index is the frame index, moving or still', () => {
    // Indexing by the sample number instead froze the grain while moving: every moving frame
    // is sample 1, so it would march the same jitter slice frame after frame.
    expect(plan(prevAt(5), 0, 'k', 'medium', 1234).value.inputs.jitterIndex).toBe(1234);
    expect(plan(prevAt(5), 4, 'k', 'medium', 1234).value.inputs.jitterIndex).toBe(1234);
  });

  it('nothing live: no draw and no votes, and going live restarts', () => {
    const off = plan(prevAt(4), 4, null);
    expect(off.value.draw).toBe(false);
    expect(off.awake).toBe(false);
    expect(off.loading).toBe(false);

    const on = plan(off.value, 5, 'k');
    expect(on.value).toMatchObject({ sample: 1, restart: true, draw: true });
  });
});
