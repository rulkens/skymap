/**
 * Parity guard: `milkyWay/ismMap/ismMapDustCdfScan.wesl`'s `IsmMapCdfParams`
 * is the offset authority — every field gets a distinct sentinel, the
 * packer runs, and each sentinel's byte offset in the packed buffer is
 * asserted against the struct the shader actually declares. Same shape as
 * `packIsmMapFluidConstants.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  packIsmMapCdfParams,
  ISM_MAP_CDF_PARAMS_FLOATS,
} from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packIsmMapCdfParams';
import type { IsmMapCdfParamsInput } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packIsmMapCdfParams';
import { layoutWgslStruct } from '../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl'),
    'IsmMapCdfParams',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`IsmMapCdfParams field type ${type} has no layout entry`);
    return p;
  },
);

// channelWeights (vec4) packs as one field name on the WGSL side but four
// distinct packer inputs — its own offset is checked separately below.
const SENTINEL = {
  rMin: 5101,
  rMax: 5102,
  rings: 5103,
  az: 5104,
  armBias: 5105,
  armCount: 5106,
  cap: 5107,
} as const;

const input: IsmMapCdfParamsInput = {
  rMin: SENTINEL.rMin,
  rMax: SENTINEL.rMax,
  rings: SENTINEL.rings,
  az: SENTINEL.az,
  armBias: SENTINEL.armBias,
  armCount: SENTINEL.armCount,
  cap: SENTINEL.cap,
  channelWeights: { gas: 5201, stars: 5202, activity: 5203, dust: 5204 },
};

const packed = packIsmMapCdfParams(input);

function observed(value: number): number {
  const i = packed.indexOf(value);
  expect(i, `sentinel ${value} not found`).toBeGreaterThanOrEqual(0);
  expect(packed.lastIndexOf(value), `sentinel ${value} is not unique`).toBe(i);
  return i * 4;
}

describe('packIsmMapCdfParams ↔ milkyWay/ismMap/ismMapDustCdfScan.wesl IsmMapCdfParams', () => {
  it('packs a buffer the shader can bind', () => {
    expect(ISM_MAP_CDF_PARAMS_FLOATS * 4).toBeGreaterThanOrEqual(struct.layout.size);
  });

  it('puts channelWeights.{gas,stars,activity,dust} at the vec4 field offset, in order', () => {
    const offset = struct.offsets.get('channelWeights');
    expect(offset).toBe(0);
    expect(observed(5201)).toBe(offset);
    expect(observed(5202)).toBe(offset! + 4);
    expect(observed(5203)).toBe(offset! + 8);
    expect(observed(5204)).toBe(offset! + 12);
  });

  it('puts every scalar member the shader declares where it declares it', () => {
    const scalarFields = [...struct.offsets.keys()].filter((name) => name !== 'channelWeights');
    expect(scalarFields.sort()).toEqual(Object.keys(SENTINEL).sort());
    for (const member of scalarFields) {
      const offset = struct.offsets.get(member)!;
      expect(observed(SENTINEL[member as keyof typeof SENTINEL]), `member ${member}`).toBe(offset);
    }
  });

  it('defaults armBias/armCount/cap to 0 when omitted (channel-only weight table)', () => {
    const channelOnly = packIsmMapCdfParams({
      rMin: 1,
      rMax: 2,
      rings: 3,
      az: 4,
      channelWeights: { gas: 0, stars: 0, activity: 0, dust: 1 },
    });
    const armBiasOffset = struct.offsets.get('armBias')! / 4;
    const armCountOffset = struct.offsets.get('armCount')! / 4;
    const capOffset = struct.offsets.get('cap')! / 4;
    expect(channelOnly[armBiasOffset]).toBe(0);
    expect(channelOnly[armCountOffset]).toBe(0);
    expect(channelOnly[capOffset]).toBe(0);
  });
});
