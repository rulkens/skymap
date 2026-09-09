/**
 * hrOverBody — the DISPLAYED altitude ratio h/R over `body`: how every
 * frame-sim fixture reads "are we engaged yet" and "how deep in the band".
 */

import { displayedEye } from './displayedEye';
import { hrOfPose } from './hrOfPose';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';

export function hrOverBody(state: EngineState, body: BodyState, radiusM: number): number {
  return hrOfPose(displayedEye(state), body, radiusM);
}
