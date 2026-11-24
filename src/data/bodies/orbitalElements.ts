/**
 * orbitalElements — the J2000 Keplerian table, the single source for BOTH body positions
 * (`keplerianPositionMpc`) and trails (`keplerianEllipse`), so a body sits on its own trail.
 * Every row lives with its Layer's body rows (`APP_BODY_REGISTRY`), where the sources are cited. Per row: `focusId` (Sun, or the parent planet) and `plane` (omitted = ecliptic;
 * a planet's moons ride their OWN Laplace pole, `orbitPlaneFrames.ts`).
 */

import { APP_BODY_REGISTRY } from '../../compositions/appBodies';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export function elementsById(id: string): OrbitalElements {
  return findByIdOrThrow(ORBITAL_ELEMENTS, id, 'orbitalElements');
}

export const ORBITAL_ELEMENTS: readonly OrbitalElements[] = APP_BODY_REGISTRY.flatMap((row) =>
  row.position.kind === 'orbit' ? [row.position.elements] : [],
);
