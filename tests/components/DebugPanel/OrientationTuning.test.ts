// @vitest-environment jsdom

/**
 * OrientationTuning — light plumbing test: each control dispatches through to
 * the one home (`camera.tuning`), and a clamp that moved the OTHER knob is
 * reflected back into the UI.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';

import OrientationTuning from '../../../src/components/DebugPanel/OrientationTuning';
import { rootReducer } from '../../../src/store/rootReducer';
import { selectCameraTuning } from '../../../src/state/camera/selectors';
import { useAppSelector } from '../../../src/store/hooks';

/** Readouts are pre-formatted by the caller; these fixtures only need to be distinguishable. */
const PROPS = {
  hOverR: 0.3,
  markerReadout: 'h/R 0.300 · 1,911,300 m',
  weightReadout: '0.500',
  rememberedTiltReadout: '0.0°',
};

/** Stands in for `CameraStateSection`, the one reader that owns the prop. */
function Live(): ReactNode {
  return createElement(OrientationTuning, { ...PROPS, tuning: useAppSelector(selectCameraTuning) });
}

function renderLive() {
  const store = configureStore({ reducer: rootReducer });
  const view = render(createElement(Live), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children }),
  });
  return { store, ...view };
}

describe('OrientationTuning', () => {
  it('each control writes through to the one home', () => {
    const { store, getByLabelText } = renderLive();
    fireEvent.change(getByLabelText('engage h/R'), { target: { value: '2.5' } });
    expect(store.getState().camera.tuning.engageHR).toBe(2.5);
    fireEvent.change(getByLabelText('disengage h/R'), { target: { value: '5' } });
    expect(store.getState().camera.tuning.disengageHR).toBe(5);
    fireEvent.change(getByLabelText('tilt-blend full h/R'), { target: { value: '1.5' } });
    expect(store.getState().camera.tuning.tiltFullHR).toBe(1.5);
    fireEvent.change(getByLabelText('tilt-blend zero h/R'), { target: { value: '3' } });
    expect(store.getState().camera.tuning.tiltZeroHR).toBe(3);
    fireEvent.click(getByLabelText('log(h/R) blend-space'));
    expect(store.getState().camera.tuning.blendSpace).toBe('lin');
    fireEvent.click(getByLabelText('north-up framing'));
    expect(store.getState().camera.tuning.northUp).toBe(false);
  });

  it('a clamp that moves the other knob is re-read into the UI', () => {
    const { store, getByLabelText, container } = renderLive();
    // The default band is clear of the floor, so the readout shows the plain
    // ratio — without this an unconditional "AT FLOOR" would pass below.
    expect(container.textContent).not.toContain('AT FLOOR');
    expect(container.textContent).toContain('(floor ');
    // 0.21 clears disengageMin (0.2), so the range clamp does not fire first
    // and the hysteresis floor is what drags engage down.
    fireEvent.change(getByLabelText('disengage h/R'), { target: { value: '0.21' } });
    expect(store.getState().camera.tuning.engageHR).toBeCloseTo(0.21 / 1.1, 12);
    const engage = getByLabelText('engage h/R') as HTMLInputElement;
    expect(Number(engage.value)).toBeCloseTo(0.21 / 1.1, 12);
    expect(container.textContent).toContain('AT FLOOR');
  });
});
