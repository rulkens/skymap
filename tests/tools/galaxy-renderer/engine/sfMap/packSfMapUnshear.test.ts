/**
 * Parity guard: `milkyWayField/sfMapPack.wesl`'s `SfMapUnshear` is the offset
 * authority, and `packSfMapUnshear` writes raw indices into a Float32Array — a
 * wrong index throws nothing, it just ships garbage, and on WebKit a mislaid
 * uniform drops the frame with no error at all. Neither home is restated here:
 * the WESL offsets are computed from the scraped struct, and the TS offsets are
 * OBSERVED by finding unique sentinels in the packed buffer, so reordering
 * either side fails the comparison.
 */
import { describe, expect, it } from 'vitest';

import {
  packSfMapUnshear,
  SF_MAP_UNSHEAR_FLOATS,
} from '../../../../../tools/galaxy-renderer/src/engine/sfMap/packSfMapUnshear';
import type { SfMapUnshearInput } from '../../../../../tools/galaxy-renderer/src/engine/sfMap/packSfMapUnshear';
import { layoutWgslStruct } from '../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWayField/sfMapPack.wesl'),
    'SfMapUnshear',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`SfMapUnshear field type ${type} has no layout entry`);
    return p;
  },
);

// Distinct integers, exactly representable in f32, none of them 0 — so every
// sentinel lands in exactly one place and no padding lane can match one. Keyed
// by SHADER member name; the input below wires each to the field it comes from,
// which is the mapping under test.
const SENTINEL = {
  rMin: 4101,
  rMax: 4102,
  corotationRadius: 4103,
  shearRate: 4104,
  totalShiftSteps: 4105,
} as const;

const input: SfMapUnshearInput = {
  grid: { rMin: SENTINEL.rMin, rMax: SENTINEL.rMax },
  sfMap: {
    corotationRadius: SENTINEL.corotationRadius,
    shearRate: SENTINEL.shearRate,
  },
  totalShiftSteps: SENTINEL.totalShiftSteps,
};

const packed = packSfMapUnshear(input);

/** Byte offset a sentinel landed at (asserting it landed exactly once). */
function observed(value: number): number {
  const i = packed.indexOf(value);
  expect(i, `sentinel ${value} not found`).toBeGreaterThanOrEqual(0);
  expect(packed.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(i);
  return i * 4;
}

describe('packSfMapUnshear ↔ milkyWayField/sfMapPack.wesl SfMapUnshear', () => {
  it('packs a buffer the shader can bind', () => {
    // The floor is the struct's own size, which is what Dawn reports as this
    // binding's minBindingSize (20 for the 5 f32 today — measured with
    // probeGpuErrors, NOT rounded up to 16 as the uniform address space's
    // alignment rule might suggest). Undershooting it fails createBindGroup,
    // so the pack pass silently stops running.
    expect(SF_MAP_UNSHEAR_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts every member the shader declares where it declares it', () => {
    expect([...struct.offsets.keys()].sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const [member, offset] of struct.offsets) {
      expect(observed(SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(offset);
    }
  });
});
