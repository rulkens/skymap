/**
 * The predicate decides both the filename suffix and whether a request names a
 * tier, so the one case worth pinning is the cap that reads falsy: SDSS's
 * `small: 0` (excluded at that tier) still ships `-small`/`-medium`/`-large`
 * variants. A `some(Boolean)` rewrite would pass every other input.
 */

import { describe, it, expect } from 'vitest';
import { shipsTierVariants } from '../../../src/utils/loading/shipsTierVariants';

describe('shipsTierVariants', () => {
  it('counts an exclusion cap as a variant, and no caps as none', () => {
    expect(shipsTierVariants({ small: 0 })).toBe(true);
    expect(shipsTierVariants({})).toBe(false);
  });
});
