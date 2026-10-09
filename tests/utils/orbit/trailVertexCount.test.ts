import { describe, expect, it } from 'vitest';
import { trailVertexCount } from '../../../src/utils/orbit/trailVertexCount';

describe('trailVertexCount', () => {
  const t = Float64Array.of(10, 20, 30, 40);

  it('draw count k is the number of vertices at or before simDays', () => {
    expect(trailVertexCount(t, 5)).toBe(0);
    expect(trailVertexCount(t, 10)).toBe(1);
    expect(trailVertexCount(t, 25)).toBe(2);
    expect(trailVertexCount(t, 40)).toBe(4);
    expect(trailVertexCount(t, 1e9)).toBe(4);
  });
});
