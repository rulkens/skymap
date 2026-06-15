import { describe, it, expect } from 'vitest';

import { setHighlightFallbackAction } from '../../../../../src/services/engine/settingsStore/actions/setHighlightFallbackAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectHighlightFallback } from '../../../../../src/services/engine/settingsStore/selectors/selectHighlightFallback';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setHighlightFallbackAction', () => {
  it('writes the highlight-fallback flag through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = store.getState().galaxyCatalogs;
    const next = !before.highlightFallback;

    setHighlightFallbackAction(store, next);

    expect(selectHighlightFallback(store.getState())).toBe(next);
    expect(store.getState().galaxyCatalogs).not.toBe(before);
  });
});
