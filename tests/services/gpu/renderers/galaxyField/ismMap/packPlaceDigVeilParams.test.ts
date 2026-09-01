/**
 * Parity guard: `milkyWay/ismMap/placeDigVeil.wesl`'s `PlaceDigVeilParams` is
 * the offset authority — every field gets a distinct sentinel, the packer
 * runs, and each sentinel's byte offset in the packed buffer (read through
 * whichever typed view its WGSL type maps to) is asserted against the struct
 * the shader actually declares. Same shape as `packIsmMapCdfParams.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  packPlaceDigVeilParams,
  PLACE_DIG_VEIL_PARAMS_FLOATS,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceDigVeilParams';
import type { PlaceDigVeilParamsInput } from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceDigVeilParams';
import { layoutWgslStruct } from '../../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const fields = parseWgslStructFields(
  readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/placeDigVeil.wesl'),
  'PlaceDigVeilParams',
);
const struct = layoutWgslStruct(fields, (type) => {
  const p = wgslPrimitiveLayout(type);
  if (!p) throw new Error(`PlaceDigVeilParams field type ${type} has no layout entry`);
  return p;
});
const typeOf = new Map(fields.map((f) => [f.name, f.type]));

const SENTINEL = {
  seed: 801,
  count: 802,
  childrenPerComplex: 803,
  reservationOffset: 804,
  cdfRings: 805,
  cdfAz: 806,
  cdfRMin: 8101,
  cdfRMax: 8102,
  complexSpread: 8103,
  elongation: 8104,
  coherence: 8105,
  amplitudeBase: 8106,
  scaleHeight: 8107,
  sigmaMin: 8108,
  sigmaMax: 8109,
  textureWeight: 8110,
  warpStrength: 8111,
  warpTwist: 8112,
  warpStartRadius: 8113,
  outerRadius: 8114,
} as const;

const input: PlaceDigVeilParamsInput = {
  ...SENTINEL,
  generatorIsFluid: true,
  color: [8201, 8202, 8203],
};

const buf = packPlaceDigVeilParams(input);
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

describe('packPlaceDigVeilParams ↔ milkyWay/ismMap/placeDigVeil.wesl PlaceDigVeilParams', () => {
  it('packs a buffer the shader can bind', () => {
    expect(PLACE_DIG_VEIL_PARAMS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts color at the vec3 field offset, in order', () => {
    const offset = struct.offsets.get('color');
    expect(offset).toBeDefined();
    expect(observed('color', 8201)).toBe(offset);
    expect(observed('color', 8202)).toBe(offset! + 4);
    expect(observed('color', 8203)).toBe(offset! + 8);
  });

  it('puts generatorIsFluid (bool -> u32) where the shader declares it', () => {
    const offset = struct.offsets.get('generatorIsFluid')!;
    expect(u32[offset / 4]).toBe(1);
  });

  it('puts every other scalar member the shader declares where it declares it', () => {
    const scalarFields = [...struct.offsets.keys()].filter(
      (name) => name !== 'color' && name !== 'generatorIsFluid' && !name.startsWith('_pad'),
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
