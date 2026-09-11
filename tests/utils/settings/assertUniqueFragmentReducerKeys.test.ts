import { describe, expect, it } from 'vitest';

import { assertUniqueFragmentReducerKeys } from '../../../src/utils/settings/assertUniqueFragmentReducerKeys';

describe('assertUniqueFragmentReducerKeys', () => {
  it('throws naming a reducer key two fragments claim', () => {
    const alpha = {
      key: 'alpha',
      seed: () => ({ enabled: false }),
      reducers: { setEnabled: () => {} },
    } as const;
    const beta = {
      key: 'beta',
      seed: () => ({ enabled: true }),
      reducers: { setEnabled: () => {} },
    } as const;

    const claim = () => assertUniqueFragmentReducerKeys([alpha, beta]);

    expect(claim).toThrow(/setEnabled/);
    expect(claim).toThrow(/alpha/);
    expect(claim).toThrow(/beta/);
  });
});
