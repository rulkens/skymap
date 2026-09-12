import { describe, expect, it } from 'vitest';

import { composeInitialSettings } from '../../../src/utils/settings/composeInitialSettings';

const core = { labels: { focusedOnly: false } };

const alpha = { key: 'alpha', initialState: { n: 1 }, reducers: {} } as const;
const beta = { key: 'beta', initialState: { s: 'x' }, reducers: {} } as const;

describe('composeInitialSettings', () => {
  it("places each fragment's cluster under its own key", () => {
    expect(composeInitialSettings(core, [alpha, beta])).toEqual({
      labels: { focusedOnly: false },
      alpha: { n: 1 },
      beta: { s: 'x' },
    });
  });

  it('throws when a fragment key shadows a core cluster', () => {
    const shadow = { key: 'labels', initialState: { n: 1 }, reducers: {} } as const;

    expect(() => composeInitialSettings(core, [alpha, shadow])).toThrow(
      /"labels" is claimed by a fragment and by the core/,
    );
  });

  it('throws when two fragments share a key', () => {
    const rival = { key: 'alpha', initialState: { n: 2 }, reducers: {} } as const;

    expect(() => composeInitialSettings(core, [alpha, rival])).toThrow(
      /"alpha" is claimed by two fragments/,
    );
  });
});
