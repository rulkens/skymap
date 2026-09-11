/** The follow pair shares a produce, a memory and the `follow` epoch row, so
 * every downstream "was follow driving?" asks this rather than one id. */

import type { DriverId } from '../../@types/engine/camera/DriverId';

export function isFollowDriverId(id: DriverId): boolean {
  return id === 'followApproach' || id === 'followHold';
}
