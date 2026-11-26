/** Each caption names its sphere and sits on it: anchored at Earth's centre, sized by the radius. */

import { describe, expect, it } from 'vitest';

import { lightTimeLabelSource } from '../../../../../src/layers/lightTime/spheres/present/lightTimeLabelSource';
import { LIGHT_TIME_SPHERES } from '../../../../../src/layers/lightTime/spheres/data/lightTimeSpheres';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

describe('lightTimeLabelSource', () => {
  it('light-time describes its labels', () => {
    const source = lightTimeLabelSource();
    const labels = source.items({} as EngineState).map((item, i) => source.describe(item, i)!);
    expect(labels).toHaveLength(LIGHT_TIME_SPHERES.length);
    const day = labels[3]!;
    expect(day.text).toBe('1 light-day');
    expect(day.position).toEqual({ anchorId: 'earth' });
    expect(day.subjectRadiusMpc).toBe(LIGHT_TIME_SPHERES[3]!.radiusMpc);
    expect(day.pick).toBeUndefined();
  });
});
