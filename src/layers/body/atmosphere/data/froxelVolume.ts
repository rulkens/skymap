/**
 * froxelVolume — shape of the camera-local aerial-perspective froxel volume.
 * `FROXEL_SLICE_KM` reaches the shaders through `AtmosphereUniforms.froxelSliceKm`
 * (never a shader literal), so the slice regime is a CPU-side knob; the slice
 * COUNT reaches them as `textureDimensions(...).z` of the volume itself.
 */

/** Froxel volume resolution: x/y screen-space, z the distance slices. */
export const FROXEL_DIMS = { x: 32, y: 32, z: 64 } as const;

/** Distance each z texel integrates over — 64 slices ⇒ 256 km of reach. */
export const FROXEL_SLICE_KM = 4;

/**
 * Mirror of `aerialPerspective/fragment.wesl`'s `HANDOFF_HORIZON_END` (parity-tested):
 * horizon distance over the volume's reach at which the apply reads the shell alone.
 */
export const HANDOFF_HORIZON_END = 2;
