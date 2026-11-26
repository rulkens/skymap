import { describe, expect, it } from 'vitest';
import { labelUnderHead } from '../../../../src/timeline/utils/ruler/labelUnderHead';

describe('labelUnderHead', () => {
  it('catches a label the tag reaches from either side, and clears one beside it', () => {
    expect(labelUnderHead(100, 40, 100, 50)).toBe(true);
    expect(labelUnderHead(100, 40, 80, 50)).toBe(true);
    expect(labelUnderHead(100, 40, 130, 50)).toBe(true);
    expect(labelUnderHead(100, 40, 200, 50)).toBe(false);
    expect(labelUnderHead(300, 40, 200, 50)).toBe(false);
  });
});
