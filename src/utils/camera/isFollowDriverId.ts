/**
 * isFollowDriverId — `followApproach` and `followHold` (`cameraDrivers.ts`) share
 * a produce, a memory and the `follow` epoch row, so every downstream "was follow
 * driving?" asks this rather than one id.
 */

export function isFollowDriverId(id: string): boolean {
  return id === 'followApproach' || id === 'followHold';
}
