/**
 * MeshPresentation — a scene body that DRAWS as a baked mesh, whichever table
 * (mission or celestial) its identity lives in. `id` keys slot, renderer, state and pick.
 */
export type MeshPresentation = {
  readonly id: string;
  readonly meshKey: string;
  /** Baked bounding sphere, metres — the pick proxy and load-radius scale. */
  readonly boundingRadiusM: number;
};
