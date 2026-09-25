/** Camera standoff, in datum radii: the body's own override where it has one,
 *  else `clampDistance`'s Earth-tuned global (spec §3.7). */

import { SURFACE_STANDOFF_RADII } from '../camera/clampDistance';
import type { SceneBody } from '../../@types/scene/SceneBody';

export function bodyStandoffRadii(body: SceneBody): number {
  return 'standoffRadii' in body ? body.standoffRadii : SURFACE_STANDOFF_RADII;
}
