import { describe, expect, it } from 'vitest';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import { setFilamentsEnabled } from '../../../src/layers/filaments/settings/filamentsSlice';
import { setBloomStrength } from '../../../src/state/settings/core/bloomSlice';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';

describe('settingsReducer', () => {
  it('routes a Layer action to that Layer cluster and leaves the rest by reference', () => {
    const next = settingsReducer(INITIAL_SETTINGS, setFilamentsEnabled(false));
    expect(next.filaments.enabled).toBe(false);
    // Structural sharing is what React selectors over untouched clusters rely on.
    expect(next.bloom).toBe(INITIAL_SETTINGS.bloom);
  });

  it('routes a core action to its core cluster', () => {
    const next = settingsReducer(INITIAL_SETTINGS, setBloomStrength(0.25));
    expect(next.bloom.strength).toBe(0.25);
  });

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
