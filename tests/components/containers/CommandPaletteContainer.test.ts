// @vitest-environment jsdom

/**
 * CommandPaletteContainer — regression coverage for the `view` action kind
 * reaching `openView`. PR1 shipped three interlocking placeholders for view
 * cards (a disabled button, an Enter-key guard, and a container stub); the
 * first two survived a PR3 cleanup pass unnoticed because nothing asserted a
 * view card is actually activatable. Pattern mirrors
 * `TourOverlayContainer.test.ts`: store-backed via `createAppStore()` +
 * `<Provider>`, dispatch spy installed after seeding, before render.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import CommandPaletteContainer from '../../../src/components/containers/CommandPaletteContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { setPaletteOpen } from '../../../src/state/ui/uiSlice';
import { openView } from '../../../src/state/views/viewActions';

type Store = ReturnType<typeof createAppStore>['store'];

function makeWrapper(store: Store) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

describe('CommandPaletteContainer', () => {
  it('dispatches openView when a view card is activated', () => {
    const { store } = createAppStore();
    store.dispatch(setPaletteOpen(true));
    const spy = vi.spyOn(store, 'dispatch');
    const { getByRole } = render(createElement(CommandPaletteContainer), {
      wrapper: makeWrapper(store),
    });
    fireEvent.click(getByRole('button', { name: 'Solar System' }));
    expect(spy).toHaveBeenCalledWith(openView('solarSystem'));
  });
});
