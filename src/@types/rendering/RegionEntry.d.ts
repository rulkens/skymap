/**
 * RegionEntry — the `VolumeFieldRenderer`'s record for one attached detail region: its own
 * RegionUniforms buffer and the group 2 that binds it with the borrowed texture's view. Kept apart
 * from `FieldEntry`, so a base re-upload leaves it bound; the texture itself is never held here.
 */

export type RegionEntry = {
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};
