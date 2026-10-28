import type { PositionedId } from '../../@types/scene/PositionedId';
import { bodyHostId } from '../../data/bodies/positionDrivers';

/**
 * The anchor a body ultimately hangs off, walking `bodyHostId` (orbit focus or
 * site host): the Sun for the solar system, a star for its planets.
 * `deriveBodyStates` resolves the same graph at module load and throws on a
 * cycle or a dangling focus, so this recursion bottoms out by the time it runs.
 */
export function rootBodyIdOf(id: PositionedId): PositionedId {
  const host = bodyHostId(id);
  return host === null ? id : rootBodyIdOf(host);
}
