/**
 * nearestBodyHR — which body owns the eye's approach, body-blind: the
 * `SCENE_BODIES` roster row nearest in band units (h/R), focus never
 * consulted. ONE home for the rule — the regime predicate's engage test and
 * the world-arm frame alignment must never disagree about the owning body.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { hOverR } from './hOverR';

type Nearest = {
  readonly bodyId: BodyId;
  readonly bodyState: BodyState;
  readonly hr: number;
};

export function nearestBodyHR(
  eyeMpc: Readonly<Vec3>,
  bodyStates: ReadonlyMap<BodyId, BodyState>,
): Nearest | null {
  let nearest: Nearest | null = null;
  for (const body of SCENE_BODIES) {
    const bodyId = body.id as BodyId;
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) continue;
    const hr = hOverR(eyeMpc, bodyState, body.radiusM);
    if (nearest === null || hr < nearest.hr) nearest = { bodyId, bodyState, hr };
  }
  return nearest;
}
