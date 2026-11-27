/** RegionEntry — the `VolumeFieldRenderer`'s record per attached detail region, apart from `FieldEntry`
 *  so a base re-upload leaves it bound. The texture is borrowed, so it is never held here. */

export type RegionEntry = {
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};
