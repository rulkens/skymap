import { describe, expect, it } from 'vitest';
import { packAntiqueSigns } from '../../../../src/utils/gpu/antiqueLook/packAntiqueSigns';
import { ANTIQUE_MAX_SIGNS } from '../../../../src/data/rendering/antiqueLook';

describe('packAntiqueSigns', () => {
  it('writes the count, then a vec4 per centre, and drops those past the cap', () => {
    const out = packAntiqueSigns([[10, 20], [30, 40]]);
    expect(new Uint32Array(out)[0]).toBe(2);
    expect([...new Float32Array(out, 16, 8)]).toEqual([10, 20, 0, 0, 30, 40, 0, 0]);
    const many = Array.from({ length: ANTIQUE_MAX_SIGNS + 5 }, () => [1, 2] as [number, number]);
    expect(new Uint32Array(packAntiqueSigns(many))[0]).toBe(ANTIQUE_MAX_SIGNS);
  });
});
