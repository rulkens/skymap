import { describe, it, expect } from 'vitest';

import { selectHighlightFallback } from '../../../../../src/services/engine/settingsStore/selectors/selectHighlightFallback';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectHighlightFallback', () => {
  it('returns galaxy catalogs.highlightFallback', () => {
    const state = makeSettingsFixture({
      galaxyCatalogs: { ...makeSettingsFixture().galaxyCatalogs, highlightFallback: true },
    });

    expect(selectHighlightFallback(state)).toBe(true);
  });
});
