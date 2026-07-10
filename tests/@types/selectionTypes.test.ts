import { describe, it, expectTypeOf } from 'vitest';

import type { SelectionRef } from '../../src/@types/engine/SelectionRef';
import type { SelectionRow } from '../../src/@types/engine/SelectionRow';
import type { SelectionSlot } from '../../src/@types/engine/SelectionSlot';

describe('selection types', () => {
  it('SelectionSlot is exactly the three slot names', () => {
    expectTypeOf<SelectionSlot>().toEqualTypeOf<'hover' | 'select' | 'focus'>();
  });
  it('SelectionRef discriminates on type', () => {
    const ref: SelectionRef = { type: 'milkyWay' };
    expectTypeOf(ref).toMatchTypeOf<{
      type: 'galaxyCatalog' | 'structure' | 'milkyWay' | 'body';
    }>();
  });
  it('SelectionRow milkyWay arm is the tag', () => {
    const row: SelectionRow = { type: 'milkyWay' };
    expectTypeOf(row).toMatchTypeOf<SelectionRow>();
  });
  it('SelectionRow body arm carries the framing fields', () => {
    const row: SelectionRow = {
      type: 'body',
      id: 'earth',
      positionMpc: [4.8481e-12, 0, 0],
      radiusKm: 6371,
    };
    expectTypeOf(row).toMatchTypeOf<SelectionRow>();
  });
});
