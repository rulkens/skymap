/**
 * starWriter — pure stride-8 interleaving into a pre-sized Float32Array,
 * extracted from galaxy-model.js:122-127's `starData`/`writePos` pair.
 * Field order per record is x,y,z,r,g,b,size,brightness (matches the
 * spike's `addStar` call signature). The spike let `writePos` walk past
 * the buffer end — a silent, corrupt-and-continue OOB write on a
 * Float32Array. This writer throws instead, so a capacity-formula
 * regression fails loudly in a test rather than garbling a galaxy.
 */
import { describe, expect, it } from 'vitest';
import { createStarWriter } from '../../../../tools/galaxy-renderer/src/model/starWriter';

describe('createStarWriter', () => {
  it('records land at stride-8 offsets in field order x,y,z,r,g,b,size,brightness', () => {
    const writer = createStarWriter(2);
    // Integer-only values so the float32 backing store round-trips exactly
    // (fractional literals like 0.1 lose precision through Float32Array and
    // would need a tolerance-based assertion instead).
    writer.write(1, 2, 3, 10, 20, 30, 4, 5);
    writer.write(100, 200, 300, 40, 50, 60, 400, 500);

    const view = writer.view();
    expect(Array.from(view.subarray(0, 8))).toEqual([1, 2, 3, 10, 20, 30, 4, 5]);
    expect(Array.from(view.subarray(8, 16))).toEqual([100, 200, 300, 40, 50, 60, 400, 500]);
  });

  it('count tracks records written', () => {
    const writer = createStarWriter(3);
    expect(writer.count()).toBe(0);
    writer.write(1, 2, 3, 0.1, 0.2, 0.3, 4, 5);
    expect(writer.count()).toBe(1);
    writer.write(1, 2, 3, 0.1, 0.2, 0.3, 4, 5);
    expect(writer.count()).toBe(2);
  });

  it('view length is count*8 and aliases the backing buffer (zero-copy)', () => {
    const writer = createStarWriter(5);
    writer.write(1, 2, 3, 0.1, 0.2, 0.3, 4, 5);
    const view1 = writer.view();
    expect(view1.length).toBe(8);

    // Mutating the view should be visible on the next view() call — proof
    // it's a subarray alias, not a copy.
    view1[0] = 999;
    const view2 = writer.view();
    expect(view2[0]).toBe(999);

    writer.write(6, 7, 8, 0.7, 0.8, 0.9, 10, 11);
    expect(writer.view().length).toBe(16);
  });

  it('writing past capacity throws', () => {
    const writer = createStarWriter(1);
    writer.write(1, 2, 3, 0.1, 0.2, 0.3, 4, 5);
    expect(() => writer.write(1, 2, 3, 0.1, 0.2, 0.3, 4, 5)).toThrow();
  });

  it('empty writer yields a zero-length view', () => {
    const writer = createStarWriter(4);
    expect(writer.count()).toBe(0);
    expect(writer.view().length).toBe(0);
  });
});
