/**
 * MESH_PRESENTATIONS — every scene body drawn as a baked mesh, keyed by body id.
 * The mesh path (slots, demand, partition, pass, probe) reads this table; the
 * identity consumers (labels, trails, presence, captions, pick tables) keep
 * reading their own, so drawing a body as a mesh never changes what it IS.
 */

import type { MeshPresentation } from '../../@types/scene/MeshPresentation';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

export const MESH_PRESENTATIONS: readonly MeshPresentation[] = SCENE_MESH_BODIES.map(
  ({ id, meshKey, boundingRadiusM }) => ({ id, meshKey, boundingRadiusM }),
);
