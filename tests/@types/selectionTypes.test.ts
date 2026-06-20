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
    expectTypeOf(ref).toMatchTypeOf<{ type: 'galaxyCatalog' | 'structure' | 'milkyWay' }>();
  });
  it('SelectionRow milkyWay arm is the tag', () => {
    const row: SelectionRow = { type: 'milkyWay' };
    expectTypeOf(row).toMatchTypeOf<SelectionRow>();
  });
});
