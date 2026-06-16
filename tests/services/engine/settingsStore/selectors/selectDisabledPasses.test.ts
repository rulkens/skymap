import { describe, it, expect } from 'vitest';

import { selectDisabledPasses } from '../../../../../src/services/engine/settingsStore/selectors/selectDisabledPasses';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectDisabledPasses', () => {
  it('returns the debug.disabledPasses set', () => {
    const state = makeSettingsFixture({
      debug: { ...makeSettingsFixture().debug, disabledPasses: new Set(['point-sprites']) },
    });

    expect(selectDisabledPasses(state).has('point-sprites')).toBe(true);
  });

  it('returns the same reference for a stable snapshot (cheap useSyncExternalStore compare)', () => {
    const state = makeSettingsFixture();

    // Same input → same reference, so an unrelated store write that preserves
    // the debug cluster does not re-fire the subscription.
    expect(selectDisabledPasses(state)).toBe(state.debug.disabledPasses);
  });
});
