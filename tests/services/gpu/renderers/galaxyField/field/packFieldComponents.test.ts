/**
 * Parity guard for `packFieldComponents`'s `[4i+2].w` lane — `io.wesl`'s
 * `comps` doc names it `textureWeight`, read by `splat.wesl`'s
 * `hiiNoiseTerm` mix. Same sentinel discipline `packFieldHeaderUniforms.
 * test.ts` uses for the header: a wrong index ships silently, so this pins
 * the byte position directly rather than trusting the source to stay in sync.
 */
import { describe, expect, it } from 'vitest';

import {
  FIELD_COMPONENT_FLOATS,
  packFieldComponents,
} from '../../../../../../src/services/gpu/renderers/galaxyField/field/packFieldUniforms';
import type { GalaxyFieldComponent } from '../../../../../../src/@types/galaxy/GalaxyFieldComponent';

const BASE: GalaxyFieldComponent = {
  amplitude: 1000,
  invCovDiagonal: [1001, 1002, 1003],
  invCovOffDiagonal: [1004, 1005, 1006],
  color: [1007, 1008, 1009],
  center: [1010, 1011, 1012],
  boundRadius: 1013,
};

describe('packFieldComponents ↔ milkyWay/field/io.wesl comps layout', () => {
  it('packs textureWeight into [4i+2].w', () => {
    // 0.5, not an arbitrary decimal: f32 represents it exactly, so this pins
    // the byte position rather than tripping over binary rounding.
    const packed = packFieldComponents([{ ...BASE, textureWeight: 0.5 }]);
    expect(packed).toHaveLength(FIELD_COMPONENT_FLOATS);
    expect(packed[4 * 2 + 3]).toBe(0.5);
  });

  it('defaults textureWeight to 0 when the component omits it', () => {
    const packed = packFieldComponents([BASE]);
    expect(packed[4 * 2 + 3]).toBe(0);
  });

  it('leaves the surrounding lanes untouched by the new field', () => {
    const packed = packFieldComponents([{ ...BASE, textureWeight: 0.5 }]);
    expect(packed[4 * 2]).toBe(1007); // color.r
    expect(packed[4 * 2 + 1]).toBe(1008); // color.g
    expect(packed[4 * 2 + 2]).toBe(1009); // color.b
    expect(packed[4 * 3]).toBe(1010); // center.x, next record's own lane
  });

  it('packs starsWeight into [4i+3].w', () => {
    const packed = packFieldComponents([{ ...BASE, starsWeight: 0.5 }]);
    expect(packed[4 * 3 + 3]).toBe(0.5);
  });

  it('defaults starsWeight to 0 when the component omits it', () => {
    const packed = packFieldComponents([BASE]);
    expect(packed[4 * 3 + 3]).toBe(0);
  });
});
