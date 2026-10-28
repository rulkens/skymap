import type { BodyState } from '../../@types/scene/BodyState';
import type { PositionedId } from '../../@types/scene/PositionedId';
import type { Vec3 } from '../../@types/math/Vec3';
import { rootBodyIdOf } from './rootBodyIdOf';

/** Where a body's light comes from: its root anchor, the star it ultimately orbits. */
export function lightSourceMpc(
  id: PositionedId,
  states: ReadonlyMap<string, BodyState>,
): Readonly<Vec3> {
  return states.get(rootBodyIdOf(id))!.positionMpc;
}
