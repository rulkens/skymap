// @vitest-environment jsdom

/**
 * CameraStateSection — the two contracts the rebuild is built on: degrees on
 * screen but full-precision RADIANS in `copy all` off the SAME model (a paste
 * that disagrees with the screen is worse than no paste), and grill Q8's
 * north-up-off rule — the field's target stays on the row, marked, rather than
 * blanking to an em-dash.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

import CameraStateSection from '../../../src/components/DebugPanel/CameraStateSection';
import { ORIENT_TUNING } from '../../../src/data/camera/orientTuning';
import type { CameraDebugSnapshot } from '../../../src/@types/camera/CameraDebugSnapshot';

const NORTH_UP_AT_LOAD = ORIENT_TUNING.northUp;
afterEach(() => {
  ORIENT_TUNING.northUp = NORTH_UP_AT_LOAD;
});

/** 0.5235987755982988 rad = 30.0°: the degrees column and the radian dump differ visibly. */
const HEADING_RAD = Math.PI / 6;

const SNAP: CameraDebugSnapshot = {
  storedFrame: 'absolute',
  renderedFrame: 'absolute',
  armMismatch: false,
  engagedBodyId: null,
  hOverR: 0.3,
  altitudeM: 1_911_300,
  distanceMpc: 1,
  orientationFrame: 'ecliptic',
  bandUpWeight: 0.5,
  rememberedTiltRad: 0,
  dofs: {
    bodyId: null,
    hOverR: 0.3,
    heading: { currentRad: HEADING_RAD, targetRad: 0, residualRad: HEADING_RAD },
    tilt: { currentRad: 0, targetRad: 0, residualRad: 0 },
    // Roll's target is independent of its current, so a blanked target cell shows.
    roll: { currentRad: 0.1, targetRad: -0.2, residualRad: 0.3 },
  },
  deltas: {
    heading: { deltaRad: 0, peakAbsRad: HEADING_RAD, peakAtMs: 42 },
    tilt: { deltaRad: 0, peakAbsRad: 0, peakAtMs: null },
    roll: { deltaRad: 0, peakAbsRad: 0, peakAtMs: null },
  },
  lastRenderedSimDays: 0,
  liveSimDays: 0,
  epochDeltaDays: 0,
  epochMismatch: false,
  anchorLocalM: null,
  eyeRelAnchorMagM: null,
  activeDriverId: 'resting',
  gestureMode: null,
  gestureCursorHit: null,
  lastZoomDirection: null,
};

function renderSection() {
  return render(createElement(CameraStateSection, { cameraDebug: () => SNAP }));
}

describe('CameraStateSection', () => {
  it('shows degrees on screen and dumps the same numbers as full-precision radians', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const { getByText, container } = renderSection();
    expect(container.textContent).toContain('30.0°');
    expect(container.textContent).not.toContain(String(HEADING_RAD));

    fireEvent.click(getByText('copy all'));
    const dump = writeText.mock.calls[0]![0];
    expect(dump).toContain(`heading: current=${HEADING_RAD}`);
    expect(dump).toContain(`peak=${HEADING_RAD}`);
    // Degrees are a screen affordance only — a pasted report must not carry them.
    expect(dump).not.toContain('30.0°');
  });

  it('keeps the heading/roll targets on the row, marked, while north-up is off', () => {
    ORIENT_TUNING.northUp = false;
    const { container } = renderSection();
    expect(container.textContent).toContain('(off)');
    // Q8: the target is a property of the field, not of whether it is applied —
    // the roll row keeps both its target and its residual, not an em-dash.
    expect(container.textContent).toContain('-11.5°');
    expect(container.textContent).toContain('17.2°');
  });
});
