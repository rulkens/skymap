/**
 * A flowing beat's camera never comes to rest where its enter clip hands over to
 * its dwell: the enter clip's tail spins yaw up to the dwell's speed, and the
 * dwell starts at that speed. A rate or timing that drifts apart between the two
 * files brings the stop back, and only this catches it.
 */
import { describe, it, expect } from 'vitest';

import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';
import {
  earthAndMoon,
  earthAndMoonDwell,
} from '../../../../../src/data/animation/tours/grandTour/earthAndMoon';
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

const resolve = (clip: ClipData): ClipData =>
  resolveClipStart(resolveClipFoci(clip, RESOLVER, 1, LIVE, TOUR_NIGHT_SIM_DAYS, BASIS), LIVE);

const yawRateAt = (clip: ClipData, t: number): number => {
  const resolved = resolve(clip);
  return (
    (evaluateClip(resolved, t + DT, BASIS).yaw - evaluateClip(resolved, t - DT, BASIS).yaw) /
    (2 * DT)
  );
};

describe.each([['beat 02, Earth and Moon', earthAndMoon, earthAndMoonDwell]])(
  '%s flows into its dwell',
  (_name, enter, dwell) => {
    const enterEnd = compileClip(resolve(enter)).durationSec;

    it('is still turning when the enter clip lands', () => {
      expect(Math.abs(yawRateAt(enter, enterEnd - 2 * DT))).toBeGreaterThan(1e-3);
    });

    it('starts its dwell at the speed the enter clip lands at', () => {
      expect(yawRateAt(dwell, 2 * DT)).toBeCloseTo(yawRateAt(enter, enterEnd - 2 * DT), 3);
    });
  },
);
