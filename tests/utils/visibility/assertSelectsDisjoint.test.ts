import { describe, it, expect } from 'vitest';
import { assertSelectsDisjoint } from '../../../src/utils/visibility/assertSelectsDisjoint';
import { APP_VISIBILITY_REGISTRY } from '../../../src/compositions/appVisibility';

describe('assertSelectsDisjoint', () => {
  it('passes for the composed visibility entries', () => {
    expect(() => assertSelectsDisjoint(APP_VISIBILITY_REGISTRY)).not.toThrow();
  });

  it('throws when two show entries select the same kind', () => {
    expect(() =>
      assertSelectsDisjoint([
        { key: 'a', selects: ['satellite'] },
        { key: 'b', selects: ['satellite'] },
      ]),
    ).toThrow(/satellite/);
  });
});
