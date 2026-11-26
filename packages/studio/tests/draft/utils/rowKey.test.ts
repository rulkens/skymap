import { describe, it, expect } from 'vitest';

import { rowKey } from '../../../src/draft/utils/rowKey';

describe('rowKey', () => {
  it('rowKey distinguishes effect and waypoint refs at the same path', () => {
    expect(rowKey({ kind: 'effect', path: [0, 2, 1] })).toBe('e:0.2.1');
    expect(rowKey({ kind: 'waypoint', path: [0, 2, 1], index: 3 })).toBe('w:0.2.1/3');
    expect(rowKey({ kind: 'start' })).toBe('start');
  });
});
