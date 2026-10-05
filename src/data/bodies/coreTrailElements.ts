/**
 * CORE_TRAIL_ELEMENTS — core's half of the trail roster: every orbital-element
 * row but the mesh bodies' (400 km ring, clutter where the body itself is
 * invisible) and the S-stars' (the star Layer's own `guides.orbitTrails` row).
 * The S-star exclusion is BY REFERENCE, not id: `orbitalElements.ts` spreads
 * `S_STAR_ORBITAL_ELEMENTS`'s own row objects into `ORBITAL_ELEMENTS`, so a
 * `Set` over those objects needs no id lookup and can't drift from a rename.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';
import { S_STAR_ORBITAL_ELEMENTS } from './sStarOrbitalElements';

const MESH_BODY_IDS = new Set(SCENE_MESH_BODIES.map((body) => body.id));
const S_STAR_ELEMENT_ROWS = new Set<OrbitalElements>(S_STAR_ORBITAL_ELEMENTS);

export const CORE_TRAIL_ELEMENTS: readonly OrbitalElements[] = ORBITAL_ELEMENTS.filter(
  (el) => !MESH_BODY_IDS.has(el.id) && !S_STAR_ELEMENT_ROWS.has(el),
);
