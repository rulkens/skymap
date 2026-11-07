// @vitest-environment jsdom
//
// SkyEntryButtonContainer — the button follows `selectSkyEntry`, hovering previews the spot
// with its place, and the click is the same `enterSkyHere` the `s` key sends.

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SkyEntryButtonContainer from '../../../src/components/containers/SkyEntryButtonContainer';
import { rootReducer } from '../../../src/store/rootReducer';
import { engineSkyEntryReported } from '../../../src/state/engine/engineSlice';
import { enterSkyHere } from '../../../src/state/sky/enterSkyHere';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';

// Søndermarken, Copenhagen: an `EARTH_PLACES` entry is within 25 km.
const SPOT: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };

function mount(altitudeM: number, phone = false) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(engineSkyEntryReported({ spot: SPOT, pointLocalM: [1, 2, 3], altitudeM }));
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <SkyEntryButtonContainer phone={phone} />
    </Provider>,
  );
  return { store, dispatch };
}

const button = () => screen.getByRole('button', { hidden: true });

describe('SkyEntryButtonContainer', () => {
  it('offers the button below the ceiling and withdraws it above', () => {
    const { store } = mount(5_000);
    expect(button().hasAttribute('inert')).toBe(false);

    act(() => {
      store.dispatch(
        engineSkyEntryReported({ spot: SPOT, pointLocalM: [1, 2, 3], altitudeM: 30_000 }),
      );
    });
    expect(button().hasAttribute('inert')).toBe(true);
  });

  it('shows the ring with the place while hovered, and drops it on leave', () => {
    mount(5_000);
    expect(screen.queryByText(/° N .*° E/)).toBeNull();

    fireEvent.pointerEnter(button());
    expect(screen.getByText('Søndermarken')).toBeTruthy();
    expect(screen.getByText(/° N .*° E/)).toBeTruthy();

    fireEvent.pointerLeave(button());
    expect(screen.queryByText('Søndermarken')).toBeNull();
  });

  it('puts the place in the phone label, with no ring', () => {
    mount(5_000, true);
    fireEvent.pointerEnter(button());
    expect(button().textContent).toBe('Look up from near Søndermarken');
    expect(screen.queryByText(/° N .*° E/)).toBeNull();
  });

  it('sends enterSkyHere on click', () => {
    const { dispatch } = mount(5_000);
    fireEvent.click(button());
    expect(dispatch).toHaveBeenCalledWith(enterSkyHere());
  });
});
