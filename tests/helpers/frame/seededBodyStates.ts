/**
 * The frame's real body-state map with a fixture's own bodies laid over it. Production reads
 * the static scene-body tables, so a fixture can no longer swap a body in through state: it
 * pins its bodies' poses here instead (via a `sceneBodyStates` mock), and every other body
 * keeps its real pose, which a draw-list cull then drops.
 */

import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import type { SeededBody } from './SeededBody';
import type { BodyState } from '../../../src/@types/scene/BodyState';

export function seededBodyStates(
  simDays: number,
  seeded: readonly SeededBody[],
): ReadonlyMap<string, BodyState> {
  const states = new Map<string, BodyState>(deriveBodyStates(simDays));
  for (const b of seeded) {
    states.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation });
  }
  return states;
}
