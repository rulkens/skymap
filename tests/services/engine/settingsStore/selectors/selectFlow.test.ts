import { describe, it, expect } from 'vitest';

import { selectFlow } from '../../../../../src/services/engine/settingsStore/selectors/selectFlow';
import { setFlow } from '../../../../../src/services/engine/settingsStore/reducers/setFlow';
import { setVolumesEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setVolumesEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('selectFlow', () => {
  it('returns the underlying flow object by reference', () => {
    const state = makeSettingsFixture();

    expect(selectFlow(state)).toBe(state.flow);
  });

  it('returns the SAME ref when an unrelated cluster changes (stable-ref contract)', () => {
    // The whole reason this selector returns the raw object rather than a spread
    // copy: `useSyncExternalStore`'s getSnapshot must be stable.
    const state = makeSettingsFixture();
    const before = selectFlow(state);

    const afterVolumes = setVolumesEnabled(state, !state.volumes.enabled);
    expect(selectFlow(afterVolumes)).toBe(before);
  });

  it('returns a NEW ref when the flow slice actually changes', () => {
    const state = makeSettingsFixture();
    const before = selectFlow(state);

    const after = setFlow(state, { intensity: 0.33 });

    expect(selectFlow(after)).not.toBe(before);
  });
});
