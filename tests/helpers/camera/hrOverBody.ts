/**
 * hrOverBody — the displayed altitude ratio h/R over `body`: how every
 * frame-sim fixture reads "are we engaged yet" and "how deep in the band".
 */

import { displayedEye } from './displayedEye';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';

export function hrOverBody(state: EngineState, body: BodyState, radiusM: number): number {
  const eye = displayedEye(state);
  const d = Math.hypot(
    eye[0] - body.positionMpc[0]!,
    eye[1] - body.positionMpc[1]!,
    eye[2] - body.positionMpc[2]!,
  );
  return d / (radiusM * SCALE_UNITS.M_TO_MPC) - 1;
}
