import { describe, it, expect } from 'vitest';

import { setStructureLabelEnabledAction } from '../../../../../src/services/engine/settingsStore/actions/setStructureLabelEnabledAction';
import { createSettingsStore } from '../../../../../src/services/engine/settingsStore/createSettingsStore';
import { selectStructureItems } from '../../../../../src/services/engine/settingsStore/selectors/selectStructureItems';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setStructureLabelEnabledAction', () => {
  it('flips items[cat].labelEnabled through the reducer and changes the items ref', () => {
    const store = createSettingsStore(makeSettingsFixture());
    const before = selectStructureItems(store.getState());

    setStructureLabelEnabledAction(store, 'cluster', false);

    expect(store.getState().structures.items.cluster.labelEnabled).toBe(false);
    expect(selectStructureItems(store.getState())).not.toBe(before);
  });
});
