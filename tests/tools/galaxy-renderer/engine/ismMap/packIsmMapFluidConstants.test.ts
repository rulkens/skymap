/**
 * Parity guard: `milkyWay/ismMap/ismMapFluidStep.wesl`'s `IsmMapFluidConstants`
 * is the offset authority — every field gets a distinct sentinel value, the
 * packer runs, and each sentinel's byte offset in the packed buffer is
 * asserted against the struct the shader actually declares, so a reorder or
 * a dropped field in either the packer or the WGSL struct fails loudly
 * instead of shipping a silently misaligned uniform.
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
  starsDeposit: 4117,
  starsDecay: 4118,
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
    starsDeposit: SENTINEL.starsDeposit,
    starsDecay: SENTINEL.starsDecay,
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

/**
 * Both passes bind the SAME uniform buffers (Pass A = ismMapFluidVelocity.wesl,
 * Pass B = ismMapFluidStep.wesl) but each declares its own copy of
 * `IsmMapFluidConstants`/`IsmMapFluidStepIndex` — WGSL has no cross-file struct
 * import, and every field-doc pair in both files says "kept here for
 * byte-identical layout" rather than pointing at a shared source. The test
 * above only checks the step copy against the TS packer; this checks the two
 * WGSL copies against EACH OTHER, field name, order and byte offset, so a
 * reorder or drop in either file (not just a packer drift) fails loudly
 * instead of shipping two passes that silently disagree on what byte N means.
 */
describe('IsmMapFluidConstants / IsmMapFluidStepIndex parity across ismMapFluidStep.wesl and ismMapFluidVelocity.wesl', () => {
  const STEP_FILE = 'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidStep.wesl';
  const VELOCITY_FILE = 'src/services/gpu/shaders/milkyWay/ismMap/ismMapFluidVelocity.wesl';

  function fieldsOf(file: string, structName: string) {
    return parseWgslStructFields(readShaderSource(file), structName);
  }

  function layoutOf(fields: ReturnType<typeof parseWgslStructFields>) {
    return layoutWgslStruct(fields, (type) => {
      const p = wgslPrimitiveLayout(type);
      if (!p) throw new Error(`field type ${type} has no layout entry`);
      return p;
    });
  }

  // ismMapFluidVelocity.wesl's copy is currently SHORTER than
  // ismMapFluidStep.wesl's (16 fields vs 18 — it never declares
  // starsDeposit/starsDecay, Pass-B-only fields Pass A never reads). A
  // shorter struct still binds fine against the longer packed buffer, so
  // that asymmetry itself isn't a bug; what WOULD be a bug is the two copies
  // disagreeing on the fields they DO share — a reorder, a dropped/renamed
  // member, or a type change anywhere in the shared prefix silently shifts
  // every offset after it.
  it("IsmMapFluidConstants: Pass A's copy matches a PREFIX of Pass B's copy field-for-field", () => {
    const stepFields = fieldsOf(STEP_FILE, 'IsmMapFluidConstants');
    const veloFields = fieldsOf(VELOCITY_FILE, 'IsmMapFluidConstants');
    expect(veloFields).toEqual(stepFields.slice(0, veloFields.length));

    const stepOffsets = layoutOf(stepFields).offsets;
    const veloOffsets = layoutOf(veloFields).offsets;
    for (const [name, offset] of veloOffsets) {
      expect(stepOffsets.get(name), `member ${name}`).toBe(offset);
    }
  });

  it('IsmMapFluidStepIndex has identical fields, order and offsets in both files', () => {
    const stepFields = fieldsOf(STEP_FILE, 'IsmMapFluidStepIndex');
    const veloFields = fieldsOf(VELOCITY_FILE, 'IsmMapFluidStepIndex');
    expect(veloFields).toEqual(stepFields);
    expect([...layoutOf(veloFields).offsets]).toEqual([...layoutOf(stepFields).offsets]);
  });
});
