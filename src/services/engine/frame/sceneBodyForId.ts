import type { PassState } from '../../../@types/engine/frame/PassState';
import type { SlabHostId } from '../../../@types/engine/frame/SlabHostId';
import type { CelestialBody } from '../../../@types/scene/CelestialBody';

/**
 * The registry record for `bodyId`, searched across every store the body-slab
 * layers can seed a row from. Mirrors `sceneBodyStates`' own null-safety
 * (missing ⇒ `null`, never a crash) rather than assuming Earth.
 */
export function sceneBodyForId(state: PassState, bodyId: SlabHostId): CelestialBody | null {
  const { earth, planets } = state.data.bodies;
  if (earth !== null && earth.id === bodyId) return earth;
  return planets.find((p) => p.id === bodyId) ?? null;
}
