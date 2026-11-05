import { describe, expect, it } from 'vitest';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';

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
    expect(next.cosmicWebFilaments).toBe(INITIAL_SETTINGS.cosmicWebFilaments);
  });

  it('setVisibility writes a scalar switch', () => {
    const next = settingsReducer(
      INITIAL_SETTINGS,
      setVisibility({ cluster: 'flow', field: 'enabled', on: !INITIAL_SETTINGS.flow.enabled }),
    );
    expect(next.flow).toEqual({
      ...INITIAL_SETTINGS.flow,
      enabled: !INITIAL_SETTINGS.flow.enabled,
    });
    expect(next.milkyWay).toBe(INITIAL_SETTINGS.milkyWay);
  });

  // The pattern `setBlackHoleLabelEnabled` once had: a write that replaces the row drops
  // the row's other switch.
  it("an item write leaves the item's other fields intact", () => {
    const before = settingsReducer(
      INITIAL_SETTINGS,
      setVisibility({ cluster: 'galaxyCatalogs', item: 'sdss', field: 'labelEnabled', on: false }),
    );
    const next = settingsReducer(
      before,
      setVisibility({ cluster: 'galaxyCatalogs', item: 'sdss', field: 'enabled', on: false }),
    );
    expect(next.galaxyCatalogs.items.sdss).toEqual({ enabled: false, labelEnabled: false });
    expect(next.galaxyCatalogs.items.glade).toBe(INITIAL_SETTINGS.galaxyCatalogs.items.glade);
  });

  it('setVisibility never mints a switch', () => {
    expect(() =>
      settingsReducer(
        INITIAL_SETTINGS,
        setVisibility({ cluster: 'galaxyCatalogs', field: 'enabled', on: false }),
      ),
    ).toThrow(/galaxyCatalogs/);
  });
});
