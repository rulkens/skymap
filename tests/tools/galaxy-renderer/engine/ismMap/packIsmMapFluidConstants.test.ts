/**
 * Parity guard: `milkyWay/ismMap/ismMapFluidStep.wesl`'s `IsmMapFluidConstants`
 * is the offset authority — same sentinel-search idiom as
 * `packIsmMapAutomatonConstants.test.ts`, see that file's header for why.
 */
import { describe, expect, it } from 'vitest';

import {
  packIsmMapFluidConstants,
  ISM_MAP_FLUID_CONSTANTS_FLOATS,
} from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packIsmMapFluidConstants';
import type { IsmMapFluidConstantsInput } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packIsmMapFluidConstants';
import { layoutWgslStruct } from '../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl'),
    'IsmMapFluidConstants',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`IsmMapFluidConstants field type ${type} has no layout entry`);
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
  armDrag: 4112,
  gasScaleLength: 4113,
  gasFloor: 4114,
  laneBias: 4115,
  gatherOffset: 4116,
} as const;

const input: IsmMapFluidConstantsInput = {
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
    armDrag: SENTINEL.armDrag,
    gasScaleLength: SENTINEL.gasScaleLength,
    gasFloor: SENTINEL.gasFloor,
    laneBias: SENTINEL.laneBias,
    gatherOffset: SENTINEL.gatherOffset,
    // CPU-only (galaxyIsmMapFluidEvents.ts) — no UBO member, not part of this
    // parity guard's sentinel set.
    eventArmBias: 0,
  },
};

const packed = packIsmMapFluidConstants(input);

/** Byte offset a sentinel landed at (asserting it landed exactly once). */
function observed(value: number): number {
  const i = packed.indexOf(value);
  expect(i, `sentinel ${value} not found`).toBeGreaterThanOrEqual(0);
  expect(packed.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(i);
  return i * 4;
}

describe('packIsmMapFluidConstants ↔ milkyWay/ismMap/ismMapFluidStep.wesl IsmMapFluidConstants', () => {
  it('packs a buffer the shader can bind', () => {
    expect(ISM_MAP_FLUID_CONSTANTS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts every member the shader declares where it declares it', () => {
    expect([...struct.offsets.keys()].sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const [member, offset] of struct.offsets) {
      expect(observed(SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(offset);
    }
  });
});
