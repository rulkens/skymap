/**
 * Parity guard: `milkyWay/ismMap/placeArmSpurCloud.wesl`'s
 * `PlaceArmSpurCloudParams` is the offset authority — every field gets a
 * distinct sentinel, the packer runs, and each sentinel's byte offset in the
 * packed buffer (read through whichever typed view its WGSL type maps to) is
 * asserted against the struct the shader actually declares. Same shape as
 * `packIsmMapCdfParams.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  packPlaceArmSpurCloudParams,
  PLACE_ARM_SPUR_CLOUD_PARAMS_FLOATS,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceArmSpurCloudParams';
import type { PlaceArmSpurCloudParamsInput } from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceArmSpurCloudParams';
import { layoutWgslStruct } from '../../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const fields = parseWgslStructFields(
  readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/placeArmSpurCloud.wesl'),
  'PlaceArmSpurCloudParams',
);
const struct = layoutWgslStruct(fields, (type) => {
  const p = wgslPrimitiveLayout(type);
  if (!p) throw new Error(`PlaceArmSpurCloudParams field type ${type} has no layout entry`);
  return p;
});
const typeOf = new Map(fields.map((f) => [f.name, f.type]));

const SENTINEL = {
  seed: 701,
  count: 702,
  spurCount: 703,
  reservationOffset: 704,
  spurFlux: 7101,
  weightSum: 7102,
  elongation: 7103,
  sizeScale: 7104,
  widthScale: 7105,
  excessScaleRatio: 7106,
  hLight: 7107,
  diskHeight: 7108,
  armStartRadius: 7109,
  armInnerRampW: 7110,
  armFullRadius: 7111,
  waveAmount: 7112,
  diskScaleLen: 7113,
  warpStrength: 7114,
  warpTwist: 7115,
  warpStartRadius: 7116,
  outerRadius: 7117,
} as const;

const input: PlaceArmSpurCloudParamsInput = { ...SENTINEL };

const buf = packPlaceArmSpurCloudParams(input);
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

describe('packPlaceArmSpurCloudParams ↔ milkyWay/ismMap/placeArmSpurCloud.wesl PlaceArmSpurCloudParams', () => {
  it('packs a buffer the shader can bind', () => {
    expect(PLACE_ARM_SPUR_CLOUD_PARAMS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts every member the shader declares where it declares it', () => {
    const scalarFields = [...struct.offsets.keys()].filter((name) => !name.startsWith('_pad'));
    expect(scalarFields.sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const member of scalarFields) {
      const offset = struct.offsets.get(member)!;
      expect(observed(member, SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(
        offset,
      );
    }
  });
});
