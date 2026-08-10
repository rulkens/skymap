/**
 * Parity guard: `milkyWay/field/records.wesl`'s `FieldComponentRec` is the
 * offset authority for the `comps` storage array (`io.wesl`) — every field
 * gets a distinct sentinel value, `packFieldComponents` runs, and each
 * sentinel's byte offset in the packed buffer is asserted against the
 * struct the shader actually declares, so a reorder or a dropped field in
 * either the packer or the WGSL struct fails loudly instead of shipping a
 * silently misaligned `comps` read.
 */
import { describe, expect, it } from 'vitest';

import {
  packFieldComponents,
  FIELD_COMPONENT_FLOATS,
} from '../../../../tools/galaxy-renderer/src/engine/field/packFieldUniforms';
import type { GalaxyFieldComponent } from '../../../../src/@types/galaxy/GalaxyFieldComponent';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/field/records.wesl'),
    'FieldComponentRec',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`FieldComponentRec field type ${type} has no layout entry`);
    return p;
  },
);

// Each vec3 field's sentinel rides its .x lane — a vec3 has no named
// sub-members for parseWgslStructFields to check offsets against, so this
// asserts where the FIELD starts, not its internal x/y/z order (unchecked
// because a WGSL vec3 has no other order to have).
const SENTINEL = {
  invCovDiagonal: 5101,
  amplitude: 5102,
  invCovOffDiagonal: 5103,
  boundRadius: 5104,
  color: 5105,
  textureWeight: 5106,
  center: 5107,
  starsWeight: 5108,
} as const;

const component: GalaxyFieldComponent = {
  invCovDiagonal: [SENTINEL.invCovDiagonal, 0.11, 0.22],
  amplitude: SENTINEL.amplitude,
  invCovOffDiagonal: [SENTINEL.invCovOffDiagonal, 0.33, 0.44],
  boundRadius: SENTINEL.boundRadius,
  color: [SENTINEL.color, 0.55, 0.66],
  textureWeight: SENTINEL.textureWeight,
  center: [SENTINEL.center, 0.77, 0.88],
  starsWeight: SENTINEL.starsWeight,
};

const packed = packFieldComponents([component]);

/** Byte offset a sentinel landed at (asserting it landed exactly once). */
function observed(value: number): number {
  const i = packed.indexOf(value);
  expect(i, `sentinel ${value} not found`).toBeGreaterThanOrEqual(0);
  expect(packed.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(i);
  return i * 4;
}

describe('packFieldComponents ↔ milkyWay/field/records.wesl FieldComponentRec', () => {
  it('packs a buffer the shader can bind', () => {
    expect(FIELD_COMPONENT_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts every member the struct declares where it declares it', () => {
    expect([...struct.offsets.keys()].sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const [member, offset] of struct.offsets) {
      expect(observed(SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(offset);
    }
  });
});
