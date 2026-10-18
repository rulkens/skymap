/**
 * A fixture's bodies as `ReadyFrameContext.sceneBodies` hands them: each paired with its
 * position, from the frame's body states (or the record itself, for a fixture that carries
 * one). The body is the SAME record the state's rosters hold: core finds its own by them.
 */

import type { PositionedSceneBody } from '../../../src/@types/engine/frame/PositionedSceneBody';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { SceneBody } from '../../../src/@types/scene/SceneBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

export function positionedBodiesOf(
  bodies: readonly SceneBody[],
  states?: ReadonlyMap<string, Pick<BodyState, 'positionMpc'>>,
): readonly PositionedSceneBody[] {
  return bodies.map((body) => ({
    body,
    positionMpc:
      states?.get(body.id)?.positionMpc ??
      (body as SceneBody & { readonly positionMpc: Readonly<Vec3> }).positionMpc,
  }));
}
