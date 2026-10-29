import type { Vec3 } from '../math/Vec3';
import type { PositionedId } from './PositionedId';

/**
 * TransientPositioner — where a transient object is at `simDays`, in world Mpc, given every body
 * already placed (so it can hang off Earth's position and orientation); null when it has none.
 * Pure of its arguments: `deriveBodyStates` memoizes on the instant.
 */
export type TransientPositioner = (
  simDays: number,
  positions: ReadonlyMap<PositionedId, Vec3>,
) => Vec3 | null;
