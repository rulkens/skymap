/**
 * glintBandClass — a glint body's pick-priority class (`GLINT_CLASS_*`),
 * written raw into the glint instance's `bandClass` attribute.
 *
 * Classified by `focusId` through the one `ORBITAL_ELEMENTS` table (the same
 * source the seeds derive from), NOT a hardcoded id list — a new moon added to
 * the table classifies correctly for free. Earth is the exception: it is
 * heliocentric like the planets, so nothing in its elements tells it apart;
 * its class-0 status is a property of it being the descent's focus body.
 */

import { elementsById } from '../../data/bodies/orbitalElements';
import {
  GLINT_CLASS_EARTH,
  GLINT_CLASS_MOON,
  GLINT_CLASS_PLANET,
} from '../../data/bodies/glintPickClasses';

export function glintBandClass(bodyId: string): number {
  if (bodyId === 'earth') return GLINT_CLASS_EARTH;
  return elementsById(bodyId).focusId === 'sun' ? GLINT_CLASS_PLANET : GLINT_CLASS_MOON;
}
