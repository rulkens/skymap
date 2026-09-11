/**
 * TRAIL_ELEMENTS — the orbital elements that draw a conic trail. A mesh body's
 * own 400 km ring around Earth is clutter at every zoom where the body itself
 * is invisible, so the mesh bodies draw no trail (ruling: none, not a thinned
 * one) while every other row keeps its conic.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

const MESH_BODY_IDS = new Set(SCENE_MESH_BODIES.map((body) => body.id));

export const TRAIL_ELEMENTS: readonly OrbitalElements[] = ORBITAL_ELEMENTS.filter(
  (el) => !MESH_BODY_IDS.has(el.id),
);
