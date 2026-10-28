/**
 * orbitalElements — the J2000 Keplerian table, single source of truth for BOTH body
 * positions (`keplerianPositionMpc`) and their trails (`keplerianEllipse`); the trail pass
 * anchors each trail on the snapshot body position, so a body sits on its own trail by
 * construction. The planet and moon rows live with their Layer's body rows (folded through
 * `LAYER_BODY_ROWS`), where the JPL transcription notes sit; this table is the S-stars plus
 * every composed Layer's orbit rows. Per row: `focusId` (the Sun
 * for planets, the parent planet for a moon) and `plane` (omitted = ecliptic; a planet's
 * own moons ride their OWN Laplace pole — see `orbitPlaneFrames.ts`).
 */

import { S_STAR_ORBITAL_ELEMENTS } from './sStarOrbitalElements';
import { LAYER_BODY_ROWS } from './layerBodyRows';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export function elementsById(id: string): OrbitalElements {
  return findByIdOrThrow(ORBITAL_ELEMENTS, id, 'orbitalElements');
}

export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = [
  // The 39 bound S-stars: their per-row facts live in `sStarElements.ts` beside the verbatim
  // Gillessen lines, converted once in `sStarOrbitalElements.ts` (also the star Layer's trail
  // roster). Their focus is the `galactic-centre` place, so they join the `galactic-centre` region by existing.
  ...S_STAR_ORBITAL_ELEMENTS,
  ...LAYER_BODY_ROWS.flatMap((row) => (row.position.kind === 'orbit' ? [row.position.elements] : [])),
];
