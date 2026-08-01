/**
 * captureScene — unit tests for the widened tour scene-snapshot capture.
 *
 * A tour beat may mutate the ten settings clusters, `settings.orientation`
 * (via a `frameTo` cue), AND `selection.focus`; restore must wind all three
 * back. These tests pin the properties that make the scene-level capture
 * sound:
 *
 *   1. *Scope* — the snapshot carries all ten settings clusters (via
 *      `snap.settings`), `orientation` as a SIBLING of `settings` (not inside
 *      it — see `SceneSnapshot`'s header for why), AND the focus ref from
 *      `state.selection.focus`.
 *   2. *Detachment* — the settings half is a deep clone (via `captureSettings`);
 *      the focus half is a reference copy of an immutable identity value. A
 *      later write to `state.selection.focus` (a new ref object replacing the
 *      slot) must leave the captured ref unchanged.
 */

import { describe, it, expect } from 'vitest';
import type { RootState } from '../../../src/store/types';
import type { SelectionRef } from '../../../src/@types/engine/SelectionRef';
import { captureScene } from '../../../src/state/tour/captureScene';

const SNAPSHOT_SETTINGS_KEYS = [
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

const FOCUS_REF: SelectionRef = { type: 'structure', id: 'virgo-cluster' };

/**
 * A minimal state carrying the ten tour-owned settings clusters plus a
 * non-null `selection.focus`. Cast through `unknown` rather than building
 * full cluster shapes — only the fields assertions touch are needed.
 */
function makeState(focus: SelectionRef | null = FOCUS_REF) {
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
      orientation: 'galactic',
      tonemap: { exposure: 1.2 },
    },
    selection: { hover: null, select: null, focus },
  } as unknown as RootState;
}

describe('captureScene', () => {
  it('captures the ten settings clusters + orientation + selection.focus', () => {
    const state = makeState(FOCUS_REF);
    const snap = captureScene(state);

    // Settings half carries exactly the ten tour-owned clusters — orientation
    // is NOT among them.
    expect(Object.keys(snap.settings).sort()).toEqual(SNAPSHOT_SETTINGS_KEYS);
    expect(snap.settings).not.toHaveProperty('orientation');
    for (const key of SNAPSHOT_SETTINGS_KEYS) {
      expect((snap.settings as Record<string, unknown>)[key]).toEqual(
        (state.settings as unknown as Record<string, unknown>)[key],
      );
    }

    // Orientation rides as a sibling of settings.
    expect(snap.orientation).toBe('galactic');

    // Focus half carries the captured ref.
    expect(snap.focus).toEqual(FOCUS_REF);
  });

  it('captureScene is detached', () => {
    const state = makeState(FOCUS_REF);
    const snap = captureScene(state);

    // Settings detachment: mutation of a nested cluster field must not bleed
    // into the snapshot (structuredClone via captureSettings).
    state.settings.flow.enabled = !state.settings.flow.enabled;
    expect(snap.settings.flow.enabled).toBe(true);

    // Focus detachment: replacing state.selection.focus with a new ref must
    // not change the captured value. SelectionRef is an immutable identity
    // value — the slice replaces the slot, never mutates in place, so copying
    // the reference at capture time is sufficient.
    const laterRef: SelectionRef = { type: 'structure', id: 'coma-cluster' };
    (state as { selection: { focus: SelectionRef | null } }).selection.focus = laterRef;
    expect(snap.focus).toEqual(FOCUS_REF);
  });
});
