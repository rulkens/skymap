/**
 * applySceneEffect — every arm runs against a spy `dispatch`: the arms only dispatch, and
 * the show/hide writes read settings only for the section rule.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Action } from '@reduxjs/toolkit';

import { applySceneEffect } from '../../../src/services/animation/applySceneEffect';
import { frameTo, hide, show } from '../../../src/services/engine/animation/effectHelpers';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../src/state/settings/setVisibilityAction';
import { setOrientation } from '../../../src/state/settings/core/orientationSlice';
import { startFrameTween } from '../../../src/state/camera/cameraSlice';
import { matrixToQuaternion } from '../../../src/utils/math/matrixToQuaternion';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { AppStore } from '../../../src/store/types';
import { setFlowEnabled } from '../../../src/layers/flow/state/flow/slice';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A fake EngineState: the arms read only the live settings (and frameTo the camera).
 */
function makeEngineState(settings: EngineSettingsState = INITIAL_SETTINGS): EngineState {
  return { settings } as unknown as EngineState;
}

/**
 * Build a spy store: a minimal AppStore shape where `dispatch` is a vi.fn
 * and `getState` returns a minimal state. Suitable for arms that don't need
 * real state reads.
 */
function makeSpyStore(): {
  store: AppStore;
  dispatch: ReturnType<typeof vi.fn<(a: Action) => Action>>;
} {
  const dispatch = vi.fn<(a: Action) => Action>((a) => a);
  const store = {
    dispatch,
    getState: () => ({ settings: INITIAL_SETTINGS }),
    subscribe: vi.fn(),
  } as unknown as AppStore;
  return { store, dispatch };
}

// ── scene ─────────────────────────────────────────────────────────────────────

describe('applySceneEffect — scene', () => {
  it('dispatches its SettingsAction verbatim', () => {
    const state = makeEngineState();
    const { store, dispatch } = makeSpyStore();
    const action = setFlowEnabled(true);

    applySceneEffect({ kind: 'scene', action }, { state, store });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(action);
  });
});

// ── focus ─────────────────────────────────────────────────────────────────────

describe('applySceneEffect — focus', () => {
  it('dispatches updateSelectionFocus(ref) for a non-null ref', () => {
    const state = makeEngineState();
    const { store, dispatch } = makeSpyStore();
    const ref = { kind: 'structure', id: 'virgoCluster' } as unknown as Parameters<
      typeof updateSelectionFocus
    >[0];

    applySceneEffect({ kind: 'focus', ref }, { state, store });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(updateSelectionFocus(ref));
  });
});

// ── frameTo ─────────────────────────────────────────────────────────────────

describe('applySceneEffect — frameTo', () => {
  it('firing a frameTo cue dispatches setOrientation + startFrameTween with the live basis fromQuat', () => {
    // A known, non-identity live basis: a 90° rotation about X (column-major).
    // Seeding the roll from THIS matrix — not the destination frame's steady
    // pole — is the crux: a frameTo firing mid-roll must compose from wherever
    // the pole is now, so the fromQuat is matrixToQuaternion(the live basis).
    const liveBasis: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const state = {
      ...makeEngineState(),
      cameraRuntime: { outputs: { upBasis: liveBasis } },
    } as unknown as EngineState;
    const { store, dispatch } = makeSpyStore();

    applySceneEffect(frameTo('galactic', { over: 1 }), { state, store });

    // Order matters (setOrientation first, then the roll), matching the saga.
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]![0]).toEqual(setOrientation('galactic'));
    expect(dispatch.mock.calls[1]![0]).toEqual(
      startFrameTween({
        fromQuat: matrixToQuaternion(liveBasis),
        to: 'galactic',
        durationMs: 1000,
        easing: 'easeInOutCubic',
      }),
    );
  });
});

// ── show / hide ───────────────────────────────────────────────────────────────
//
// The duration rides every write: the reactive fade sync each write wakes is the only sync,
// so a cue that dropped or misconverted `overMs` would fade over the defaults.

describe('applySceneEffect — show / hide', () => {
  function run(effect: Parameters<typeof applySceneEffect>[0]) {
    const { store, dispatch } = makeSpyStore();
    applySceneEffect(effect, { state: makeEngineState(INITIAL_SETTINGS), store });
    return dispatch.mock.calls.map(([a]) => a);
  }

  it('writes each arg through setVisibility, scoped args to their one item', () => {
    expect(run(show(['flow', 'survey:milliquas']))).toEqual([
      setVisibility({ cluster: 'flow', field: 'enabled', on: true }),
      setVisibility({ cluster: 'galaxyCatalogs', item: 'milliquas', field: 'enabled', on: true }),
    ]);
  });

  it('converts `over` seconds to `overMs` on every write', () => {
    // Forwarding seconds unconverted once made a 9-second reveal a 9-millisecond pop.
    const actions = run(hide(['survey'], 9)) as ReturnType<typeof setVisibility>[];
    expect(actions.length).toBeGreaterThan(1);
    for (const a of actions) expect(a.payload).toMatchObject({ on: false, overMs: 9000 });
  });

  it('carries over: 0 as a snap and omits overMs when over is absent', () => {
    const [snap] = run(show(['flow'], 0)) as ReturnType<typeof setVisibility>[];
    expect(snap!.payload.overMs).toBe(0);
    const [plain] = run(show(['flow'])) as ReturnType<typeof setVisibility>[];
    expect('overMs' in plain!.payload).toBe(false);
  });
});

// ── fade throws (caller bug) ──────────────────────────────────────────────────

describe('applySceneEffect — fade', () => {
  it('throws when a fade effect is routed here (caller bug guard)', () => {
    const state = makeEngineState();
    const { store } = makeSpyStore();

    expect(() =>
      applySceneEffect(
        { kind: 'fade', args: ['cosmicWebFilaments'], to: 0, over: 500 },
        { state, store },
      ),
    ).toThrow();
  });
});
