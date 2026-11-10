// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { all, dollyTo, seq } from '../../../../../src/services/engine/animation/effectHelpers';
import TimelinePane from '../../../src/timeline/components/TimelinePane/TimelinePane';
import { viewportSet } from '../../../src/session/state/studioSlice';
import {
  selectCollapsed,
  selectSelection,
  selectViewport,
} from '../../../src/session/state/selectors';
import { openStudioStore } from '../../helpers/openStudioStore';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = (draft: ClipData) => {
  const store = openStudioStore(draft);
  render(
    <Provider store={store}>
      <TimelinePane />
    </Provider>,
  );
  return store;
};

describe('TimelinePane', () => {
  it('a sideways swipe pans a zoomed timeline; a plain vertical wheel does not', () => {
    // Steps end at 8 s, so Fit spans 0-9.6 s; a 1000 px track at a 2 s window is 2 ms per px.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    const store = mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
    act(() => void store.dispatch(viewportSet({ startSec: 2, endSec: 4 })));
    const pane = screen.getByRole('tree').parentElement!;

    fireEvent.wheel(pane, { deltaY: 300 });
    expect(selectViewport(store.getState())).toEqual({ startSec: 2, endSec: 4 });

    fireEvent.wheel(pane, { deltaX: 500 });
    expect(selectViewport(store.getState())).toEqual({ startSec: 3, endSec: 5 });
  });

  it('clicking a row selects it; clicking its twisty toggles collapse without selecting', () => {
    const store = mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });

    fireEvent.click(screen.getAllByRole('treeitem')[2]!);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 0] });

    fireEvent.click(screen.getByRole('button', { name: 'Fold In order' }));
    expect(selectCollapsed(store.getState())).toEqual(['e:0']);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 0] });
  });

  it('an invalid row is marked invalid and shows the warning in its duration', () => {
    mount({ timeline: [all([dollyTo(300, 4), dollyTo(500, 4)])] });

    const invalid = screen.getAllByRole('treeitem').filter((el) => el.ariaInvalid === 'true');
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid[0]!.textContent).toContain('⚠');
  });
});
