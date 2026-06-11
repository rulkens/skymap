import { describe, it, expect } from 'vitest';

import { selectHighlightFallback } from '../../../../../src/services/engine/settingsStore/selectors/selectHighlightFallback';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectHighlightFallback', () => {
  it('returns surveys.highlightFallback', () => {
    const state = makeSettingsFixture({
      surveys: { ...makeSettingsFixture().surveys, highlightFallback: true },
    });

    expect(selectHighlightFallback(state)).toBe(true);
  });
});
