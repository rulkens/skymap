/**
 * nearestBodyHR — which body owns the eye's approach, body-blind: the
 * `SCENE_CELESTIAL_BODIES` roster row nearest in band units (h/R), focus never
 * consulted. ONE home for the rule — the regime predicate's engage test and
 * the world-arm frame alignment must never disagree about the owning body.
 * Mesh bodies are out of the roster by type: h/R is an altitude over GROUND,
 * and a bounding sphere would engage the surface camera on empty space.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import { SCENE_CELESTIAL_BODIES } from '../../../data/bodies/sceneCelestialBodies';
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
  for (const body of SCENE_CELESTIAL_BODIES) {
    const bodyId = body.id as BodyId;
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) continue;
    const hr = hOverR(eyeMpc, bodyState, body.radiusM);
    if (nearest === null || hr < nearest.hr) nearest = { bodyId, bodyState, hr };
  }
  return nearest;
}
