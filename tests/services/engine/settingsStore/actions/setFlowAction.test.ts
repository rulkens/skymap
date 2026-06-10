import { describe, it, expect } from 'vitest';

import { setFlowAction } from '../../../../../src/services/engine/settingsStore/actions/setFlowAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectFlow } from '../../../../../src/services/engine/settingsStore/selectors/selectFlow';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setFlowAction', () => {
  it('merges the patch into the flow slice through the reducer', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectFlow(store.getState());

    setFlowAction(store, { enabled: true, intensity: 0.7 });

    expect(store.getState().flow.enabled).toBe(true);
    expect(store.getState().flow.intensity).toBe(0.7);
    // Untouched leaf preserved.
    expect(store.getState().flow.mode).toBe(before.mode);
    // New ref after a write.
    expect(selectFlow(store.getState())).not.toBe(before);
  });
});
