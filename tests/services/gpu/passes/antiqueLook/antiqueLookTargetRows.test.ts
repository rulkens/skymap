/**
 * The print-points row is the one look row sized in print units: one texel holds at
 * most one star glyph, so a retina plate must hold the same texels as a 1× one, or
 * it prints a different star count (route A's failure: 4–5× the stars at 2×).
 */
import { describe, expect, it } from 'vitest';

import { antiqueLookTargetRows } from '../../../../../src/services/gpu/passes/antiqueLook/antiqueLookTargetRows';
import { ANTIQUE_TARGETS } from '../../../../../src/data/rendering/antiqueLook';
import { reducedTargetSize } from '../../../../../src/utils/gpu/reducedTargetSize';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';

const STATE = {} as EngineState;

function printPointsPx(width: number, height: number): readonly number[] {
  const row = antiqueLookTargetRows('bgra8unorm').find(
    ({ id }) => id === ANTIQUE_TARGETS.printPoints,
  )!;
  const scale = typeof row.scale === 'function' ? row.scale(STATE, { width, height }) : row.scale;
  return reducedTargetSize(width, height, scale);
}

describe('antiqueLookTargetRows', () => {
  it('print-points holds the same texels at every DPR', () => {
    expect(printPointsPx(2800, 1800)).toEqual(printPointsPx(1400, 900));
    expect(printPointsPx(4200, 2700)).toEqual(printPointsPx(1400, 900));
  });
});
