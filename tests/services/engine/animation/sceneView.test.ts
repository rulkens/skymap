import { describe, it, expect } from 'vitest';
import type { Action } from '@reduxjs/toolkit';
import { sceneView } from '../../../../src/services/engine/animation/sceneView';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { rootReducer } from '../../../../src/store/rootReducer';
import { setFlowEnabled } from '../../../../src/layers/flow/state/flow/slice';
import { setVisibility } from '../../../../src/state/settings/setVisibilityAction';
import { updateSelectionFocus } from '../../../../src/state/selection/selectionSlice';
import { setSelectionRow } from '../../../../src/state/selectionRows/selectionRowsSlice';
import {
  frameTo,
  hide,
  scene,
  seq,
  show,
  wait,
} from '../../../../src/services/engine/animation/effectHelpers';
import { deepFreeze } from '../../../helpers/deepFreeze';
import type { Effect } from '../../../../src/@types/animation/Effect';

const INTENT_FOCUS = { type: 'galaxy', id: 'm31' };

// The user's intent: flow off, sdss off, a focus with its row. Frozen, so a write into it throws.
const ROOT = deepFreeze(
  [
    setFlowEnabled(false),
    setVisibility({ cluster: 'galaxyCatalogs', item: 'sdss', field: 'enabled', on: false }),
    updateSelectionFocus(INTENT_FOCUS),
    setSelectionRow({ slot: 'focus', row: { type: 'galaxy' }, focusId: 'm31' }),
  ].reduce<ReturnType<typeof rootReducer>>(
    (s, a: Action) => rootReducer(s, a),
    rootReducer(undefined, { type: '@@init' }),
  ),
);

const tracksOf = (timeline: Effect[]) => compileClip({ timeline }).scene;

describe('sceneView', () => {
  it('folds the applied steps over intent and leaves the rest', () => {
    const tracks = tracksOf([seq([wait(1), show(['flow']), wait(2), hide(['flow'])])]);
    const view = sceneView(ROOT, tracks, { steps: 1, focus: 0 }, null);
    expect(view.settings.flow.enabled).toBe(true);
    expect(ROOT.settings.flow.enabled).toBe(false);
    expect(sceneView(ROOT, tracks, { steps: 2, focus: 0 }, null).settings.flow.enabled).toBe(false);
  });

  it('carries each kind into the view', () => {
    const tracks = tracksOf([
      show(['survey:sdss']),
      scene(setFlowEnabled(true)),
      frameTo('supergalactic', { over: 1 }),
    ]);
    const view = sceneView(ROOT, tracks, { steps: 3, focus: 0 }, null);
    expect(view.settings.galaxyCatalogs.items.sdss.enabled).toBe(true);
    expect(view.settings.flow.enabled).toBe(true);
    expect(view.settings.orientation).toBe('supergalactic');
  });

  it('focus: a null step clears, no focus step leaves the intent focus', () => {
    const tracks = tracksOf([seq([wait(1), { kind: 'focus', ref: null }])]);
    const cleared = sceneView(ROOT, tracks, { steps: 0, focus: 1 }, { row: null, focusId: null });
    expect(cleared.selection.focus).toBeNull();
    expect(cleared.selectionRows.focus).toBeNull();
    expect(cleared.selectionRows.focusId).toBeNull();

    const kept = sceneView(ROOT, tracksOf([show(['flow'])]), { steps: 1, focus: 0 }, null);
    expect(kept.selection).toBe(ROOT.selection);
    expect(kept.selectionRows).toBe(ROOT.selectionRows);
  });

  it('focus: the row and focusId come from the focusRow argument', () => {
    const ref = { type: 'galaxy', id: 'm87' };
    const tracks = tracksOf([{ kind: 'focus', ref }]);
    const row = { type: 'galaxy', name: 'M87' };
    const view = sceneView(ROOT, tracks, { steps: 0, focus: 1 }, { row, focusId: 'm87' });
    expect(view.selection.focus).toEqual(ref);
    expect(view.selectionRows.focus).toBe(row);
    expect(view.selectionRows.focusId).toBe('m87');
  });

  it('with nothing applied is the root itself', () => {
    expect(sceneView(ROOT, tracksOf([show(['flow'])]), { steps: 0, focus: 0 }, null)).toBe(ROOT);
  });
});
