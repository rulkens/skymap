/**
 * Beats state their roll on entry: the rise (beat 01) lands rolled, because its
 * world leg keeps the body leg's image, and a skip from it straight into the
 * Milky Way beat used to run that beat rolled. Each beat after the rise must
 * land level whatever roll the beat before left.
 */
import { describe, it, expect } from 'vitest';

import { earthAndMoon } from '../../../../../src/data/animation/tours/grandTour/earthAndMoon';
import { solarSystem } from '../../../../../src/data/animation/tours/grandTour/solarSystem';
import { stellarNeighbourhood } from '../../../../../src/data/animation/tours/grandTour/stellarNeighbourhood';
import { youAreHere } from '../../../../../src/data/animation/tours/grandTour/youAreHere';
import { TOUR_NIGHT_SIM_DAYS } from '../../../../../src/data/animation/tours/grandTour/tourNightSimDays';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { resolveClipFoci } from '../../../../../src/services/engine/animation/resolveClipFoci';
import { compileClip } from '../../../../../src/services/engine/animation/compileClip';
import { evaluateClip } from '../../../../../src/services/engine/camera/clips/evaluateClip';
import { resolveClipStart } from '../../../../../src/state/camera/cameraSlice';
import { selectionResolverOver } from '../../../../support/selectionResolverOver';
import type { CameraPose } from '../../../../../src/@types/camera/pose/CameraPose';
import { installAppSelectionKinds } from '../../../../support/installAppSelectionKinds';

installAppSelectionKinds();

const RESOLVER = selectionResolverOver({ byId: () => null, byCategory: () => [] });
const BASIS = ORIENTATION_FRAMES.galactic;
// The roll the rise lands on, measured through the camera runtime.
const ROLLED: CameraPose = {
  target: [0, 0, 0],
  yaw: 0.4,
  pitch: 0.2,
  distance: 1e-13,
  roll: -0.628,
};

describe('grand tour beat rolls', () => {
  it.each([
    ['Earth and Moon', earthAndMoon],
    ['the Solar System', solarSystem],
    ['our stellar neighbourhood', stellarNeighbourhood],
    ['the Milky Way', youAreHere],
  ])('%s lands level after a rolled beat', (_name, clip) => {
    const resolved = resolveClipFoci(clip, RESOLVER, 1, ROLLED, TOUR_NIGHT_SIM_DAYS, BASIS);
    const landed = evaluateClip(
      resolveClipStart(resolved, ROLLED),
      compileClip(resolved).durationSec,
      BASIS,
    );
    expect(landed.roll ?? 0).toBeCloseTo(0, 9);
  });
});
