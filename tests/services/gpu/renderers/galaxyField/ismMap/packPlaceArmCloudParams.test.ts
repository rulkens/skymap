/**
 * Parity guard: `milkyWay/ismMap/placeArmCloud.wesl`'s `PlaceArmCloudParams`
 * is the offset authority — every field gets a distinct sentinel, the packer
 * runs, and each sentinel's byte offset in the packed buffer (read through
 * whichever typed view its WGSL type maps to — u32 fields travel as real
 * u32s here, unlike packIsmMapCdfParams.ts's all-f32 convention) is asserted
 * against the struct the shader actually declares. Same shape as
 * `packIsmMapCdfParams.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  packPlaceArmCloudParams,
  PLACE_ARM_CLOUD_PARAMS_FLOATS,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceArmCloudParams';
import type { PlaceArmCloudParamsInput } from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packPlaceArmCloudParams';
import { layoutWgslStruct } from '../../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const fields = parseWgslStructFields(
  readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/placeArmCloud.wesl'),
  'PlaceArmCloudParams',
);
const struct = layoutWgslStruct(fields, (type) => {
  const p = wgslPrimitiveLayout(type);
  if (!p) throw new Error(`PlaceArmCloudParams field type ${type} has no layout entry`);
  return p;
});
const typeOf = new Map(fields.map((f) => [f.name, f.type]));

const SENTINEL = {
  seed: 601,
  count: 602,
  armCount: 603,
  reservationOffset: 604,
  childrenPerComplex: 605,
  armWeightSum: 6101,
  elongation: 6102,
  sizeScale: 6103,
  complexSpread: 6104,
  sigmaZComplex: 6105,
  widthScale: 6106,
  excessScaleRatio: 6107,
  hLight: 6108,
  tiltRefRadius: 6109,
  radialBias: 6110,
  youngFraction: 6111,
  discWeightSum: 6112,
  warpStrength: 6113,
  warpTwist: 6114,
  warpStartRadius: 6115,
  outerRadius: 6116,
  armStartRadius: 6117,
  armInnerRampW: 6118,
  armFullRadius: 6119,
  waveAmount: 6120,
  diskScaleLen: 6121,
  cloudFlux: 6122,
} as const;

const input: PlaceArmCloudParamsInput = {
  ...SENTINEL,
  discSigmaR: [6201, 6202, 6203, 6204],
};

const buf = packPlaceArmCloudParams(input);
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

describe('packPlaceArmCloudParams ↔ milkyWay/ismMap/placeArmCloud.wesl PlaceArmCloudParams', () => {
  it('packs a buffer the shader can bind', () => {
    expect(PLACE_ARM_CLOUD_PARAMS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts discSigmaR at the vec4 field offset, in order', () => {
    const offset = struct.offsets.get('discSigmaR');
    expect(offset).toBeDefined();
    expect(observed('discSigmaR', 6201)).toBe(offset);
    expect(observed('discSigmaR', 6202)).toBe(offset! + 4);
    expect(observed('discSigmaR', 6203)).toBe(offset! + 8);
    expect(observed('discSigmaR', 6204)).toBe(offset! + 12);
  });

  it('puts every scalar member the shader declares where it declares it', () => {
    const scalarFields = [...struct.offsets.keys()].filter(
      (name) => name !== 'discSigmaR' && !name.startsWith('_pad'),
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
