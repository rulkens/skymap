// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { all, dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import { openStudio } from '../../../../../src/state/studio/studioActions';
import TopBar from '../../../src/shell/components/TopBar/TopBar';
import { paramEdited, rowToggled } from '../../../src/session/state/studioSlice';
import { openStudioStore } from '../../helpers/openStudioStore';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

afterEach(cleanup);

const DRAFT: ClipData = { timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] };

function mount(draft: ClipData = DRAFT) {
  const store = openStudioStore(draft);
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <TopBar keysOpen={false} onToggleKeys={() => {}} />
    </Provider>,
  );
  return { store, dispatch };
}

describe('TopBar', () => {
  it('the title is a clip picker: choosing another clip opens it in the studio', () => {
    const { dispatch } = mount();
    const picker = screen.getByRole('combobox', { name: 'Clip' });
    expect(picker).toHaveValue('cosmicFlows');

    fireEvent.change(picker, { target: { value: 'famousFlythrough' } });
    expect(dispatch).toHaveBeenCalledWith(openStudio('famousFlythrough'));
  });

  it('Undo names the last edit and is disabled with nothing to undo', () => {
    const { store } = mount();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    act(() => {
      store.dispatch(
        paramEdited({
          ref: { kind: 'effect', path: [0, 0] },
          param: 'to',
          value: 500,
          label: 'Distance',
          gesture: null,
        }),
      );
    });

    expect(screen.getByRole('button', { name: 'Undo Distance' })).toBeEnabled();
    expect(screen.getByText('● Unsaved')).toHaveAttribute('role', 'status');
  });

  it('Close ends the takeover', () => {
    const { dispatch } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close studio' }));
    expect(dispatch).toHaveBeenCalledWith(exitTakeover());
  });

  it('the error line still names a culprit folded inside a group', () => {
    const { store } = mount({ timeline: [seq([all([dollyTo(300, 4), dollyTo(500, 4)])])] });
    act(() => void store.dispatch(rowToggled('e:0')));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Distance');
    expect(alert.textContent).toMatch(/0–4 s/);
  });

  it('a compile error shows one alert line naming the culprit', () => {
    mount({ timeline: [all([dollyTo(300, 4), dollyTo(500, 4)])] });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Distance');
    expect(alert.textContent).toContain('writers');
  });
});
