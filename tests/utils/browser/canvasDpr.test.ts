import { describe, expect, it } from 'vitest';
import { canvasDpr } from '../../../src/utils/browser/canvasDpr';

describe('canvasDpr', () => {
  it('is the backing width over the CSS width, and 1 for a hidden canvas', () => {
    expect(canvasDpr({ width: 3200, clientWidth: 1600 })).toBe(2);
    expect(canvasDpr({ width: 1, clientWidth: 0 })).toBe(1);
  });
});
