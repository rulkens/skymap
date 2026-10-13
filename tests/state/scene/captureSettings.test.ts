/**
 * captureSettings — unit tests for the tour's settings-snapshot capture.
 *
 * The cinematic tour captures the user's settings, plays an effect that
 * mutates them, then restores the capture. These tests pin the properties
 * that make that round-trip sound:
 *
 *   1. *Scope* — excluded fields (e.g. `tonemap`, `orientation`) never leak into the
 *      snapshot. `orientation` is captured separately by `captureScene` onto
 *      `SceneSnapshot` — see that type's header for why it must not ride here.
 *   2. *Detachment* — the snapshot is a deep, independent copy; a later
 *      mutation of the live `state.settings` (top-level or nested) must
 *      not change the captured value.
 *   3. *The per-body and per-star-catalog caption gates* — these moved out
 *      of the cross-cutting `labels` cluster into `bodies.items[*]` and
 *      `starCatalogs.items[*]`, and a missing `Pick` member is a smaller
 *      type, not a compiler error, so nothing else catches a regression here.
 */

import { describe, it, expect } from 'vitest';
import type { RootState } from '../../../src/store/types';
import { captureSettings } from '../../../src/state/scene/captureSettings';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';

/** The full fixture plus `orientation` and `tonemap`, which must never be captured. */
function makeState() {
  return {
    settings: { ...makeSettingsFixture(), orientation: 'galactic' },
  } as unknown as Pick<RootState, 'settings'>;
}

describe('captureSettings', () => {
  it('captures a Layer cluster it was never told about', () => {
    // `earth` was absent from the old hand-kept list.
    const snap = captureSettings(makeState());

    expect(snap.earth).toEqual(makeSettingsFixture().earth);
  });

  it.each(['orientation', 'tonemap', 'bloom', 'hdr', 'debug'])('never captures %s', (key) => {
    expect(captureSettings(makeState())).not.toHaveProperty(key);
  });

  it('is detached — a nested write to live settings does not change the snapshot', () => {
    const state = makeState();
    const snap = captureSettings(state);
    const captured = snap.bodies.items.earth.labelEnabled;

    state.settings.bodies.items.earth.labelEnabled = !captured;

    expect(snap.bodies.items.earth.labelEnabled).toBe(captured);
  });

  it('captures the per-body and per-star-catalog label gates', () => {
    const settings = makeSettingsFixture();
    settings.bodies.items.earth.labelEnabled = false;
    settings.starCatalogs.items.famousStar.labelEnabled = false;

    const snap = captureSettings({ settings });

    expect(snap.bodies.items.earth.labelEnabled).toBe(false);
    expect(snap.starCatalogs.items.famousStar.labelEnabled).toBe(false);
  });
});
