// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, render, screen } from '@testing-library/react';
import { rootReducer } from '../../../../../src/store/rootReducer';
import {
  dollyTo,
  dollyToId,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';
import Inspector from '../../../src/inspector/components/Inspector/Inspector';
import { injectStudioSlice } from '../../../src/session/state/injectStudioSlice';
import {
  draftResolved,
  paramEdited,
  rowSelected,
  studioOpened,
} from '../../../src/session/state/studioSlice';
import { selectDraft, selectRevision } from '../../../src/session/state/selectors';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { FocusId } from '../../../../../src/@types/animation/FocusId';

afterEach(cleanup);

const PREVIEW = {
  startPose: { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 10 },
  simDays: 2451545,
  frame: 'equatorial' as const,
  fovYRad: 0.8,
};

function open(draft: ClipData) {
  injectStudioSlice();
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(studioOpened({ clipId: 'cosmicFlows', draft, preview: PREVIEW }));
  return store;
}

const resolveWith = (store: ReturnType<typeof open>, data: ClipData) =>
  store.dispatch(draftResolved({ revision: selectRevision(store.getState()), data }));

const show = (store: ReturnType<typeof open>) =>
  render(
    <Provider store={store}>
      <Inspector />
    </Provider>,
  );

describe('Inspector', () => {
  it('selecting a subject-bound row shows its Resolved line', () => {
    const store = open({ timeline: [dollyToId('m31' as FocusId, 4)] });
    resolveWith(store, { timeline: [dollyTo(950, 4)] });
    store.dispatch(rowSelected({ kind: 'effect', path: [0] }));
    show(store);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('◎m31');
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.getByText('950 Mpc')).toBeTruthy();
  });

  it('a selected invalid row shows its error chip as an alert', () => {
    const store = open({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)], { overlap: 1 })] });
    resolveWith(store, selectDraft(store.getState())!);
    store.dispatch(
      paramEdited({
        ref: { kind: 'effect', path: [0] },
        param: 'overlap',
        value: 9,
        label: 'Blend',
        gesture: null,
      }),
    );
    resolveWith(store, selectDraft(store.getState())!);
    store.dispatch(rowSelected({ kind: 'effect', path: [0] }));
    show(store);

    expect(screen.getByRole('alert').textContent).toContain('Blend is longer');
  });

  it('with nothing selected it shows the clip and its Start', () => {
    const store = open({ timeline: [dollyTo(300, 4)] });
    show(store);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Cosmic Flows');
    expect(screen.getByText('live view')).toBeTruthy();
  });
});
