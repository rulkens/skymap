import { describe, expect, it } from 'vitest';
import { canvasPxPerCssPx } from '../../../src/utils/browser/canvasPxPerCssPx';

describe('canvasPxPerCssPx', () => {
  it('is the backing width over the CSS width, and 1 for a hidden canvas', () => {
    expect(canvasPxPerCssPx({ width: 3200, clientWidth: 1600 })).toBe(2);
    expect(canvasPxPerCssPx({ width: 1, clientWidth: 0 })).toBe(1);
  });
});
