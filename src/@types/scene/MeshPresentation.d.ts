/**
 * MeshPresentation — a scene body that DRAWS as a baked triangle mesh, whatever
 * table its identity lives in. A mission row (`SCENE_MESH_BODIES`) is one; a
 * celestial row drawn from a shape model is another. `id` keys the asset slot,
 * the renderer's mesh Map, the body-state snapshot and the pick
 * (`sceneBodyPickId` finds the body's own table) alike.
 */
export type MeshPresentation = {
  readonly id: string;
  readonly meshKey: string;
  /** Baked bounding sphere, metres — the pick proxy and load-radius scale. */
  readonly boundingRadiusM: number;
};
