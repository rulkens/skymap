import { POSITION_DRIVERS } from '../../data/bodies/positionDrivers';

/**
 * bodyFollowsSimClock — does the sim clock move `id`? True for an orbit AND for
 * a surface-fixed site (its host spins under it); false for a static anchor
 * (Sun, famous stars). One home for the fact, shared by `bodyMovesThisFrame`
 * and `followedBodyHome`.
 */
export function bodyFollowsSimClock(id: string): boolean {
  return POSITION_DRIVERS.some((driver) => driver.id === id && driver.kind !== 'anchor');
}
