import { describe, it, expect, vi } from 'vitest';

import { spanTimestampWrites } from '../../../../../src/layers/milkyWay/field/utils/spanTimestampWrites';
import type { FieldFramePlan } from '../../../../../src/layers/milkyWay/field/@types/FieldFramePlan';

const QUERY_SET = { label: 'timing' } as unknown as GPUQuerySet;

function claimSpy() {
  return vi.fn(() => ({
    timestampWrites: {
      querySet: QUERY_SET,
      beginningOfPassWriteIndex: 4,
      endOfPassWriteIndex: 5,
    },
  }));
}

function planOf(encodes: FieldFramePlan['encodes']): FieldFramePlan {
  return { encodes, composites: encodes.filter((id) => id !== 'dustMap') };
}

describe('spanTimestampWrites', () => {
  it('brackets the first and last encoded pass with one claim', () => {
    const claim = claimSpy();
    const writes = spanTimestampWrites(claim, planOf(['dustMap', 'field', 'young']));
    expect(writes('dustMap')).toEqual({ querySet: QUERY_SET, beginningOfPassWriteIndex: 4 });
    expect(writes('field')).toBeUndefined();
    expect(writes('young')).toEqual({ querySet: QUERY_SET, endOfPassWriteIndex: 5 });
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('a single-pass plan gets both indices', () => {
    const writes = spanTimestampWrites(claimSpy(), planOf(['field']));
    expect(writes('field')).toEqual({
      querySet: QUERY_SET,
      beginningOfPassWriteIndex: 4,
      endOfPassWriteIndex: 5,
    });
  });

  it('never claims when no pass asks', () => {
    const claim = claimSpy();
    spanTimestampWrites(claim, planOf(['dustMap', 'field']));
    expect(claim).not.toHaveBeenCalled();
  });
});
