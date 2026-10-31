/**
 * glintBandClass — a glint body's pick-priority class (`GLINT_CLASS_*`),
 * written raw into the glint instance's `bandClass` attribute.
 *
 * Classified by the body's position-driver host (`bodyHostId`), NOT a hardcoded
 * id list — a new moon or a rover on Mars classifies correctly for free. Earth
 * is the exception: it is heliocentric like the planets, so nothing in its
 * driver tells it apart; its class-0 status is a property of it being the
 * descent's focus body.
 */

import { bodyHostId } from '../../../data/bodies/positionDrivers';
import {
  GLINT_CLASS_EARTH,
  GLINT_CLASS_MOON,
  GLINT_CLASS_PLANET,
} from './glintPickClasses';

export function glintBandClass(bodyId: string): number {
  if (bodyId === 'earth') return GLINT_CLASS_EARTH;
  // Hanging off a root, a star (planet, probe, exoplanet) : off a planet (moon, rover).
  const host = bodyHostId(bodyId);
  return host !== null && bodyHostId(host) === null ? GLINT_CLASS_PLANET : GLINT_CLASS_MOON;
}
