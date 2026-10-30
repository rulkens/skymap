/**
 * orbitalElements — the J2000 Keplerian table, the single source for BOTH body positions
 * (`keplerianPositionMpc`) and trails (`keplerianEllipse`), so a body sits on its own trail.
 * Planet and moon rows live with their Layer's body rows (`LAYER_BODY_ROWS`), where the JPL
 * notes sit. Per row: `focusId` (Sun, or the parent planet) and `plane` (omitted = ecliptic;
 * a planet's moons ride their OWN Laplace pole, `orbitPlaneFrames.ts`).
 */

import { S_STAR_ORBITAL_ELEMENTS } from './sStarOrbitalElements';
import { LAYER_BODY_ROWS } from '../../compositions/appBodies';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export function elementsById(id: string): OrbitalElements {
  return findByIdOrThrow(ORBITAL_ELEMENTS, id, 'orbitalElements');
}

export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = [
  // The 39 S-stars; verbatim Gillessen lines in `sStarElements.ts`.
  ...S_STAR_ORBITAL_ELEMENTS,
  ...LAYER_BODY_ROWS.flatMap((row) => (row.position.kind === 'orbit' ? [row.position.elements] : [])),
];
