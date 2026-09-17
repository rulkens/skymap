import { describe, expect, it } from 'vitest';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';

describe('settingsReducer', () => {
  // The one reducer that replaces the whole root — it cannot live in a slice.
  // `bloom` is not part of `SettingsSnapshot` (the tour never restores it —
  // see that type's header), so this uses `labels`, which is.
  it('lays a partial snapshot over the root, cluster by cluster', () => {
    const next = settingsReducer(
      INITIAL_SETTINGS,
      mergeSnapshot({ labels: { focusedOnly: true } }),
    );
    expect(next.labels).toEqual({ focusedOnly: true });
    expect(next.filaments).toBe(INITIAL_SETTINGS.filaments);
  });
});
