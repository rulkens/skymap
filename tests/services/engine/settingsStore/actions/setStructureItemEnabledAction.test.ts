import { describe, it, expect } from 'vitest';

import { setStructureItemEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setStructureItemEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectStructureItems } from '../../../../../src/services/engine/settingsStore/selectors/selectStructureItems';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setStructureItemEnabledAction', () => {
  it('flips items[cat].enabled through the reducer and changes the items ref', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectStructureItems(store.getState());

    setStructureItemEnabledAction(store, 'cluster', false);

    expect(store.getState().structures.items.cluster.enabled).toBe(false);
    // Copy-on-write propagated through the reducer — the stable selector ref
    // changes, which is what wakes the React subscriber.
    expect(selectStructureItems(store.getState())).not.toBe(before);
  });
});
