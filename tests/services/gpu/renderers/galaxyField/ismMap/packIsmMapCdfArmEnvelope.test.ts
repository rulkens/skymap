/**
 * Parity guard: `milkyWay/ismMap/ismMapDustCdfScan.wesl`'s
 * `IsmMapCdfArmEnvelopeEntry` is the offset authority — field order/count
 * is parsed from the shader source (not restated as a literal here), so a
 * reorder or an added/dropped field in either the packer or the WGSL
 * struct fails loudly. Same tooling and shape as
 * `packIsmMapCdfParams.test.ts`; the storage-buffer struct's stride comes
 * out identical to a uniform-address-space layout here because every
 * member is a bare `f32` (align 4), so no 16-byte vec3/vec4 rounding
 * applies either way.
 */
import { describe, expect, it } from 'vitest';

import {
  packIsmMapCdfArmEnvelope,
  ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY,
} from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packIsmMapCdfArmEnvelope';
import type { IsmMapCdfArmEnvelopeEntry } from '../../../../../../src/services/gpu/renderers/galaxyField/ismMap/packIsmMapCdfArmEnvelope';
import { layoutWgslStruct } from '../../../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/milkyWay/ismMap/ismMapDustCdfScan.wesl'),
    'IsmMapCdfArmEnvelopeEntry',
  ),
  (type) => {
    const p = wgslPrimitiveLayout(type);
    if (!p) throw new Error(`IsmMapCdfArmEnvelopeEntry field type ${type} has no layout entry`);
    return p;
  },
);

describe('packIsmMapCdfArmEnvelope ↔ milkyWay/ismMap/ismMapDustCdfScan.wesl IsmMapCdfArmEnvelopeEntry', () => {
  it("matches the WGSL struct's own field order and count exactly", () => {
    expect([...struct.offsets.keys()]).toEqual(['ridgeAngle', 'weight', 'invSigma']);
  });

  it('its stride equals the parsed struct size — no unaccounted padding', () => {
    expect(ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY * 4).toBe(struct.layout.size);
  });

  it('packs each entry as a contiguous triple, one entry per struct-sized stride, fields at their parsed offsets', () => {
    const entries: readonly IsmMapCdfArmEnvelopeEntry[] = [
      { ridgeAngle: 1.1, weight: 2.2, invSigma: 3.3 },
      { ridgeAngle: 4.4, weight: 5.5, invSigma: 6.6 },
    ];
    const packed = packIsmMapCdfArmEnvelope(entries);
    const stride = struct.layout.size / 4;
    expect(packed.length).toBe(entries.length * stride);

    for (let i = 0; i < entries.length; i++) {
      for (const field of ['ridgeAngle', 'weight', 'invSigma'] as const) {
        const offset = struct.offsets.get(field)! / 4;
        expect(packed[i * stride + offset], `entry ${i}.${field}`).toBe(
          Math.fround(entries[i]![field]),
        );
      }
    }
  });

  it('packs an empty entry list to an empty buffer', () => {
    expect(packIsmMapCdfArmEnvelope([]).length).toBe(0);
  });
});
