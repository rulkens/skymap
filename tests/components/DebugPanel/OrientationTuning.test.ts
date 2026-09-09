// @vitest-environment jsdom

/**
 * OrientationTuning — light plumbing test: each control writes through to its
 * one home (`setSurfaceBand` / ORIENT_TUNING), and a clamp that moves the
 * OTHER knob is reflected back into the UI.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

import OrientationTuning from '../../../src/components/DebugPanel/OrientationTuning';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { setSurfaceBand, SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';

const TUNING_AT_LOAD = { ...ORIENT_TUNING };
const BAND_AT_LOAD = {
  engageHR: SURFACE_REGIME.engageHR,
  disengageHR: SURFACE_REGIME.disengageHR,
};

afterEach(() => {
  setSurfaceBand(BAND_AT_LOAD);
  Object.assign(ORIENT_TUNING, TUNING_AT_LOAD);
});

describe('OrientationTuning', () => {
  it('each control writes through to the one home', () => {
    const { getByLabelText } = render(createElement(OrientationTuning));
    fireEvent.change(getByLabelText('engage h/R'), { target: { value: '2.5' } });
    expect(SURFACE_REGIME.engageHR).toBe(2.5);
    fireEvent.change(getByLabelText('disengage h/R'), { target: { value: '5' } });
    expect(SURFACE_REGIME.disengageHR).toBe(5);
    fireEvent.click(getByLabelText('log(h/R) blend-space'));
    expect(ORIENT_TUNING.blendSpace).toBe('lin');
    fireEvent.click(getByLabelText('north-up framing'));
    expect(ORIENT_TUNING.northUp).toBe(false);
  });

  it('a clamp that moves the other knob is re-read into the UI', () => {
    const { getByLabelText, container } = render(createElement(OrientationTuning));
    // The default band is clear of the floor, so the readout shows the plain
    // ratio — without this an unconditional "AT FLOOR" would pass below.
    expect(container.textContent).not.toContain('AT FLOOR');
    expect(container.textContent).toContain('(floor ');
    // Ruling 19's engage default (0.2) sits flush against disengageMin (0.2),
    // so the window that clears the floor while still tripping the engage ×
    // minRatio clamp (0.22) is narrow — 0.21.
    fireEvent.change(getByLabelText('disengage h/R'), { target: { value: '0.21' } });
    expect(SURFACE_REGIME.engageHR).toBeCloseTo(0.21 / 1.1, 12);
    const engage = getByLabelText('engage h/R') as HTMLInputElement;
    expect(Number(engage.value)).toBeCloseTo(0.21 / 1.1, 12);
    // The clamp landed exactly on the floor, so the readout names the knob
    // that yielded rather than showing a plain ratio.
    expect(container.textContent).toContain('AT FLOOR (engage yielded)');
  });
});
