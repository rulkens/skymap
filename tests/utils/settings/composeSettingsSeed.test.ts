import { describe, expect, it } from 'vitest';

import { composeSettingsSeed } from '../../../src/utils/settings/composeSettingsSeed';

const core = { labels: { focusedOnly: false } };

const alpha = { key: 'alpha', seed: () => ({ n: 1 }), reducers: {} } as const;
const beta = { key: 'beta', seed: () => ({ s: 'x' }), reducers: {} } as const;

describe('composeSettingsSeed', () => {
  it("places each fragment's cluster under its own key", () => {
    expect(composeSettingsSeed(core, [alpha, beta])).toEqual({
      labels: { focusedOnly: false },
      alpha: { n: 1 },
      beta: { s: 'x' },
    });
  });

  it('throws when a fragment key shadows a core cluster', () => {
    const shadow = { key: 'labels', seed: () => ({ n: 1 }), reducers: {} } as const;

    expect(() => composeSettingsSeed(core, [alpha, shadow])).toThrow(/labels/);
  });

  it('throws when two fragments share a key', () => {
    const rival = { key: 'alpha', seed: () => ({ n: 2 }), reducers: {} } as const;

    expect(() => composeSettingsSeed(core, [alpha, rival])).toThrow(/alpha/);
  });
});
