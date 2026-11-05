import { describe, expectTypeOf, it } from 'vitest';
import type { SelectionKind } from '../../../src/@types/engine/SelectionKind';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import type { FocusableTarget } from '../../../src/@types/engine/FocusableTarget';

describe('selectionKinds', () => {
  it('both unions discriminate on exactly the listed kinds', () => {
    expectTypeOf<SelectionRef['type']>().toEqualTypeOf<SelectionKind>();
    expectTypeOf<FocusableTarget['type']>().toEqualTypeOf<SelectionKind>();
  });
});
