/**
 * MESH_PRESENTATIONS — every scene body drawn as a baked mesh, keyed by body id.
 * The mesh path (slots, demand, partition, pass, probe) reads this table; the
 * identity consumers (labels, trails, presence, captions, pick tables) keep
 * reading their own, so drawing a body as a mesh never changes what it IS.
 */

import type { MeshPresentation } from '../../@types/scene/MeshPresentation';
import { MESH_ASSETS } from './meshAssets.generated';
import { SCENE_MESH_BODIES } from './sceneMeshBodies';

/** Celestial bodies drawn from a mission shape model; the mesh key is the body id. */
const SHAPE_MODEL_BODY_IDS = ['phobos', 'deimos'] as const;

function shapeModel(id: string): MeshPresentation {
  const asset = MESH_ASSETS[id];
  if (!asset) throw new Error(`meshPresentations: no MESH_ASSETS entry for '${id}'`);
  return { id, meshKey: id, boundingRadiusM: asset.boundingRadiusM };
}

export const MESH_PRESENTATIONS: readonly MeshPresentation[] = [
  ...SCENE_MESH_BODIES.map(({ id, meshKey, boundingRadiusM }) => ({ id, meshKey, boundingRadiusM })),
  ...SHAPE_MODEL_BODY_IDS.map(shapeModel),
];
