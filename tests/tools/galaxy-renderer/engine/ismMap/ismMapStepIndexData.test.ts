/**
 * sfMapStepIndexData — the per-step index array rebuildSfMap writes once,
 * at device-aligned offsets (see tools/galaxy-renderer/src/engine/sfMapStepIndexData.ts).
 */
import { describe, expect, it } from 'vitest';
import { sfMapStepIndexData } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/ismMapStepIndexData';

describe('sfMapStepIndexData', () => {
  it('places each step index at its own strideBytes-aligned float offset, padding left zero', () => {
    const strideBytes = 256; // real device alignment, NOT a multiple of 4 floats' worth of payload
    const steps = 3;
    const strideFloats = strideBytes / 4;

    const data = sfMapStepIndexData(steps, strideBytes);

    expect(data.length).toBe(steps * strideFloats);
    for (let s = 0; s < steps; s++) {
      expect(data[s * strideFloats]).toBe(s);
      for (let pad = 1; pad < strideFloats; pad++) {
        expect(data[s * strideFloats + pad]).toBe(0);
      }
    }
  });
});
