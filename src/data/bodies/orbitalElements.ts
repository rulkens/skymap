/**
 * orbitalElements — the J2000 Keplerian table, the single source for BOTH body positions
 * (`keplerianPositionMpc`) and trails (`keplerianEllipse`), so a body sits on its own trail.
 * Planet and moon rows live with their Layer's body rows (`APP_BODY_REGISTRY`), where the JPL
 * notes sit. Per row: `focusId` (Sun, or the parent planet) and `plane` (omitted = ecliptic;
 * a planet's moons ride their OWN Laplace pole, `orbitPlaneFrames.ts`).
 */

import { S_STAR_ORBITAL_ELEMENTS } from './sStarOrbitalElements';
import { APP_BODY_REGISTRY } from '../../compositions/appBodies';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { famousStarOrbit } from './makers/famousStarOrbit';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export function elementsById(id: string): OrbitalElements {
  return findByIdOrThrow(ORBITAL_ELEMENTS, id, 'orbitalElements');
}

export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = [
  // The 39 S-stars; verbatim Gillessen lines in `sStarElements.ts`.
  ...S_STAR_ORBITAL_ELEMENTS,
  ...APP_BODY_REGISTRY.flatMap((row) => (row.position.kind === 'orbit' ? [row.position.elements] : [])),
  // Binary companions: a famous star on its published orbit around another.
  ...FAMOUS_STARS_GENERATED.flatMap((row) =>
    row.orbit === undefined
      ? []
      : [
          famousStarOrbit(
            row,
            row.orbit,
            findByIdOrThrow(FAMOUS_STARS_GENERATED, row.orbit.host, 'famous-star orbit host'),
          ),
        ],
  ),
];
