// @vitest-environment jsdom

/**
 * OrientationTuning — light plumbing test for the round-9 trial knobs: each
 * control writes through to its one home (`setSurfaceBand` / ORIENT_TUNING),
 * and a clamp that moves the OTHER knob is reflected back into the UI.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

import OrientationTuning from '../../../src/components/DebugPanel/OrientationTuning';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import { setSurfaceBand, SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';

afterEach(() => {
  setSurfaceBand({ engageHR: 1.7, disengageHR: 3.4 });
  ORIENT_TUNING.blendSpace = 'log';
  ORIENT_TUNING.northUp = true;
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
    const { getByLabelText } = render(createElement(OrientationTuning));
    fireEvent.change(getByLabelText('disengage h/R'), { target: { value: '1.5' } });
    expect(SURFACE_REGIME.engageHR).toBeCloseTo(1.5 / 1.1, 12);
    const engage = getByLabelText('engage h/R') as HTMLInputElement;
    expect(Number(engage.value)).toBeCloseTo(1.5 / 1.1, 12);
  });
});
