/**
 * smallBody — row maker for a heliocentric asteroid or dwarf planet: `heliocentricPlanet`'s record,
 * captioned under the Small bodies checkbox instead of Planets.
 */

import type { BodySpec } from '../../../../@types/scene/BodySpec';
import type { PlanetBody } from '../../../../@types/scene/PlanetBody';
import { heliocentricPlanet } from './heliocentricPlanet';

export function smallBody(spec: BodySpec): PlanetBody {
  return { ...heliocentricPlanet(spec), captionKind: 'smallBody' };
}
