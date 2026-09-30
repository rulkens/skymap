import { describe, it, expect } from 'vitest';

import { absoluteRung } from '../../../../../src/services/engine/camera/rungs/absoluteRung';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../src/data/defaults';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../../src/data/camera/cameraTuning';
import { EMPTY_TILT_MEMORY } from '../../../../../src/data/camera/emptyTiltMemory';
import { datumOnlyTerrainHeight } from '../../../../../src/utils/camera/datumOnlyTerrainHeight';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { FramedPose } from '../../../../../src/@types/camera/FramedPose';
import type { RungCtx } from '../../../../../src/@types/camera/RungCtx';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const EARTH = BODIES.get('earth')!;
const CTX: RungCtx = {
  bodies: BODIES,
  poseBasis: B,
  upBasis: B,
  terrainHeightAt: datumOnlyTerrainHeight,
  focusBodyId: null,
  pivot: { radiusMpc: null, floorMpc: 0 },
  viewportPx: [1920, 1080],
  fovYRad: 1,
  tuning: TUNING,
};

// Inside Earth's tilt band with an off-target roll, so the zoom's roll ride has work to do.
const FRAMED: FramedPose<'absolute'> = {
  frame: 'absolute',
  pose: {
    target: [EARTH.positionMpc[0]!, EARTH.positionMpc[1]!, EARTH.positionMpc[2]!],
    yaw: 0.7,
    pitch: 0.3,
    distance: SCENE_EARTH.surface.datumRadiusM * (1 + TUNING.tiltFullHR * 2) * SCALE_UNITS.M_TO_MPC,
    roll: 1.4,
  },
};

describe('absoluteRung', () => {
  it('a zoom nudge is the wheel step of the same factor, roll ride included', () => {
    const z = 0.3;
    const stepped = absoluteRung.step(
      null,
      EMPTY_TILT_MEMORY,
      FRAMED,
      { kind: 'zoom', factor: Math.exp(z), duringGesture: false, cursorPx: null },
      CTX,
    ).pose;
    const nudged = absoluteRung.nudge(EMPTY_TILT_MEMORY, FRAMED, { zoom: z }, CTX).pose;
    expect(stepped.roll).not.toBe(FRAMED.pose.roll);
    expect(nudged).toEqual(stepped);
  });
});
