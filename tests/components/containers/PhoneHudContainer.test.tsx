// @vitest-environment jsdom
//
// PhoneHudContainer — which of Layers / the selection card / the time row shows.
// The selection is stubbed (the selector returns a variable), so a "new selection"
// is a variable change plus any store write to make useSelector re-run.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import PhoneHudContainer from '../../../src/components/containers/PhoneHudContainer';
import { createTestStore } from '../../support/createTestStore';
import { setPaletteOpen, setUiHidden } from '../../../src/state/ui/uiSlice';
import { selectSplashVisible } from '../../../src/state/ui/selectors';
import type { FocusableTarget } from '../../../src/@types/engine/FocusableTarget';

let selected: FocusableTarget | null = null;
let ticks = 0;

vi.mock('../../../src/state/selection/selectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/state/selection/selectors')>()),
  selectSelectedFocusable: () => selected,
}));
vi.mock('../../../src/state/selection/goHome', () => ({
  goHome: () => ({ type: 'test/goHome' }),
}));
vi.mock('../../../src/components/containers/LazyInfoCardContainer', () => ({
  default: () => <div>card</div>,
}));
vi.mock('../../../src/components/containers/LazyPhoneSettingsContainer', () => ({
  default: () => <div>layers content</div>,
}));
vi.mock('../../../src/components/containers/TimeBarContainer', () => ({
  default: () => <div>time row</div>,
}));
vi.mock('../../../src/components/containers/ScaleBracketContainer', () => ({
  default: () => null,
}));

const structure = (id: string): FocusableTarget =>
  ({ type: 'structure', id, name: id }) as unknown as FocusableTarget;

function setup() {
  const { store } = createTestStore();
  render(
    <Provider store={store}>
      <PhoneHudContainer hidden={false} />
    </Provider>,
  );
  // Select by changing the variable the stub reads, then write the store to the OPPOSITE
  // uiHidden: react-redux skips the selector when the state reference is unchanged.
  const select = (next: FocusableTarget | null) =>
    act(() => {
      selected = next;
      store.dispatch(setUiHidden((ticks += 1) % 2 === 1));
    });
  return { store, select };
}

const dockButton = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  selected = null;
  ticks = 0;
});

describe('PhoneHudContainer', () => {
  it('lets Layers win over the selection card while open, and brings the card back on close', async () => {
    const { select } = setup();
    select(structure('virgo'));
    expect(await screen.findByText('card')).toBeInTheDocument();

    fireEvent.click(dockButton('Layers'));
    expect(await screen.findByText('layers content')).toBeInTheDocument();
    expect(screen.queryByText('card')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close Layers' }));
    expect(await screen.findByText('card')).toBeInTheDocument();
  });

  it('closes Layers for a NEW selection but not when the selection is cleared', async () => {
    const { select } = setup();
    select(structure('virgo'));
    fireEvent.click(dockButton('Layers'));
    expect(await screen.findByText('layers content')).toBeInTheDocument();

    select(null);
    expect(screen.getByText('layers content')).toBeInTheDocument();

    select(structure('coma'));
    expect(await screen.findByText('card')).toBeInTheDocument();
    expect(screen.queryByText('layers content')).toBeNull();
  });

  // Home changes no selection when Earth is already selected, so the selection-change close never fires.
  it('closes Layers on Home even when the selection does not change', async () => {
    const { select } = setup();
    select(structure('earth'));
    fireEvent.click(dockButton('Layers'));
    expect(await screen.findByText('layers content')).toBeInTheDocument();

    fireEvent.click(dockButton('Home'));
    expect(await screen.findByText('card')).toBeInTheDocument();
    expect(screen.queryByText('layers content')).toBeNull();
  });

  it('reopens the splash from the About dock item', () => {
    const { store } = setup();
    store.dispatch({ type: 'ui/dismissSplash', payload: 1 });
    expect(selectSplashVisible(store.getState())).toBe(false);
    fireEvent.click(dockButton('About skymap'));
    expect(selectSplashVisible(store.getState())).toBe(true);
  });

  it('keeps the time row independent of the sheet', async () => {
    setup();
    expect(screen.queryByText('time row')).toBeNull();
    fireEvent.click(dockButton('Time'));
    fireEvent.click(dockButton('Layers'));
    expect(await screen.findByText('layers content')).toBeInTheDocument();
    expect(screen.getByText('time row')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Layers' }));
    expect(screen.getByText('time row')).toBeInTheDocument();
    fireEvent.click(dockButton('Time'));
    expect(screen.queryByText('time row')).toBeNull();
  });

  it('returns focus to the dock item that opened Layers or the palette', async () => {
    const { store } = setup();
    fireEvent.click(dockButton('Layers'));
    fireEvent.click(await screen.findByRole('button', { name: 'Close Layers' }));
    expect(document.activeElement).toBe(dockButton('Layers'));

    fireEvent.click(dockButton('Search'));
    act(() => void store.dispatch(setPaletteOpen(false)));
    expect(document.activeElement).toBe(dockButton('Search'));
  });
});
