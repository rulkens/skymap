// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import {
  all,
  atFocus,
  atPoint,
  dollyTo,
  fade,
  flyPath,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';
import { layerSearchReported } from '../../../../../src/state/engine/engineSlice';
import TimelinePane from '../../../src/timeline/components/TimelinePane/TimelinePane';
import { draftResolved, viewportSet } from '../../../src/session/state/studioSlice';
import {
  selectCollapsed,
  selectRevision,
  selectSelection,
  selectViewport,
} from '../../../src/session/state/selectors';
import { openStudioStore } from '../../helpers/openStudioStore';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { FocusId } from '../../../../../src/@types/animation/FocusId';
import type { PathWaypoint } from '../../../../../src/@types/animation/PathWaypoint';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mount = (draft: ClipData, resolved?: ClipData) => {
  const store = openStudioStore(draft, { resolve: resolved === undefined });
  if (resolved)
    store.dispatch(draftResolved({ revision: selectRevision(store.getState()), data: resolved }));
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

  it('⌘/ctrl+wheel zooms about the time under the pointer; zooming back out returns to Fit', () => {
    // Fit spans 0-9.6 s over a 1000 px track starting at x 0, so x 250 is 2.4 s.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    const store = mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
    const pane = screen.getByRole('tree').parentElement!;

    fireEvent.wheel(pane, { deltaY: -100, ctrlKey: true, clientX: 250 });
    expect(selectViewport(store.getState())).toEqual({ startSec: 1.2, endSec: 6 });

    fireEvent.wheel(pane, { deltaY: 100, metaKey: true, clientX: 250 });
    expect(selectViewport(store.getState())).toBeNull();
  });

  it('clicking a row selects it; clicking its twisty toggles collapse without selecting', () => {
    const store = mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });

    fireEvent.click(screen.getAllByRole('treeitem')[2]!);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 0] });

    fireEvent.click(screen.getByRole('button', { name: 'Fold Sequence' }));
    expect(selectCollapsed(store.getState())).toEqual(['e:0']);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 0] });
  });

  it('a folded block shows its steps as icons named for screen readers; an open one shows nothing', () => {
    mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });
    const summary = () => screen.queryByRole('img', { name: 'Distance ×2' });
    expect(summary()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fold Sequence' }));
    expect(summary()).not.toBeNull();
  });

  it('clicking a lane selects its row', () => {
    const store = mount({ timeline: [seq([dollyTo(300, 4), dollyTo(950, 4)])] });

    fireEvent.click(screen.getAllByRole('treeitem')[3]!.nextElementSibling!);
    expect(selectSelection(store.getState())).toEqual({ kind: 'effect', path: [0, 1] });
  });

  it('an invalid row is marked invalid and shows the warning in its duration', () => {
    mount({ timeline: [all([dollyTo(300, 4), dollyTo(500, 4)])] });

    const invalid = screen.getAllByRole('treeitem').filter((el) => el.ariaInvalid === 'true');
    expect(invalid.length).toBeGreaterThan(0);
    expect(invalid[0]!.textContent).toContain('⚠');
  });

  it('a folded group hiding a culprit shows the warning without being marked invalid itself', () => {
    const store = mount({ timeline: [seq([all([dollyTo(300, 4), dollyTo(500, 4)])])] });
    fireEvent.click(screen.getByRole('button', { name: 'Fold Sequence' }));

    expect(selectCollapsed(store.getState())).toEqual(['e:0']);
    const group = screen.getAllByRole('treeitem')[1]!;
    expect(group.textContent).toContain('⚠');
    expect(group).not.toHaveAttribute('aria-invalid');
  });

  it("a fade's bar runs for its fade, though the clip does not wait for it", () => {
    // The fade awaits nothing, so the dolly runs 0-4 s and Fit spans 0-4.8 s; the 3 s fade is 62.5 %.
    mount({ timeline: [seq([fade(['flow'], 0, 3), dollyTo(300, 4)])] });

    expect(screen.getByText('→ 0 %').parentElement!.style.width).toBe('62.5%');
  });

  it("a Fly's outline row reads its waypoints by name", () => {
    const fly = (first: PathWaypoint) => flyPath([first, atPoint([5, 0, 0], 8)], { over: 6 });
    const store = mount(
      { timeline: [fly(atFocus('body-earth' as FocusId))] },
      { timeline: [fly(atPoint([1, 0, 0], 2))] },
    );
    const earth = { id: 'body-earth', names: ['Earth'], class: 'primary' as const };
    act(() => void store.dispatch(layerSearchReported({ layer: 'body', rows: [earth] })));

    expect(screen.getAllByRole('treeitem')[1]).toHaveTextContent('via Earth, point 2');
  });
});
