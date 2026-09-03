/**
 * The dust RESERVATION is the whole point of this pack: `place:dust` writes
 * that tail on the GPU, so a tail sized short (or written non-zero) draws
 * garbage quads no CPU-side assertion downstream would catch.
 */
import { describe, expect, it } from 'vitest';

import { packFieldSlices } from '../../../../../../src/services/gpu/renderers/galaxyField/field/packFieldSlices';
import { FIELD_COMPONENT_FLOATS } from '../../../../../../src/services/gpu/renderers/galaxyField/field/packFieldUniforms';
import type { GalaxyFieldComponent } from '../../../../../../src/@types/galaxy/GalaxyFieldComponent';

const component = (amplitude: number): GalaxyFieldComponent => ({
  amplitude,
  invCovDiagonal: [1, 1, 1],
  invCovOffDiagonal: [0, 0, 0],
  color: [1, 1, 1],
  center: [0, 0, 0],
  boundRadius: 1,
});

describe('packFieldSlices', () => {
  const primary = [component(1), component(2)];
  const extras = [[component(3)], [component(4), component(5)]];

  it('counts every extra into emission, and only the central galaxy into primary', () => {
    const { counts } = packFieldSlices(primary, extras, 7);
    expect(counts).toEqual({ emission: 5, primary: 2, dust: 7 });
  });

  it('sizes a zero-filled dust tail after the last emission component', () => {
    const dustCount = 3;
    const { packed } = packFieldSlices(primary, extras, dustCount);
    expect(packed).toHaveLength((5 + dustCount) * FIELD_COMPONENT_FLOATS);
    // Amplitude is [4i+0].w — the lane that makes a component draw at all.
    expect(packed[3]).toBe(1);
    expect(packed.slice(5 * FIELD_COMPONENT_FLOATS).every((v) => v === 0)).toBe(true);
  });

  it('packs no tail at all when the dust count is zero', () => {
    const { packed } = packFieldSlices(primary, extras, 0);
    expect(packed).toHaveLength(5 * FIELD_COMPONENT_FLOATS);
  });
});
