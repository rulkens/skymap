import type { FocusSphere } from '../../@types/rendering/FocusSphere';

/** Whether two focus spheres dim the same region: same centre and radii, by value. */
export function sameFocusSphere(a: FocusSphere, b: FocusSphere): boolean {
  return (
    a.center.every((v, i) => v === b.center[i]) &&
    a.apparentRadiusMpc === b.apparentRadiusMpc &&
    a.physicalRadiusMpc === b.physicalRadiusMpc
  );
}
