/** Camera standoff, in datum radii: the body's own override where it has one,
 *  else `clampDistance`'s Earth-tuned global (spec §3.7). */

import { SURFACE_STANDOFF_RADII } from '../camera/clampDistance';
import type { SceneBody } from '../../@types/scene/SceneBody';

export function bodyStandoffRadii(body: SceneBody): number {
  // `in` alone widens the arms that lack the field to `unknown`, hence the typeof.
  return 'standoffRadii' in body && typeof body.standoffRadii === 'number'
    ? body.standoffRadii
    : SURFACE_STANDOFF_RADII;
}
