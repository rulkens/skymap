/**
 * shotPose — the pose a shot is framed at: the explicit one it carries, or the
 * one its `phaseDeg` computes. They are alternatives, never merged.
 */
import { bodyPhasePose } from './bodyPhasePose';
import { DEFAULT_FOV_DEG } from '../../../src/data/defaults';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { SceneShot } from '../../@types/capture/SceneShot';

// A phase pose frames the body from its angular size, so it must assume the
// same field of view the capture runs at — the app's default, never touched here.
const DEFAULT_FOV_Y_RAD = (DEFAULT_FOV_DEG * Math.PI) / 180;

export function shotPose(shot: SceneShot): CameraPose | undefined {
  if (shot.pose !== undefined && shot.phaseDeg !== undefined) {
    throw new Error(`'${shot.label}' sets both 'pose' and 'phaseDeg' — phaseDeg computes one`);
  }
  if (shot.phaseDeg === undefined) return shot.pose;
  if (shot.focusId === undefined) {
    throw new Error(
      `'${shot.label}' sets 'phaseDeg' with no 'focusId' — there is no body to phase`,
    );
  }
  return bodyPhasePose(shot.focusId, shot.t, shot.phaseDeg, DEFAULT_FOV_Y_RAD);
}
