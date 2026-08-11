/**
 * packIsmMapCdfArmEnvelope packs a runtime-sized array (no fixed WGSL
 * struct offsets to check against, unlike packIsmMapCdfParams) — this just
 * pins the ring-major (ridgeAngle, weight, invSigma) triple layout
 * ismMapDustCdfScan.wesl's IsmMapCdfArmEnvelopeEntry expects.
 */
import { describe, expect, it } from 'vitest';

import {
  packIsmMapCdfArmEnvelope,
  ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY,
} from '../../../../../tools/galaxy-renderer/src/engine/ismMap/packIsmMapCdfArmEnvelope';

describe('packIsmMapCdfArmEnvelope', () => {
  it('packs each entry as a contiguous (ridgeAngle, weight, invSigma) triple, in order', () => {
    const packed = packIsmMapCdfArmEnvelope([
      { ridgeAngle: 1.1, weight: 2.2, invSigma: 3.3 },
      { ridgeAngle: 4.4, weight: 5.5, invSigma: 6.6 },
    ]);
    expect(ISM_MAP_CDF_ARM_ENVELOPE_FLOATS_PER_ENTRY).toBe(3);
    expect(packed.length).toBe(6);
    expect(Array.from(packed)).toEqual(
      [1.1, 2.2, 3.3, 4.4, 5.5, 6.6].map((v) => Math.fround(v)),
    );
  });

  it('packs an empty entry list to an empty buffer', () => {
    expect(packIsmMapCdfArmEnvelope([]).length).toBe(0);
  });
});
