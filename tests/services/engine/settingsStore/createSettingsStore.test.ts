import { describe, it, expect, vi } from 'vitest';

import { createSettingsStore } from '../../../../src/services/engine/settingsStore/createSettingsStore';
import { setSurveySize } from '../../../../src/services/engine/settingsStore/reducers/setSurveySize';
import { selectSurveySize } from '../../../../src/services/engine/settingsStore/selectors/selectSurveySize';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('createSettingsStore', () => {
  it('seeds getState from the initial value', () => {
    const initial = makeSettingsFixture();
    const store = createSettingsStore(initial);

    expect(store.getState()).toEqual(initial);
  });

  it('setState with a reducer notifies subscribers and reflects in getState', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const spy = vi.fn();
    store.subscribe(spy);

    store.setState((s) => setSurveySize(s, 4));

    expect(spy).toHaveBeenCalled();
    expect(selectSurveySize(store.getState())).toBe(4);
  });
});
