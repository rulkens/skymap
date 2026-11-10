// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  atFocus,
  atPoint,
  dollyTo,
  dollyToId,
  fade,
  flyPath,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';
import { openStudioStore } from '../../helpers/openStudioStore';
import Inspector from '../../../src/inspector/components/Inspector/Inspector';
import { draftResolved, paramEdited, rowSelected } from '../../../src/session/state/studioSlice';
import {
  selectDraft,
  selectRevision,
  selectStudioState,
} from '../../../src/session/state/selectors';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { FocusId } from '../../../../../src/@types/animation/FocusId';

afterEach(cleanup);

const open = (draft: ClipData) => openStudioStore(draft, { resolve: false });

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

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^Distance → m31$/);
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

  it('a Fly shows Linger for only with a Linger, and Ease only without a Ramp', () => {
    const waypoints = [atPoint([5, 0, 0], 8)];
    const store = open({ timeline: [flyPath(waypoints, { over: 6 })] });
    store.dispatch(rowSelected({ kind: 'effect', path: [0] }));
    show(store);
    expect(screen.getByRole('slider', { name: 'Linger for' })).toBeTruthy();
    expect(screen.queryByText('Ease')).toBeNull();

    act(() => {
      for (const param of ['linger', 'rampSec'])
        store.dispatch(
          paramEdited({
            ref: { kind: 'effect', path: [0] },
            param,
            value: 0,
            label: '',
            gesture: null,
          }),
        );
    });
    expect(screen.queryByRole('slider', { name: 'Linger for' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Ease' })).toBeTruthy();
  });

  it("a Fly's waypoint chip selects that waypoint", async () => {
    const store = open({
      timeline: [flyPath([atFocus('m31' as FocusId), atPoint([5, 0, 0], 8)], { over: 6 })],
    });
    store.dispatch(rowSelected({ kind: 'effect', path: [0] }));
    show(store);
    await userEvent.click(screen.getByRole('button', { name: 'Settle 2, point' }));

    expect(selectStudioState(store.getState()).selection).toEqual({
      kind: 'waypoint',
      path: [0],
      index: 1,
    });
  });

  it("a waypoint's unset Linger reads the Fly's, dim, and its own one is bright with ↺ back to it", async () => {
    const store = open({
      timeline: [
        flyPath([atFocus('m31' as FocusId), atPoint([5, 0, 0], 8)], { over: 6, linger: 0.4 }),
      ],
    });
    store.dispatch(rowSelected({ kind: 'waypoint', path: [0], index: 0 }));
    show(store);
    expect(screen.getByRole('slider', { name: 'Linger' })).toHaveAttribute('aria-valuenow', '40');
    expect(screen.queryByRole('button', { name: 'Reset Linger to default' })).toBeNull();

    act(() => {
      store.dispatch(
        paramEdited({
          ref: { kind: 'waypoint', path: [0], index: 0 },
          param: 'linger',
          value: 0.9,
          label: '',
          gesture: null,
        }),
      );
    });
    await userEvent.click(screen.getByRole('button', { name: 'Reset Linger to default' }));
    expect(
      (selectDraft(store.getState())!.timeline[0] as { waypoints: object[] }).waypoints[0],
    ).not.toHaveProperty('linger');
  });

  it('a subject waypoint shows no Distance, and its unset Leg time reads auto with no reset', () => {
    const store = open({
      timeline: [flyPath([atFocus('m31' as FocusId), atPoint([5, 0, 0], 8)], { over: 6 })],
    });
    store.dispatch(rowSelected({ kind: 'waypoint', path: [0], index: 0 }));
    show(store);

    expect(screen.queryByText('Distance')).toBeNull();
    expect(screen.queryByText('Position')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Leg time' })).toHaveAttribute(
      'placeholder',
      'auto',
    );
    expect(screen.queryByRole('button', { name: 'Reset Leg time to default' })).toBeNull();
  });

  it('a channel step shows its channel as a name, not a pick', () => {
    const store = open({ timeline: [dollyTo(300, 4)] });
    store.dispatch(rowSelected({ kind: 'effect', path: [0] }));
    show(store);

    expect(screen.queryByRole('combobox', { name: 'Channel' })).toBeNull();
    expect(screen.getByText('Distance', { selector: 'span' })).toBeTruthy();
  });

  it('slider edits on two rows within one gesture window stay two Undo steps', async () => {
    const user = userEvent.setup();
    const store = open({ timeline: [fade(['flow'], 0.5, 2), fade(['flow'], 0.5, 2)] });
    store.dispatch(rowSelected({ kind: 'effect', path: [0] }));
    show(store);
    screen.getByRole('slider', { name: 'Level' }).focus();
    await user.keyboard('{ArrowRight}');

    act(() => void store.dispatch(rowSelected({ kind: 'effect', path: [1] })));
    screen.getByRole('slider', { name: 'Level' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(selectStudioState(store.getState()).history.past).toHaveLength(2);
  });

  it('with nothing selected it shows the clip and its Start', () => {
    const store = open({ timeline: [dollyTo(300, 4)] });
    show(store);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Cosmic Flows');
    expect(screen.getByText('live view')).toBeTruthy();
  });
});
