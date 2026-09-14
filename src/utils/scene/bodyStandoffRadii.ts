/** How close the camera may come to a body, in datum radii: the body's own
 *  override where it has one, else `clampDistance`'s Earth-tuned global. One
 *  home for the fallback, so the Mpc-space zoom floor and the metre-space
 *  descent floor cannot read different multiples (spec §3.7). */

import { SURFACE_STANDOFF_RADII } from '../camera/clampDistance';
import type { SceneBody } from '../../@types/scene/SceneBody';

export function bodyStandoffRadii(body: SceneBody): number {
  // `in` alone widens the arms that lack the field to `unknown`, hence the typeof.
  return 'standoffRadii' in body && typeof body.standoffRadii === 'number'
    ? body.standoffRadii
    : SURFACE_STANDOFF_RADII;
}
