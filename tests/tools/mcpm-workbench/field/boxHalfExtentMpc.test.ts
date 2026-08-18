import { describe, expect, it } from 'vitest';
import { boxHalfExtentMpc } from '../../../../tools/mcpm-workbench/src/field/boxHalfExtentMpc';

describe('boxHalfExtentMpc', () => {
  it('halves each axis independently', () => {
    expect(boxHalfExtentMpc([10, 20, 30])).toEqual([5, 10, 15]);
  });
});
