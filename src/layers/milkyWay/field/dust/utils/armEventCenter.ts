import { armRidgeAngle } from '../../arms/utils/armRidgeAngle';
import { warpSurfaceFrame } from '../../mixture/utils/warpSurfaceFrame';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { SfEvent } from '../../starFormation/@types/SfEvent';
import type { Vec3 } from '../../../../../@types/math/Vec3';
import { armRidgeCurvePoint } from '../../arms/utils/armRidgeCurvePoint';

/**
 * World centre of one SF event on its arm's warped surface — shared by the
 * bubble and HII-cavity builders so a placement fix in one can't silently
 * diverge from the other.
 */
export function armEventCenter(
  event: Pick<SfEvent, 'logR' | 'acrossOffset'>,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): { readonly center: Vec3; readonly armRadius: number } {
  const armRadius = geometry.armStartRadius * Math.exp(event.logR);
  const angle = armRidgeAngle(event.logR, geometry, arm);
  const ridge = armRidgeCurvePoint(event.logR, geometry, arm);
  const frame = warpSurfaceFrame(armRadius, angle, geometry);
  // ON the warp surface: `frame.across` is a tangent to the warped disc at
  // this point, not a flat horizontal offset.
  const center: Vec3 = [
    ridge[0] + frame.across[0] * event.acrossOffset,
    ridge[1] + frame.across[1] * event.acrossOffset,
    ridge[2] + frame.across[2] * event.acrossOffset,
  ];
  return { center, armRadius };
}
