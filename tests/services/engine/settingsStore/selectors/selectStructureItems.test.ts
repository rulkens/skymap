import { describe, it, expect } from 'vitest';

import { selectStructureItems } from '../../../../../src/services/engine/settingsStore/selectors/selectStructureItems';
import { setStructureItemEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setStructureItemEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectStructureItems', () => {
  it('returns the underlying structures.items Record by reference', () => {
    const state = makeSettingsFixture();

    expect(selectStructureItems(state)).toBe(state.structures.items);
  });

  it('returns the SAME ref when an unrelated cluster changes (stable-ref contract)', () => {
    // The whole reason this selector returns the raw Record rather than a
    // projected visibility map: `useSyncExternalStore`'s getSnapshot must be
    // stable.
    const state = makeSettingsFixture();
    const before = selectStructureItems(state);

    // Toggle the sibling master gate — a write to structures.enabled, NOT items.
    const afterMaster = { ...state, structures: { ...state.structures, enabled: false } };
    expect(selectStructureItems(afterMaster)).toBe(before);

    // A wholly-unrelated cluster (brightness lives on surveys) also must not
    // disturb the items ref.
    const afterSurveys = { ...state, surveys: { ...state.surveys, brightness: 0.123 } };
    expect(selectStructureItems(afterSurveys)).toBe(before);
  });

  it('returns a NEW ref when a category actually changes', () => {
    const state = makeSettingsFixture();
    const before = selectStructureItems(state);

    const after = setStructureItemEnabled(state, 'cluster', false);

    expect(selectStructureItems(after)).not.toBe(before);
  });
});
