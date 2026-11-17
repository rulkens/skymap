import { describe, expect, it } from 'vitest';

import { constellationLabelSource } from '../../../../../src/layers/constellations/figures/present/constellationLabelSource';
import type { ConstellationsRuntime } from '../../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../../../src/data/renderOrigin';

const ARTIFACT = {
  version: 1 as const,
  constellations: [{ name: 'Orion', labelAnchorPc: [200, -50, 100] as Vec3, segments: [] }],
};
const runtimeOf = (value: typeof ARTIFACT | undefined) =>
  ({
    slot: { committed: () => (value === undefined ? undefined : { kind: 'ready', value }) },
  }) as unknown as ConstellationsRuntime;
const STATE = {} as EngineState;

describe('constellationLabelSource', () => {
  it('constellations describe their labels', () => {
    const source = constellationLabelSource(runtimeOf(ARTIFACT));
    // The committed artifact is the change signal: a released slot drops every name.
    expect(source.changes!(STATE)).toBe(ARTIFACT);
    expect(constellationLabelSource(runtimeOf(undefined)).items(STATE)).toEqual([]);

    const orion = source.describe(source.items(STATE)[0]!, 0)!;
    expect(orion.text).toBe('Orion');
    const pc = SCALE_UNITS.PC_TO_MPC;
    const position = orion.position as Vec3;
    expect(position[0]).toBeCloseTo(200 * pc - RENDER_ORIGIN_MPC[0], 15);
    expect(position[1]).toBeCloseTo(-50 * pc - RENDER_ORIGIN_MPC[1], 15);
    expect(position[2]).toBeCloseTo(100 * pc - RENDER_ORIGIN_MPC[2], 15);
    expect(orion.pick).toBeUndefined();
    expect(orion.subjectRadiusMpc).toBeUndefined();
  });
});
