/**
 * Parity guard: `milkyWay/ismMap/placeDust.wesl`'s `PlaceDustParams` is the
 * offset authority — every field gets a distinct sentinel, the packer runs,
 * and each sentinel's byte offset in the packed buffer (read through
 * whichever typed view its WGSL type maps to) is asserted against the struct
 * the shader actually declares. Same shape as `packIsmMapCdfParams.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  packPlaceDustParams,
  PLACE_DUST_PARAMS_FLOATS,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceDustParams';
import type { PlaceDustParamsInput } from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceDustParams';
import { layoutWgslStruct } from '../../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const fields = parseWgslStructFields(
  readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/placeDust.wesl'),
  'PlaceDustParams',
);
const struct = layoutWgslStruct(fields, (type) => {
  const p = wgslPrimitiveLayout(type);
  if (!p) throw new Error(`PlaceDustParams field type ${type} has no layout entry`);
  return p;
});
const typeOf = new Map(fields.map((f) => [f.name, f.type]));

const SENTINEL = {
  seed: 901,
  count: 902,
  childrenPerComplex: 903,
  dustOffset: 904,
  gridRings: 905,
  gridAz: 906,
  rMin: 9101,
  rMax: 9102,
  complexSpread: 9103,
  elongation: 9104,
  sigmaZComplex: 9105,
  discWeightSum: 9106,
  sizeMin: 9107,
  sizeMax: 9108,
  warpStrength: 9109,
  warpTwist: 9110,
  warpStartRadius: 9111,
  outerRadius: 9112,
} as const;

const input: PlaceDustParamsInput = {
  ...SENTINEL,
  generatorIsFluid: true,
  discSigmaR: [9201, 9202, 9203, 9204],
  extinctionRgb: [9301, 9302, 9303],
};

const buf = packPlaceDustParams(input);
const u32 = new Uint32Array(buf);
const f32 = new Float32Array(buf);

/** Byte offset a sentinel landed at, read through the field's own WGSL-typed view. */
function observed(name: string, value: number): number {
  const view = typeOf.get(name) === 'u32' ? u32 : f32;
  const i = view.indexOf(value);
  expect(i, `sentinel ${value} (${name}) not found`).toBeGreaterThanOrEqual(0);
  expect(view.lastIndexOf(value), `sentinel ${value} (${name}) is not unique`).toBe(i);
  return i * 4;
}

describe('packPlaceDustParams ↔ milkyWay/ismMap/placeDust.wesl PlaceDustParams', () => {
  it('packs a buffer the shader can bind', () => {
    expect(PLACE_DUST_PARAMS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts discSigmaR at the vec4 field offset, in order', () => {
    const offset = struct.offsets.get('discSigmaR');
    expect(offset).toBeDefined();
    expect(observed('discSigmaR', 9201)).toBe(offset);
    expect(observed('discSigmaR', 9202)).toBe(offset! + 4);
    expect(observed('discSigmaR', 9203)).toBe(offset! + 8);
    expect(observed('discSigmaR', 9204)).toBe(offset! + 12);
  });

  it('puts extinctionRgb at the vec3 field offset, in order', () => {
    const offset = struct.offsets.get('extinctionRgb');
    expect(offset).toBeDefined();
    expect(observed('extinctionRgb', 9301)).toBe(offset);
    expect(observed('extinctionRgb', 9302)).toBe(offset! + 4);
    expect(observed('extinctionRgb', 9303)).toBe(offset! + 8);
  });

  it('puts generatorIsFluid (bool -> u32) where the shader declares it', () => {
    const offset = struct.offsets.get('generatorIsFluid')!;
    expect(u32[offset / 4]).toBe(1);
  });

  it('puts every other scalar member the shader declares where it declares it', () => {
    const scalarFields = [...struct.offsets.keys()].filter(
      (name) =>
        name !== 'discSigmaR' &&
        name !== 'extinctionRgb' &&
        name !== 'generatorIsFluid' &&
        !name.startsWith('_pad'),
    );
    expect(scalarFields.sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const member of scalarFields) {
      const offset = struct.offsets.get(member)!;
      expect(observed(member, SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(
        offset,
      );
    }
  });
});
