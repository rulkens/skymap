import { ORBITAL_ELEMENTS } from '../../data/bodies/orbitalElements';

/**
 * bodyFollowsSimClock — is `id` an `ORBITAL_ELEMENTS` row, as opposed to a
 * static anchor (Sun, famous stars)? One home for the membership fact, shared
 * by `bodyMovesThisFrame` and `followedBodyHome`.
 */
export function bodyFollowsSimClock(id: string): boolean {
  return ORBITAL_ELEMENTS.some((el) => el.id === id);
}
