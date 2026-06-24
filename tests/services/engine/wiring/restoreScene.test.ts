/**
 * restoreScene — unit tests for the widened tour scene-restore close.
 *
 * The bridge (`syncVisibilityFades`) is mocked to a typed spy, matching the
 * `restoreSettings` test style. These tests assert restoreScene's own contract:
 *
 *   1. Settings restore (via `restoreSettings`) fires BEFORE focus restore.
 *   2. Focus is dispatched through the production `updateSelectionFocus` action,
 *      not applied by any other means.
 *   3. A null focus snapshot dispatches `updateSelectionFocus(null)` — the
 *      selection slot is cleared, not left at whatever the beat had set it to.
 *
 * The `syncVisibilityFades` bridge's own fade behaviour is covered by its suite.
 * `restoreSettings`'s settings-write behaviour is covered by its suite. These
 * tests focus on the ordering guarantee and the focus dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { AppStore } from '../../../../src/store/types';
import { createAppStore } from '../../../../src/store/createAppStore';
import { syncVisibilityFades } from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { restoreScene } from '../../../../src/services/engine/wiring/restoreScene';
import { mergeSnapshot } from '../../../../src/state/settings/settingsSlice';
import { updateSelectionFocus } from '../../../../src/state/selection/selectionSlice';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';
import type { SceneSnapshot } from '../../../../src/@types/engine/settings/SceneSnapshot';

vi.mock('../../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

const bridge = vi.mocked(syncVisibilityFades);

/**
 * A real settings store plus a `state` whose `settings`/`selection` getters
 * delegate to it — mirrors the engine's getter pattern so a `dispatch` write
 * is observable through `state.settings` and `state.selection`.
 */
function makeHarness(): { store: AppStore; state: EngineState } {
  const { store } = createAppStore({ settings: makeSettingsFixture() });
  const state = {
    get settings() {
      return store.getState().settings;
    },
    get selection() {
      return store.getState().selection;
    },
  } as unknown as EngineState;
  return { store, state };
}

const FOCUS_REF: SelectionRef = { type: 'structure', id: 'virgo-cluster' };

/** A snapshot with settings that differ from the fixture + a non-null focus. */
function makeSnapshot(focus: SelectionRef | null = FOCUS_REF): SceneSnapshot {
  const f = makeSettingsFixture();
  return {
    settings: {
      galaxyCatalogs: { ...f.galaxyCatalogs, enabled: !f.galaxyCatalogs.enabled },
      structures: { ...f.structures, enabled: !f.structures.enabled },
      volumes: { ...f.volumes, enabled: !f.volumes.enabled },
      filaments: { ...f.filaments, intensity: 0.42 },
      milkyWay: { ...f.milkyWay, enabled: !f.milkyWay.enabled },
      flow: { ...f.flow, flowSpeed: 7 },
    },
    focus,
  };
}

describe('restoreScene', () => {
  beforeEach(() => bridge.mockClear());

  it('restores settings then re-dispatches focus', () => {
    const { store, state } = makeHarness();
    const snapshot = makeSnapshot(FOCUS_REF);

    // Spy on dispatch to observe action types and call order.
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    restoreScene(state, store, snapshot, { animate: true });

    // Both actions must have been dispatched.
    const actionTypes = dispatchSpy.mock.calls.map((call) => (call[0] as { type: string }).type);
    expect(actionTypes).toContain(mergeSnapshot(snapshot.settings).type);
    expect(actionTypes).toContain(updateSelectionFocus(FOCUS_REF).type);

    // Settings (mergeSnapshot) must fire BEFORE focus (updateSelectionFocus).
    const mergeIdx = actionTypes.indexOf(mergeSnapshot(snapshot.settings).type);
    const focusIdx = actionTypes.indexOf(updateSelectionFocus(FOCUS_REF).type);
    expect(mergeIdx).toBeLessThan(focusIdx);
  });

  it('restoreScene with focus null clears selection focus', () => {
    const { store, state } = makeHarness();
    const snapshot = makeSnapshot(null);

    const dispatchSpy = vi.spyOn(store, 'dispatch');

    restoreScene(state, store, snapshot, { animate: false });

    // updateSelectionFocus(null) must have been dispatched.
    const actionTypes = dispatchSpy.mock.calls.map((call) => (call[0] as { type: string }).type);
    expect(actionTypes).toContain(updateSelectionFocus(null).type);

    // After dispatch, the store's selection.focus must be null.
    expect(store.getState().selection.focus).toBeNull();
  });
});
