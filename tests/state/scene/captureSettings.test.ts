/**
 * captureSettings — unit tests for the tour's settings-snapshot capture.
 *
 * The cinematic tour captures the user's settings, plays an effect that
 * mutates them, then restores the capture. These tests pin the properties
 * that make that round-trip sound:
 *
 *   1. *Scope* — every Layer cluster plus the core snapshot list is captured, and
 *      excluded fields (e.g. `tonemap`, `orientation`) never leak into the
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
import { APP_SETTINGS_SLICES } from '../../../src/compositions/appSettingsSlices';
import { CORE_SNAPSHOT_CLUSTERS } from '../../../src/data/settings/coreSnapshotClusters';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';

const SNAPSHOT_KEYS = [
  ...APP_SETTINGS_SLICES.map((slice) => slice.reducerPath),
  ...CORE_SNAPSHOT_CLUSTERS,
].sort();

/** The full fixture plus `orientation` and `tonemap`, which must never be captured. */
function makeState() {
  return {
    settings: { ...makeSettingsFixture(), orientation: 'galactic' },
  } as unknown as Pick<RootState, 'settings'>;
}

describe('captureSettings', () => {
  it('captures every Layer cluster and the four core ones', () => {
    const state = makeState();
    const snap = captureSettings(state);

    expect(Object.keys(snap).sort()).toEqual(SNAPSHOT_KEYS);
    expect(CORE_SNAPSHOT_CLUSTERS).toHaveLength(4);
    for (const key of SNAPSHOT_KEYS) {
      expect((snap as Record<string, unknown>)[key]).toEqual(
        (state.settings as unknown as Record<string, unknown>)[key],
      );
    }
  });

  it('captures a Layer cluster it was never told about', () => {
    // `earth` was absent from the old hand-kept list.
    const snap = captureSettings(makeState());

    expect(snap.earth).toEqual(makeSettingsFixture().earth);
  });

  it('never captures orientation', () => {
    // It rides `SceneSnapshot` instead, so a beat-boundary `mergeSnapshot`
    // built from this type cannot revert the tour's live-authored pole.
    expect(captureSettings(makeState())).not.toHaveProperty('orientation');
  });

  it('never captures tonemap', () => {
    expect(captureSettings(makeState())).not.toHaveProperty('tonemap');
  });

  it('is detached — mutating live settings does not change the snapshot', () => {
    const state = makeState();
    const snap = captureSettings(state);
    const flowSpeed = snap.flow.flowSpeed;
    const brightness = snap.galaxyCatalogs.brightness;
    const ambientLight = snap.earth.ambientLight;

    state.settings.flow.flowSpeed = flowSpeed + 1;
    state.settings.galaxyCatalogs.brightness = brightness + 42;
    state.settings.earth.ambientLight = ambientLight + 1;

    expect(snap.flow.flowSpeed).toBe(flowSpeed);
    expect(snap.galaxyCatalogs.brightness).toBe(brightness);
    expect(snap.earth.ambientLight).toBe(ambientLight);
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
