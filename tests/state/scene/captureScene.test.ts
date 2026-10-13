/**
 * captureScene — unit tests for the widened tour scene-snapshot capture.
 *
 * A tour beat may mutate the snapshot's settings clusters, `settings.orientation`
 * (via a `frameTo` cue), AND `selection.focus`; restore must wind all three
 * back. These tests pin the properties that make the scene-level capture
 * sound:
 *
 *   1. *Scope* — the snapshot carries `captureSettings`' output (as
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
import { captureScene } from '../../../src/state/scene/captureScene';
import { captureSettings } from '../../../src/state/scene/captureSettings';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';

const FOCUS_REF: SelectionRef = { type: 'structure', id: 'virgo-cluster' };

/**
 * A minimal state carrying the full settings fixture plus a
 * non-null `selection.focus`. Cast through `unknown` because the fixture
 * omits slices `captureScene` never reads.
 */
function makeState(focus: SelectionRef | null = FOCUS_REF) {
  return {
    settings: { ...makeSettingsFixture(), orientation: 'galactic' },
    selection: { hover: null, select: null, focus },
    time: {
      mode: 'manual',
      anchor: { simDays: 2460000, realMs: 1000 },
      rateIndex: 0,
      direction: 1,
      paused: false,
      profile: null,
    },
  } as unknown as RootState;
}

describe('captureScene', () => {
  it('captures every snapshot settings cluster + orientation + selection.focus', () => {
    const state = makeState(FOCUS_REF);
    const snap = captureScene(state, 0);

    expect(snap.settings).toEqual(captureSettings(state));
    expect(snap.settings).not.toHaveProperty('orientation');

    // Orientation rides as a sibling of settings.
    expect(snap.orientation).toBe('galactic');

    // Focus half carries the captured ref.
    expect(snap.focus).toEqual(FOCUS_REF);
  });

  it('re-anchors the clock at capture so anchor.simDays is the instant it showed', () => {
    const snap = captureScene(makeState(null), 1000 + 86_400_000);
    // Rate index 0 is 1 s/s: one real day later is one sim day later.
    expect(snap.time.anchor).toEqual({ simDays: 2460001, realMs: 1000 + 86_400_000 });
  });

  it('strips a riding profile and captures the interpolated instant', () => {
    const state = makeState(null) as unknown as { time: Record<string, unknown> };
    state.time.profile = {
      startWallMs: 1000,
      wallMs: Float64Array.from([0, 10_000]),
      simDays: Float64Array.from([2460000, 2460010]),
    };
    const snap = captureScene(state as unknown as RootState, 6000);
    expect(snap.time.profile).toBeNull();
    expect(snap.time.anchor).toEqual({ simDays: 2460005, realMs: 6000 });
  });

  it('captureScene is detached', () => {
    const state = makeState(FOCUS_REF);
    const snap = captureScene(state, 0);

    // Focus detachment: replacing state.selection.focus with a new ref must
    // not change the captured value. SelectionRef is an immutable identity
    // value — the slice replaces the slot, never mutates in place, so copying
    // the reference at capture time is sufficient.
    const laterRef: SelectionRef = { type: 'structure', id: 'coma-cluster' };
    (state as { selection: { focus: SelectionRef | null } }).selection.focus = laterRef;
    expect(snap.focus).toEqual(FOCUS_REF);
  });
});
