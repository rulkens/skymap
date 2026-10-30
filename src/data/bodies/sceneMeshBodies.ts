import type { MeshBody } from '../../@types/scene/MeshBody';
import { LAYER_BODY_ROWS } from '../../compositions/appBodies';
import { isMeshBody } from '../../utils/meshBodies/isMeshBody';

/**
 * SCENE_MESH_BODIES — the mesh-drawn bodies (the fifth `SceneBody` arm), every
 * one a Layer's body row. Each row's `meshBody` seed carries identity and
 * per-body dials: `boundingRadiusM` and `albedo` are joined in from
 * `MESH_ASSETS`, so the baked asset stays their single source of truth and a
 * re-bake never needs an edit there. Positions ride the position drivers
 * (`ORBITAL_ELEMENTS`, `SAMPLED_BODIES` or `SURFACE_FIXED_SITES`), orientation
 * `ROTATION_ELEMENTS`, all keyed on these ids.
 */
export const SCENE_MESH_BODIES: readonly MeshBody[] = LAYER_BODY_ROWS.map(
  (row) => row.body,
).filter(isMeshBody);
