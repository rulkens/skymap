// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lookAtId } from '../../../../../src/services/engine/animation/effectHelpers';
import { focusId } from '../../../../../src/utils/animation/focusId';
import { layerSearchReported } from '../../../../../src/state/engine/engineSlice';
import FieldRow from '../../../src/inspector/components/FieldRow/FieldRow';
import { inspectorSpec } from '../../../src/inspector/utils/inspectorSpec';
import { rowSubject } from '../../../src/draft/utils/rowSubject';
import { positionPicked } from '../../../src/session/state/positionPicked';
import { selectStudioState } from '../../../src/session/state/selectors';
import { openStudioStore } from '../../helpers/openStudioStore';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { RowKind } from '../../../src/@types/rows/RowKind';
import type { RowRef } from '../../../src/@types/rows/RowRef';

afterEach(cleanup);

const BODIES = [
  { id: 'body-earth', names: ['Earth'], class: 'primary' as const },
  { id: 'body-mars', names: ['Mars'], class: 'primary' as const },
];

function setup(draft: ClipData, kind: RowKind, rowRef: RowRef, fieldKey: string) {
  const store = openStudioStore(draft, { resolve: false });
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

const AIM: ClipData = { timeline: [lookAtId(focusId('body-earth'), 2)] };
const EFFECT: RowRef = { kind: 'effect', path: [0] };

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
      positionPicked({
        ref: { kind: 'start' },
        param: 'target',
        label: 'Look-at',
        focusId: 'body-mars',
      }),
    );
  });
});
