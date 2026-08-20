/**
 * flyToLonLatPose — covers what the extraction adds over the already-tested
 * pose math (see tests/utils/camera/lonLatFocusPose.test.ts): the null guards
 * (no Earth body seeded yet, or its id unresolved by `deriveBodyStates`) and
 * that `distance` is threaded from `cameraRuntime.lastPose.current`, NOT
 * `state.cam` — the exact stale-register bug `liveRenderCamera.test.ts` guards
 * against, reproduced here because this helper reads the same live pose.
 */
import { describe, it, expect } from 'vitest';

import { flyToLonLatPose } from '../../../../src/services/engine/helpers/flyToLonLatPose';
import { lonLatFocusPose } from '../../../../src/utils/camera/lonLatFocusPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

const SIM_DAYS = CONST_J2000 + 9727.95;

function makeState(overrides?: {
  earth?: { id: string; label: string; radiusKm: number } | null;
}): EngineState {
  return {
    data: {
      bodies: {
        earth:
          overrides && 'earth' in overrides
            ? overrides.earth
            : { id: 'earth', label: 'Earth', radiusKm: 6371 },
      },
    },
    settings: { orientation: 'galactic' },
    cameraRuntime: {
      lastRenderedSimDays: { current: SIM_DAYS },
      // Deliberately disagrees with any `state.cam` a caller might also carry —
      // this is the live pose the helper must read `distance` from.
      lastPose: { current: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 42 } },
    },
  } as unknown as EngineState;
}

describe('flyToLonLatPose', () => {
  it('returns null before Earth is seeded (data.bodies.earth null)', () => {
    expect(flyToLonLatPose(makeState({ earth: null }), 10, 20)).toBeNull();
  });

  it('returns null if the body id is unknown to deriveBodyStates', () => {
    const state = makeState({ earth: { id: 'not-a-real-body', label: 'Ghost', radiusKm: 1 } });
    expect(flyToLonLatPose(state, 10, 20)).toBeNull();
  });

  it('derives the pose from cameraRuntime.lastPose.current.distance and matches lonLatFocusPose directly', () => {
    const state = makeState();
    const out = flyToLonLatPose(state, 10, 20);

    const earthState = deriveBodyStates(SIM_DAYS).get('earth')!;
    const expected = lonLatFocusPose(
      { lonDeg: 10, latDeg: 20 },
      earthState.positionMpc,
      42,
      earthState.orientation,
      ORIENTATION_FRAMES.galactic,
    );
    expect(out).toEqual(expected);
  });
});
