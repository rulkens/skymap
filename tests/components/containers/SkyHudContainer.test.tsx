// @vitest-environment jsdom
//
// SkyHudContainer — shown while standing unless another takeover has the screen; Leave is the
// restoring exit; the clock skips land manual and paused at their target and then withdraw.

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SkyHudContainer from '../../../src/components/containers/SkyHudContainer';
import { rootReducer } from '../../../src/store/rootReducer';
import { skyViewReported } from '../../../src/state/sky/skySlice';
import { exitTakeover, takeoverStarted } from '../../../src/state/takeover/takeoverActions';
import { skyBelowHorizonSet } from '../../../src/state/sky/skySlice';
import { skyClockTo } from '../../../src/state/sky/skyClockTo';
import { goLive } from '../../../src/state/time/timeSlice';
import { selectTimeState } from '../../../src/state/time/selectors';
import { sunAltitudeAt } from '../../../src/utils/sky/sunAltitudeAt';
import { unixMsToJulianDays } from '../../../src/utils/time/unixMsToJulianDays';
import { radToDeg } from '../../../src/utils/math/radToDeg';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';

const SPOT: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };
const NOON = unixMsToJulianDays(Date.UTC(2026, 10, 7, 12));

function mount(spot = SPOT, simDays = NOON) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(goLive({ simDays, nowMs: performance.now() }));
  store.dispatch(skyViewReported({ spot, azimuthRad: Math.PI }));
  const dispatch = vi.spyOn(store, 'dispatch');
  render(
    <Provider store={store}>
      <SkyHudContainer phone={false} />
    </Provider>,
  );
  return { store, dispatch };
}

const hud = () => screen.queryByRole('region', { name: 'Sky mode' });

describe('SkyHudContainer', () => {
  it('shows while standing, and gives way to a tour', () => {
    const { store } = mount();
    expect(hud()).not.toBeNull();

    act(() => {
      store.dispatch(takeoverStarted({ kind: 'tour', id: 'webShowcase' }));
    });
    expect(hud()).toBeNull();
  });

  it('Leave dispatches the restoring exit', () => {
    const { dispatch } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Leave/ }));
    expect(dispatch).toHaveBeenCalledWith(exitTakeover({ restore: true }));
  });

  it('Skip to tonight asks the clock to sweep to astronomical dusk', () => {
    const { dispatch } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to tonight' }));

    const asked = dispatch.mock.calls.map(([a]) => a).find(skyClockTo.match);
    expect(asked).toBeDefined();
    expect(asked!.payload.simDays).toBeGreaterThan(NOON);
    expect(asked!.payload.simDays).toBeLessThan(NOON + 1);
    expect(radToDeg(sunAltitudeAt(SPOT, asked!.payload.simDays))).toBeCloseTo(-18, 1);
  });

  it('under reduced motion Skip to tonight jumps: manual, paused, at the target', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { store } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to tonight' }));
    vi.unstubAllGlobals();

    const time = selectTimeState(store.getState());
    expect(time.mode).toBe('manual');
    expect(time.paused).toBe(true);
    expect(time.anchor.simDays).toBeGreaterThan(NOON);
    expect(time.anchor.simDays).toBeLessThan(NOON + 1);
    expect(radToDeg(sunAltitudeAt(SPOT, time.anchor.simDays))).toBeCloseTo(-18, 1);
    expect(screen.queryByRole('button', { name: 'Skip to tonight' })).toBeNull();
  });

  it('under the midnight sun there is no tonight to skip to', () => {
    const tromso: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.3295, latRad: 1.2147 };
    mount(tromso, unixMsToJulianDays(Date.UTC(2026, 5, 21, 12)));
    expect(hud()).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip to tonight' })).toBeNull();
  });

  it('Skip to when it rises jumps to the rise and then withdraws (reduced motion)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { store } = mount();
    const riseAt = NOON + 0.3;
    act(() => {
      store.dispatch(skyBelowHorizonSet({ riseAt, neverRises: false }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip to when it rises' }));
    vi.unstubAllGlobals();

    const time = selectTimeState(store.getState());
    expect(time.paused).toBe(true);
    expect(time.anchor.simDays).toBeCloseTo(riseAt, 6);
    expect(screen.queryByRole('button', { name: 'Skip to when it rises' })).toBeNull();
  });
});
