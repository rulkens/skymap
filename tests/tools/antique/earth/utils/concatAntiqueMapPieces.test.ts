/** A later source's triangles must index its own vertices, past every earlier source's. */

import { describe, it, expect } from 'vitest';

import { concatAntiqueMapPieces } from '../../../../../tools/antique/earth/utils/concatAntiqueMapPieces';

const triangle = (code: number) => ({
  positions: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  codes: new Uint8Array([code, code, code]),
  indices: new Uint32Array([0, 1, 2]),
});
const sign = (kind: number) => ({ lonDeg: 0, latDeg: 0, sizeUnits: 1, kind, level: 0 });

describe('concatAntiqueMapPieces', () => {
  it('offsets each fill’s indices and keeps signs in source order', () => {
    const map = concatAntiqueMapPieces([
      { fill: triangle(1), signs: [sign(8)] },
      { strips: [] },
      { fill: triangle(2), signs: [sign(0)] },
    ]);
    expect([...map.fill.indices]).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...map.fill.codes]).toEqual([1, 1, 1, 2, 2, 2]);
    expect(map.signs.map((s) => s.kind)).toEqual([8, 0]);
  });
});
