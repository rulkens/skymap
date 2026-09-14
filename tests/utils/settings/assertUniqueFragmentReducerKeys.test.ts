import { describe, expect, it } from 'vitest';

import { assertUniqueFragmentReducerKeys } from '../../../src/utils/settings/assertUniqueFragmentReducerKeys';

describe('assertUniqueFragmentReducerKeys', () => {
  it('throws naming a reducer key two fragments claim', () => {
    const alpha = {
      key: 'alpha',
      initialState: { enabled: false },
      reducers: { setEnabled: () => {} },
    } as const;
    const beta = {
      key: 'beta',
      initialState: { enabled: true },
      reducers: { setEnabled: () => {} },
    } as const;

    const claim = () => assertUniqueFragmentReducerKeys([alpha, beta]);

    expect(claim).toThrow(/setEnabled/);
    expect(claim).toThrow(/alpha/);
    expect(claim).toThrow(/beta/);
  });

  it('throws on a fragment reducer key that collides with a core reducer key', () => {
    const alpha = {
      key: 'alpha',
      initialState: { enabled: false },
      reducers: { setEnabled: () => {} },
    } as const;

    const claim = () => assertUniqueFragmentReducerKeys([alpha], ['setEnabled']);

    expect(claim).toThrow(/setEnabled/);
    expect(claim).toThrow(/core reducer/);
  });
});
