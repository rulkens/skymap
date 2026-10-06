import { describe, it, expect } from 'vitest';

import { createTestStore } from '../../../../support/createTestStore';
import { selectMissionEmphasis } from '../../../../../src/state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../../../../src/state/settings/core/orbitTrails/slice';

describe('mission emphasis', () => {
  it('starts null and follows setMissionEmphasis', () => {
    const { store } = createTestStore();
    expect(selectMissionEmphasis(store.getState())).toBeNull();
    store.dispatch(setMissionEmphasis('voyager2'));
    expect(selectMissionEmphasis(store.getState())).toBe('voyager2');
    store.dispatch(setMissionEmphasis(null));
    expect(selectMissionEmphasis(store.getState())).toBeNull();
  });
});
