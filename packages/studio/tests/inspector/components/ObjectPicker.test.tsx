// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lookAtId } from '../../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../../src/utils/animation/focusId';
import { layerSearchReported } from '../../../../../src/state/engine/engineSlice';
import FieldRow from '../../../src/inspector/components/FieldRow/FieldRow';
import { inspectorSpec } from '../../../src/inspector/utils/inspectorSpec';
import { rowSubject } from '../../../src/draft/utils/rowSubject';
import { objectPicked, pickFailed, refNamed } from '../../../src/session/state/studioSlice';
import { selectStudioState } from '../../../src/session/state/selectors';
import { refKey } from '../../../../../src/utils/selection/refKey';
import { openStudioStore } from '../../helpers/openStudioStore';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { RowKind } from '../../../src/@types/rows/RowKind';
import type { RowRef } from '../../../src/@types/rows/RowRef';

afterEach(cleanup);

const AIM: ClipData = { timeline: [lookAtId(focusId('body-earth'), 2)] };
const EFFECT: RowRef = { kind: 'effect', path: [0] };

const BODIES = [
  { id: 'body-earth', names: ['Earth'], class: 'primary' as const },
  { id: 'body-mars', names: ['Mars'], class: 'primary' as const },
];

function renderField(
  store: ReturnType<typeof openStudioStore>,
  kind: RowKind,
  fieldKey: string,
  rowRef: RowRef = EFFECT,
) {
  store.dispatch(layerSearchReported({ layer: 'body', rows: BODIES }));
  const dispatch = vi.spyOn(store, 'dispatch');
  const spec = inspectorSpec(kind).fields.find((f) => f.key === fieldKey)!;
  const subject = rowSubject(selectStudioState(store.getState()).draft!, rowRef)!;
  render(
    <Provider store={store}>
      <FieldRow spec={spec} subject={subject} rowRef={rowRef} />
    </Provider>,
  );
  return { store, dispatch };
}

function setup(draft: ClipData, kind: RowKind, rowRef: RowRef, fieldKey: string) {
  return renderField(openStudioStore(draft, { resolve: false }), kind, fieldKey, rowRef);
}

describe('ObjectPicker', () => {
  it("a subject field reads the object's name and a pick stores its focus id as one Undo step", async () => {
    const { store } = setup(AIM, 'lookAtId', EFFECT, 'id');
    const field = screen.getByRole('combobox', { name: 'Subject' });
    expect(field).toHaveProperty('value', 'Earth');

    await userEvent.click(field);
    await userEvent.keyboard('mar');
    await userEvent.click(screen.getByRole('option', { name: /Mars/ }));

    const state = selectStudioState(store.getState());
    expect(state.draft!.timeline[0]).toMatchObject({ id: 'body-mars' });
    expect(state.history.past).toHaveLength(1);
  });

  it('Escape puts the value back without an edit', async () => {
    const { store } = setup(AIM, 'lookAtId', EFFECT, 'id');
    const field = screen.getByRole('combobox', { name: 'Subject' });
    await userEvent.click(field);
    await userEvent.keyboard('mar{Escape}');

    expect(field).toHaveProperty('value', 'Earth');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(selectStudioState(store.getState()).history.past).toHaveLength(0);
  });

  it("the Start's Look-at shows its position and asks for the picked object's", async () => {
    const start = { target: [1, 2, 3] as [number, number, number], yaw: 0, pitch: 0, distance: 9 };
    const { dispatch } = setup({ start, timeline: [] }, 'start', { kind: 'start' }, 'target');
    const field = screen.getByRole('combobox', { name: 'Look-at' });
    expect(field).toHaveProperty('value', '1, 2, 3 Mpc');

    await userEvent.click(field);
    await userEvent.keyboard('mars{ArrowDown}{ArrowUp}{Enter}');

    expect(dispatch).toHaveBeenCalledWith(
      objectPicked({
        ref: { kind: 'start' },
        param: 'target',
        label: 'Look-at',
        focusId: 'body-mars',
        stores: 'position',
      }),
    );
  });

  it('a pick shows Locating until it lands, and says so when the object never loads', () => {
    const start = { target: [1, 2, 3] as [number, number, number], yaw: 0, pitch: 0, distance: 9 };
    const store = openStudioStore({ start, timeline: [] }, { resolve: false });
    const pick = {
      ref: { kind: 'start' },
      param: 'target',
      label: 'Look-at',
      focusId: 'body-mars',
      stores: 'position',
    } as const;
    renderField(store, 'start', 'target', { kind: 'start' });

    act(() => {
      store.dispatch(objectPicked(pick));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Locating Mars…');

    act(() => {
      store.dispatch(pickFailed(pick));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Mars did not load');
    expect(screen.getByRole('combobox', { name: 'Look-at' })).toHaveProperty(
      'value',
      '1, 2, 3 Mpc',
    );
  });

  it("a Focus step reads the name its ref was given and asks for the picked object's ref", async () => {
    const ref = { type: 'body', id: 'body-earth' };
    const store = openStudioStore({ timeline: [{ kind: 'focus', ref }] }, { resolve: false });
    store.dispatch(refNamed({ key: refKey(ref), name: 'Earth' }));
    const { dispatch } = renderField(store, 'focus', 'ref');
    const field = screen.getByRole('combobox', { name: 'Subject' });
    expect(field).toHaveProperty('value', 'Earth');

    await userEvent.click(field);
    await userEvent.keyboard('mars{Enter}');

    expect(dispatch).toHaveBeenCalledWith(
      objectPicked({
        ref: EFFECT,
        param: 'ref',
        label: 'Subject',
        focusId: 'body-mars',
        stores: 'ref',
      }),
    );
  });

  it('emptying a Focus subject offers None, which clears the focus as one Undo step', async () => {
    const ref = { type: 'body', id: 'body-earth' };
    const store = openStudioStore({ timeline: [{ kind: 'focus', ref }] }, { resolve: false });
    renderField(store, 'focus', 'ref');
    await userEvent.click(screen.getByRole('combobox', { name: 'Subject' }));
    await userEvent.keyboard('{Backspace}');
    await userEvent.click(screen.getByRole('option', { name: 'None' }));

    const state = selectStudioState(store.getState());
    expect(state.draft!.timeline[0]).toEqual({ kind: 'focus', ref: null });
    expect(state.history.past).toHaveLength(1);
  });

  it('a subject that must name an object offers no None', async () => {
    setup(AIM, 'lookAtId', EFFECT, 'id');
    await userEvent.click(screen.getByRole('combobox', { name: 'Subject' }));
    await userEvent.keyboard('{Backspace}');

    expect(screen.queryByRole('option')).toBeNull();
  });
});
