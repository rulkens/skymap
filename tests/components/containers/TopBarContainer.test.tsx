// @vitest-environment jsdom
//
// TopBarContainer — store-boundary coverage for the top-centre pill row.
//
// The one thing here that can silently break at runtime is the shared `hidden`
// gate. It ORs two store reads, and `||` short-circuits: written as
// `useAppSelector(a) || useAppSelector(b)`, the second hook stops being called
// the moment the first read is true. React counts hooks positionally, so the
// row would render fine until the palette opened and then tear down the whole
// app with "Cannot read properties of undefined (reading 'length')" from the
// next hook in the list. The test below drives that exact transition — open the
// palette, re-render — which is the only way to catch it; a static render never
// crosses the boundary.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import TopBarContainer from '../../../src/components/containers/TopBarContainer';
import { createAppStore } from '../../../src/store/createAppStore';
import { selectPaletteOpen } from '../../../src/state/ui/selectors';

let mobile = false;
vi.mock('../../../src/hooks/useIsMobile', () => ({ useIsMobile: () => mobile }));

function makeWrapper(store: ReturnType<typeof createAppStore>['store']) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
}

function searchTrigger(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>('button[aria-keyshortcuts]');
  if (el === null) throw new Error('no search trigger button');
  return el;
}

describe('TopBarContainer', () => {
  // About moved into the phone dock; a second About button up here would duplicate it.
  it('shows the About pill on desktop and not on a phone', () => {
    const { store } = createAppStore();
    const wrapper = makeWrapper(store);
    mobile = false;
    const desktop = render(createElement(TopBarContainer), { wrapper });
    expect(desktop.container.querySelector('[aria-label="About skymap"]')).not.toBeNull();
    desktop.unmount();
    mobile = true;
    const phone = render(createElement(TopBarContainer), { wrapper });
    expect(phone.container.querySelector('[aria-label="About skymap"]')).toBeNull();
    mobile = false;
  });

  it('survives the palette opening — the hidden gate reads both flags every render', () => {
    const { store } = createAppStore();
    const { container, rerender } = render(createElement(TopBarContainer), {
      wrapper: makeWrapper(store),
    });

    fireEvent.click(searchTrigger(container));
    expect(selectPaletteOpen(store.getState())).toBe(true);

    // The re-render with paletteOpen=true is where a short-circuited second
    // selector changes the hook count and React throws.
    expect(() => rerender(createElement(TopBarContainer))).not.toThrow();
    expect(searchTrigger(container).getAttribute('aria-hidden')).toBe('true');
  });
});
