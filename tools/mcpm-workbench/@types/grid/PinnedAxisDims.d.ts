/** One grid axis held at a fixed voxel count while the voxel size varies (sizeAfterSliderEdit). */
export type PinnedAxisDims = {
  readonly axis: 0 | 1 | 2;
  readonly dims: number;
};
