/**
 * liveRenderCamera — verifies the epoch-divergence fix's other half: the
 * assembled camera comes from the DISPLAYED pose `runFrame` actually drew, and
 * the two bases stay on their own halves — yaw/pitch decodes through
 * `settings.orientation`, screen-up through the live `outputs.upBasis`.
 */
import { describe, it, expect } from 'vitest';

import { liveRenderCamera } from '../../../../src/services/engine/helpers/liveRenderCamera';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const PROJECTION = { fovYRad: 0.9, aspect: 16 / 9, near: 0.01, far: 1e4 };
// The pose basis (settings) and the up-basis MUST differ, or a swap between the
// two arguments is unobservable in the result.
const UP_BASIS = ORIENTATION_FRAMES.galactic;
// Straight up the frame's pole: `yawPitchToDir` gives +Y, so the eye offset is
// exactly the basis's MIDDLE column — +z for equatorial, the NGP for galactic.
const DISPLAYED: CameraPose = { target: [1, 2, 3], yaw: 0, pitch: Math.PI / 2, distance: 10 };
// A decoy in the register: only `outputs.displayed` may reach the result.
const REGISTERED: CameraPose = { target: [90, 90, 90], yaw: 0, pitch: 0, distance: 1 };

function makeState(overrides?: { booted?: boolean }): EngineState {
  return {
    booted: overrides?.booted ?? true,
    settings: { orientation: 'equatorial' },
    cameraRuntime: {
      register: { pose: absoluteArm(REGISTERED) },
      outputs: {
        displayed: absoluteArm(DISPLAYED),
        projection: PROJECTION,
        upBasis: UP_BASIS,
        simDays: CONST_J2000,
      },
    },
  } as unknown as EngineState;
}

describe('liveRenderCamera', () => {
  it('returns null before bootstrap', () => {
    expect(liveRenderCamera(makeState({ booted: false }))).toBeNull();
  });

  it('decodes the displayed pose through the settings basis, up through outputs', () => {
    const out = liveRenderCamera(makeState())!;

    expect(out.target).toEqual([1, 2, 3]);
    // Equatorial's pole column is +z ⇒ the eye sits 10 straight up from the
    // target. Decoding through the up-basis instead would land near the NGP,
    // [1, 2, 3] + 10 · GAL_Z_EQ ≈ [−7.7, 0.0, 7.6].
    expect(out.position[0]).toBeCloseTo(1, 12);
    expect(out.position[1]).toBeCloseTo(2, 12);
    expect(out.position[2]).toBeCloseTo(13, 12);
    expect(out.upBasis).toBe(UP_BASIS);
    expect(out.fovYRad).toBe(PROJECTION.fovYRad);
  });
});
