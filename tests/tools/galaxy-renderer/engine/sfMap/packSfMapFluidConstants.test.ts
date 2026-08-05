/**
 * Parity guard: `milkyWay/sfMap/sfMapFluidStep.wesl`'s `SfMapFluidConstants`
 * is the offset authority — same sentinel-search idiom as
 * `packSfMapAutomatonConstants.test.ts`, see that file's header for why.
 */
import { describe, expect, it } from 'vitest';

import {
  packSfMapFluidConstants,
  SF_MAP_FLUID_CONSTANTS_FLOATS,
} from '../../../../../tools/galaxy-renderer/src/engine/sfMap/packSfMapFluidConstants';
import type { SfMapFluidConstantsInput } from '../../../../../tools/galaxy-renderer/src/engine/sfMap/packSfMapFluidConstants';
import { layoutWgslStruct } from '../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/sfMap/sfMapFluidStep.wesl'),
    'SfMapFluidConstants',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`SfMapFluidConstants field type ${type} has no layout entry`);
    return p;
  },
);

const SENTINEL = {
  rMin: 4101,
  rMax: 4102,
  corotationRadius: 4103,
  shearStrength: 4104,
  gasRegen: 4105,
  emaRate: 4106,
  curlStrength: 4107,
  curlScale: 4108,
  impulseDuration: 4109,
  armGather: 4110,
  diffusion: 4111,
} as const;

const input: SfMapFluidConstantsInput = {
  grid: { rMin: SENTINEL.rMin, rMax: SENTINEL.rMax },
  fluid: {
    steps: 4201,
    eventRate: 4202,
    impulseStrength: 4203,
    impulseDuration: SENTINEL.impulseDuration,
    radiusScale: 4204,
    curlStrength: SENTINEL.curlStrength,
    curlScale: SENTINEL.curlScale,
    shearStrength: SENTINEL.shearStrength,
    corotationRadius: SENTINEL.corotationRadius,
    gasRegen: SENTINEL.gasRegen,
    emaRate: SENTINEL.emaRate,
    armGather: SENTINEL.armGather,
    diffusion: SENTINEL.diffusion,
  },
};

const packed = packSfMapFluidConstants(input);

/** Byte offset a sentinel landed at (asserting it landed exactly once). */
function observed(value: number): number {
  const i = packed.indexOf(value);
  expect(i, `sentinel ${value} not found`).toBeGreaterThanOrEqual(0);
  expect(packed.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(i);
  return i * 4;
}

describe('packSfMapFluidConstants ↔ milkyWay/sfMap/sfMapFluidStep.wesl SfMapFluidConstants', () => {
  it('packs a buffer the shader can bind', () => {
    expect(SF_MAP_FLUID_CONSTANTS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts every member the shader declares where it declares it', () => {
    expect([...struct.offsets.keys()].sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const [member, offset] of struct.offsets) {
      expect(observed(SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(offset);
    }
  });
});
