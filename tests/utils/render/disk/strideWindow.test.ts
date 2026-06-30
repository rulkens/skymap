import { describe, it, expect } from 'vitest';
import { strideWindow } from '../../../../src/utils/render/disk/strideWindow';

describe('strideWindow', () => {
  it('covers the whole catalog across decimationFactor frames', () => {
    const count = 100,
      decim = 4;
    let start = 0;
    const visited = new Set<number>();
    for (let frame = 0; frame < decim; frame++) {
      const { safeStart, end, nextStart } = strideWindow(count, decim, start);
      for (let i = safeStart; i < end; i++) visited.add(i);
      start = nextStart;
    }
    expect(visited.size).toBe(count);
    expect(start).toBe(0); // wrapped back to the start after a full sweep
  });

  it('wraps nextStart to 0 once the window reaches the end', () => {
    const { end, nextStart } = strideWindow(10, 4, 8); // stride ceil(10/4)=3, end=min(11,10)=10
    expect(end).toBe(10);
    expect(nextStart).toBe(0);
  });

  it('clamps a stale start (>= count) back to 0', () => {
    const { safeStart, end } = strideWindow(10, 5, 999);
    expect(safeStart).toBe(0);
    expect(end).toBe(2); // ceil(10/5)=2
  });

  it('stride is at least 1 even for tiny catalogs', () => {
    const { safeStart, end } = strideWindow(1, 8, 0);
    expect(end - safeStart).toBe(1);
  });
});
