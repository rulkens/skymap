import { describe, it, expect } from 'vitest';

import { setMilkyWayEnabled } from '../../../../../src/services/engine/settingsStore/reducers/setMilkyWayEnabled';
import { makeSettingsFixture } from '../makeSettingsFixture';

describe('setMilkyWayEnabled', () => {
  it('copies-on-write the milkyWay cluster', () => {
    const state = makeSettingsFixture();
    const next = setMilkyWayEnabled(state, false);

    expect(next.milkyWay.enabled).toBe(false);
    // The touched cluster is a NEW reference …
    expect(next.milkyWay).not.toBe(state.milkyWay);
    // … but a sibling cluster keeps its existing reference (structural sharing).
    expect(next.galaxyCatalogs).toBe(state.galaxyCatalogs);
  });

  it('stores the boolean verbatim in either direction', () => {
    const state = makeSettingsFixture();

    expect(setMilkyWayEnabled(state, true).milkyWay.enabled).toBe(true);
    expect(setMilkyWayEnabled(state, false).milkyWay.enabled).toBe(false);
  });

  it('leaves the input state unmutated', () => {
    const state = makeSettingsFixture();
    const before = state.milkyWay.enabled;

    setMilkyWayEnabled(state, !before);

    expect(state.milkyWay.enabled).toBe(before);
  });
});
