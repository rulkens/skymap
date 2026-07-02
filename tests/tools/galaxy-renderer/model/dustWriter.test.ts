/**
 * dustWriter — pure stride-8 interleaving into a growable array, extracted
 * from galaxy-model.js:488-500's `dustData` push array. Field order per
 * record is x,y,z,size,r,g,b,opacity — size comes before colour here,
 * unlike starWriter's colour-before-size order. That's the GPU vertex
 * layout's asymmetry, carried over as-is rather than "fixed" to match.
 * Dust count isn't knowable up front (it depends on how many candidates
 * the noise/ring gates accept), so this grows a plain array and
 * `toFloat32Array()` snapshots a tight copy sized to what was written.
 */
import { describe, expect, it } from 'vitest';
import { createDustWriter } from '../../../../tools/galaxy-renderer/src/model/dustWriter';

describe('createDustWriter', () => {
  it('records land at stride-8 offsets in field order x,y,z,size,r,g,b,opacity', () => {
    const writer = createDustWriter();
    // Integer-only values so the Float32Array snapshot round-trips exactly
    // (fractional literals like 0.1 lose precision through float32 and
    // would need a tolerance-based assertion instead).
    writer.write(1, 2, 3, 4, 10, 20, 30, 50);
    writer.write(100, 200, 300, 400, 40, 50, 60, 90);

    const out = writer.toFloat32Array();
    expect(Array.from(out.subarray(0, 8))).toEqual([1, 2, 3, 4, 10, 20, 30, 50]);
    expect(Array.from(out.subarray(8, 16))).toEqual([100, 200, 300, 400, 40, 50, 60, 90]);
  });

  it('count tracks records written', () => {
    const writer = createDustWriter();
    expect(writer.count()).toBe(0);
    writer.write(1, 2, 3, 4, 0.1, 0.2, 0.3, 0.5);
    expect(writer.count()).toBe(1);
  });

  it('toFloat32Array length is count*8', () => {
    const writer = createDustWriter();
    writer.write(1, 2, 3, 4, 0.1, 0.2, 0.3, 0.5);
    writer.write(1, 2, 3, 4, 0.1, 0.2, 0.3, 0.5);
    writer.write(1, 2, 3, 4, 0.1, 0.2, 0.3, 0.5);
    expect(writer.toFloat32Array().length).toBe(24);
  });

  it('empty writer yields a zero-length array', () => {
    const writer = createDustWriter();
    expect(writer.count()).toBe(0);
    expect(writer.toFloat32Array().length).toBe(0);
  });
});
