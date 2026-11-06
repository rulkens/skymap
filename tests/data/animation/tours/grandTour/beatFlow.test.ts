/**
 * A flowing beat's camera never comes to rest where its enter clip hands over to
 * its dwell: the enter clip lands still turning and still zooming out, and the
 * dwell starts at those speeds and coasts to the beat's view. A rate, timing or
 * landing that drifts apart between the enter clip and the dwell brings the stop
 * back, or makes the next beat's restated start jump, and only this catches it.
 */
import { describe, it, expect } from 'vitest';

import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';
import {
  earthAndMoon,
  earthAndMoonDwell,
} from '../../../../../src/data/animation/tours/grandTour/earthAndMoon';
import { EARTH_AND_MOON_VIEW } from '../../../../../src/data/animation/tours/grandTour/earthAndMoonView';
import { TOUR_NIGHT_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourNightSimDays';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { compileClip } from '../../../../../src/services/engine/animation/compileClip';
import { resolveClipFoci } from '../../../../../src/services/engine/animation/resolveClipFoci';
import { evaluateClip } from '../../../../../src/services/engine/camera/clips/evaluateClip';
import { resolveClipStart } from '../../../../../src/state/camera/cameraSlice';
import { selectionResolverOver } from '../../../../support/selectionResolverOver';

const RESOLVER = selectionResolverOver({ byId: () => null, byCategory: () => [] });
const BASIS = ORIENTATION_FRAMES.ecliptic;
const LIVE: CameraPose = { target: [0, 0, 0], yaw: 0.4, pitch: 0.2, distance: 1e-13, roll: 0 };
const DT = 1e-3;

const resolve = (clip: ClipData, live: CameraPose): ClipData =>
  resolveClipStart(resolveClipFoci(clip, RESOLVER, 1, live, TOUR_NIGHT_SIM_DAYS, BASIS), live);

const rateAt = (clip: ClipData, t: number, ch: 'yaw' | 'distance'): number =>
  (evaluateClip(clip, t + DT, BASIS)[ch] - evaluateClip(clip, t - DT, BASIS)[ch]) / (2 * DT);

describe.each([['beat 02, Earth and Moon', earthAndMoon, earthAndMoonDwell, EARTH_AND_MOON_VIEW]])(
  '%s flows into its dwell',
  (_name, enterClip, dwellClip, view) => {
    const enter = resolve(enterClip, LIVE);
    const enterEnd = compileClip(enter).durationSec;
    const landed = evaluateClip(enter, enterEnd, BASIS);
    const dwell = resolve(dwellClip, landed);
    const dwellEnd = compileClip(dwell).durationSec;
    const enterTail = enterEnd - 2 * DT;

    it('is still turning when the enter clip lands', () => {
      expect(Math.abs(rateAt(enter, enterTail, 'yaw'))).toBeGreaterThan(1e-3);
    });

    it('starts its dwell at the turn speed the enter clip lands at', () => {
      expect(rateAt(dwell, 2 * DT, 'yaw')).toBeCloseTo(rateAt(enter, enterTail, 'yaw'), 3);
    });

    // A twentieth of the range per second still reads as moving; the zoom is
    // the beat's main motion, so the turn alone cannot hide it stopping.
    it('is still zooming out when the enter clip lands', () => {
      expect(rateAt(enter, enterTail, 'distance') / landed.distance).toBeGreaterThan(0.05);
    });

    it('starts its dwell at the zoom speed the enter clip lands at', () => {
      const enterRate = rateAt(enter, enterTail, 'distance');
      expect(rateAt(dwell, 2 * DT, 'distance') / enterRate).toBeCloseTo(1, 3);
    });

    it("coasts to the beat's view, where the next beat starts", () => {
      const end = evaluateClip(dwell, dwellEnd, BASIS);
      expect(end.distance / view.distanceMpc).toBeCloseTo(1, 6);
      expect(Math.abs(rateAt(dwell, dwellEnd - 2 * DT, 'distance') / end.distance)).toBeLessThan(
        1e-3,
      );
    });
  },
);
