import { describe, it, expect } from 'vitest';
import { verticalClearance } from '../../../../../src/layers/body/labels/utils/verticalClearance';

const RECT = { x0: 0, y0: 0, x1: 100, y1: 20 };
const ANYWHERE = () => true;

describe('verticalClearance', () => {
  it('leaves a name where it is when nothing kept is near', () => {
    expect(verticalClearance(RECT, 30, [{ x0: 0, y0: 50, x1: 100, y1: 70 }], 8, ANYWHERE)).toBe(0);
  });

  it('steps off a kept name the shorter way, clearing it by the pad', () => {
    // A kept name just below: up by 2 clears it, down would take 44.
    const dy = verticalClearance(RECT, 30, [{ x0: 50, y0: 22, x1: 150, y1: 40 }], 4, ANYWHERE);
    expect(dy).toBe(-2);
  });

  it('takes the longer way when the shorter leaves the disc, and gives up past the slack', () => {
    const kept = [{ x0: 50, y0: 22, x1: 150, y1: 40 }];
    expect(verticalClearance(RECT, 50, kept, 4, (r) => r.y0 >= 0)).toBe(44);
    expect(verticalClearance(RECT, 30, kept, 4, (r) => r.y0 >= 0)).toBeNull();
  });
});
