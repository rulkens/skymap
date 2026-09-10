/**
 * readRegister — the authored pose register and the winner id that wrote it,
 * read as one row so a fixture never pairs a pose with the wrong frame's winner.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';

export function readRegister(state: EngineState): {
  readonly pose: FramedCameraPose;
  readonly winner: string;
} {
  return {
    pose: state.cameraRuntime.register.pose,
    winner: state.cameraRuntime.register.winner,
  };
}
