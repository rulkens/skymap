/**
 * formatBodyMass — a body's mass for its card: Earth masses for a body that
 * orbits the Sun and is at least Pluto-sized, kilograms for a moon or a small
 * body, where a fraction of an Earth mass would be a row of zeros.
 */

import { BODY_FACTS } from '../../data/bodies/bodyFacts.generated';
import { formatScientific } from './formatScientific';

const EARTH_MASS_KG = BODY_FACTS.earth!.massKg!;
// Between Ceres (9.4e20 kg) and Pluto (1.3e22 kg).
const EARTH_MASS_UNIT_FROM_KG = 1e22;

export function formatBodyMass(massKg: number, isMoon: boolean): string {
  if (isMoon || massKg < EARTH_MASS_UNIT_FROM_KG) return `${formatScientific(massKg, 2)} kg`;
  return `${Number((massKg / EARTH_MASS_KG).toPrecision(3))} M⊕`;
}
