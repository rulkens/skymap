import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../../../src/store/rootReducer';
import { dollyTo, hold, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { injectStudioSlice } from '../../../src/session/state/injectStudioSlice';
import {
  draftResolved,
  paramEdited,
  studioOpened,
  undone,
} from '../../../src/session/state/studioSlice';
import {
  selectCurrentResolution,
  selectDraft,
  selectIsDirty,
  selectRedoLabel,
  selectRevision,
  selectStudioState,
  selectUndoLabel,
} from '../../../src/session/state/selectors';
import { HISTORY_LIMIT } from '../../../src/session/data/studioLimits';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { ClipId } from '../../../../../src/@types/animation/ClipId';
import type { PreviewPins } from '../../../src/@types/session/PreviewPins';

const PREVIEW: PreviewPins = {
  startPose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 },
  simDays: 2451545,
  frame: 'equatorial',
  fovYRad: 0.8,
};
const DISTANCE = { kind: 'effect', path: [0, 0] } as const;

function open(
  clipId: ClipId = 'cosmicFlows',
  draft: ClipData = { timeline: [seq([dollyTo(300, 4), hold(1)])] },
) {
  injectStudioSlice();
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(studioOpened({ clipId, draft, preview: PREVIEW }));
  return store;
}

const edit = (value: number, gesture: string | null, label = 'Distance') =>
  paramEdited({ ref: DISTANCE, param: 'to', value, label, gesture });

describe('studioSlice', () => {
  it('paramEdited pushes one history entry and bumps the revision', () => {
    const store = open();
    const before = selectDraft(store.getState());
    const revision = selectRevision(store.getState());

    store.dispatch(edit(950, null));

    const studio = selectStudioState(store.getState());
    expect(studio.history.past).toEqual([{ draft: before, label: 'Distance', gesture: null }]);
    expect(studio.revision).toBe(revision + 1);
    expect(studio.draft?.timeline[0]).toMatchObject({ children: [{ to: 950 }, {}] });
  });

  it('edits with the same gesture coalesce into one entry; a new gesture starts another', () => {
    const store = open();
    const opened = selectDraft(store.getState());

    store.dispatch(edit(310, 'g1'));
    store.dispatch(edit(320, 'g1'));
    const afterFirstGesture = selectDraft(store.getState());
    store.dispatch(edit(330, 'g2'));

    const { past } = selectStudioState(store.getState()).history;
    expect(past.map((e) => e.draft)).toEqual([opened, afterFirstGesture]);
  });

  it('undoing back to the opened draft makes the studio clean again', () => {
    const store = open();
    const opened = selectDraft(store.getState());
    store.dispatch(edit(310, 'g1'));
    store.dispatch(edit(320, 'g2'));
    expect(selectIsDirty(store.getState())).toBe(true);

    store.dispatch(undone());
    store.dispatch(undone());

    expect(selectIsDirty(store.getState())).toBe(false);
    expect(selectDraft(store.getState())).toBe(opened);
    expect(selectUndoLabel(store.getState())).toBeNull();
    expect(selectRedoLabel(store.getState())).toBe('Distance');
  });

  it('an edit after undo clears redo', () => {
    const store = open();
    store.dispatch(edit(310, 'g1'));
    store.dispatch(undone());
    expect(selectRedoLabel(store.getState())).toBe('Distance');

    store.dispatch(edit(500, 'g2', 'Time'));

    expect(selectRedoLabel(store.getState())).toBeNull();
    expect(selectUndoLabel(store.getState())).toBe('Time');
  });

  it('history keeps at most HISTORY_LIMIT entries, dropping the oldest', () => {
    const store = open();
    const opened = selectDraft(store.getState());
    store.dispatch(edit(1, null));
    const afterFirst = selectDraft(store.getState());
    for (let i = 2; i <= HISTORY_LIMIT + 1; i++) store.dispatch(edit(i, null));

    const { past } = selectStudioState(store.getState()).history;
    expect(past).toHaveLength(HISTORY_LIMIT);
    expect(past[0]!.draft).not.toBe(opened);
    expect(past[0]!.draft).toBe(afterFirst);
  });

  it('reopening the same clip keeps an unsaved draft; opening another replaces it', () => {
    const store = open('cosmicFlows');
    store.dispatch(edit(950, null));
    const edited = selectDraft(store.getState());

    store.dispatch(
      studioOpened({ clipId: 'cosmicFlows', draft: { timeline: [] }, preview: PREVIEW }),
    );
    expect(selectDraft(store.getState())).toBe(edited);
    expect(selectUndoLabel(store.getState())).toBe('Distance');

    const other: ClipData = { timeline: [hold(2)] };
    store.dispatch(studioOpened({ clipId: 'flowOrbit', draft: other, preview: PREVIEW }));
    expect(selectDraft(store.getState())).toBe(other);
    expect(selectIsDirty(store.getState())).toBe(false);
    expect(selectUndoLabel(store.getState())).toBeNull();
  });

  it('a resolution for a stale revision is ignored by selectCurrentResolution', () => {
    const store = open();
    const opened = selectRevision(store.getState());
    store.dispatch(edit(950, null));
    const resolved = { revision: opened + 1, data: { timeline: [] } };

    store.dispatch(draftResolved({ revision: opened, data: { timeline: [] } }));
    expect(selectCurrentResolution(store.getState())).toBeNull();

    store.dispatch(draftResolved(resolved));
    expect(selectCurrentResolution(store.getState())).toEqual(resolved);

    store.dispatch(edit(960, null));
    expect(selectCurrentResolution(store.getState())).toBeNull();
  });
});
