import { describe, it, expect } from 'vitest';

import { selectVolumeFieldItems } from '../../../../../src/services/engine/settingsStore/selectors/selectVolumeFieldItems';
import { setVolumesEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setVolumesEnabled';
import { writeVolumeField } from '../../../../../src/services/engine/settingsStore/reducers/writeVolumeField';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectVolumeFieldItems', () => {
  it('returns the underlying volumes.items Record by reference', () => {
    const state = makeSettingsFixture();

    expect(selectVolumeFieldItems(state)).toBe(state.volumes.items);
  });

  it('returns the SAME ref when an unrelated cluster changes (stable-ref contract)', () => {
    // The whole reason this selector returns the raw Record rather than a
    // projected array: `useSyncExternalStore`'s getSnapshot must be stable.
    const state = makeSettingsFixture();
    const before = selectVolumeFieldItems(state);

    // Toggle the sibling master gate — a write to volumes.enabled, NOT to items.
    const afterMaster = setVolumesEnabled(state, !state.volumes.enabled);
    expect(selectVolumeFieldItems(afterMaster)).toBe(before);

    // A wholly-unrelated cluster (brightness lives on surveys) also must not
    // disturb the items ref.
    const afterSurveys = { ...state, surveys: { ...state.surveys, brightness: 0.123 } };
    expect(selectVolumeFieldItems(afterSurveys)).toBe(before);
  });

  it('returns a NEW ref when a field actually changes', () => {
    const state = makeSettingsFixture();
    const before = selectVolumeFieldItems(state);

    const after = writeVolumeField(state, 'mcpm', { intensity: 0.33 });

    expect(selectVolumeFieldItems(after)).not.toBe(before);
  });
});
