/** Voxel-space lanes for the Galaxies overlay's own draw set — same shape as seedAgents'
 * catalog-prefix lanes, but over every point that survived source/tier load:
 * the overlay is a data preview, not the sim's box-culled readout. */
export type OverlayCatalog = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly weight: Float32Array;
};
