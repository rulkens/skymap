/**
 * captureSettings — unit tests for the tour's settings-snapshot capture.
 *
 * The cinematic tour captures the user's settings, plays an effect that
 * mutates them, then restores the capture. These tests pin the properties
 * that make that round-trip sound:
 *
 *   1. *Scope* — exactly the ten tour-owned clusters are captured, and
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
import { captureSettings } from '../../../src/state/tour/captureSettings';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';

const SNAPSHOT_KEYS = [
  'bodies',
  'filaments',
  'flow',
  'galaxyCatalogs',
  'labels',
  'milkyWay',
  'orbitTrails',
  'starCatalogs',
  'structures',
  'volumes',
].sort();

/**
 * A minimal `state` carrying the ten tour-owned clusters plus one
 * deliberately-excluded cluster (`tonemap`) to prove it's dropped. Only
 * the fields the assertions touch are populated; the rest of each cluster
 * is irrelevant to capture's whole-cluster clone, so we cast through
 * `unknown` rather than build a full `EngineSettingsState`.
 */
function makeState() {
  return {
    settings: {
      galaxyCatalogs: { enabled: true, sizePx: 4, brightness: 1 },
      structures: { enabled: true, items: {} },
      volumes: { enabled: false, items: {} },
      filaments: { enabled: true, intensity: 0.5 },
      milkyWay: { enabled: true, labelEnabled: false },
      flow: { enabled: true, nested: { speed: 2 } },
      orbitTrails: { enabled: true },
      starCatalogs: { enabled: true, items: {} },
      bodies: { items: {} },
      labels: { focusedOnly: false },
      orientation: 'galactic',
      // Excluded — must NOT appear in the snapshot.
      tonemap: { exposure: 1.2, curve: 'aces' },
    },
  } as unknown as Pick<RootState, 'settings'>;
}

describe('captureSettings', () => {
  it('clones exactly the ten tour-owned clusters', () => {
    const state = makeState();
    const snap = captureSettings(state);

    expect(Object.keys(snap).sort()).toEqual(SNAPSHOT_KEYS);
    // Excluded cluster dropped.
    expect(snap).not.toHaveProperty('tonemap');
    // `orientation` must never reach this snapshot — it rides `SceneSnapshot`
    // instead, precisely so a beat-boundary `mergeSnapshot` dispatch built from
    // this type cannot revert the tour's live-authored pole (see
    // `SceneSnapshot`'s header).
    expect(snap).not.toHaveProperty('orientation');
    // The ten captured clusters deep-equal their source.
    for (const key of SNAPSHOT_KEYS) {
      expect((snap as Record<string, unknown>)[key]).toEqual(
        (state.settings as unknown as Record<string, unknown>)[key],
      );
    }
  });

  it('is detached — mutating live settings does not change the snapshot', () => {
    const state = makeState();
    const snap = captureSettings(state);

    // Top-level field flip on a captured cluster.
    state.settings.flow.enabled = !state.settings.flow.enabled;
    expect(snap.flow.enabled).toBe(true);

    // Nested-field mutation in another cluster proves deep detachment.
    (state.settings.flow as unknown as { nested: { speed: number } }).nested.speed = 999;
    expect((snap.flow as unknown as { nested: { speed: number } }).nested.speed).toBe(2);

    state.settings.galaxyCatalogs.brightness = 42;
    expect(snap.galaxyCatalogs.brightness).toBe(1);
  });

  it('captures the per-body and per-star-catalog label gates', () => {
    const settings = makeSettingsFixture();
    settings.bodies.items.earth.labelEnabled = false;
    settings.starCatalogs.items.famousStar.labelEnabled = false;

    const snap = captureSettings({ settings });

    expect(snap.bodies.items.earth.labelEnabled).toBe(false);
    expect(snap.starCatalogs.items.famousStar.labelEnabled).toBe(false);
  });

  it('detaches the per-body capture from later mutation', () => {
    const settings = makeSettingsFixture();
    const snap = captureSettings({ settings });
    settings.bodies.items.earth.labelEnabled = false;

    expect(snap.bodies.items.earth.labelEnabled).toBe(true);
  });
});
