/**
 * MaskSceneOcclusion — the scene's occlusion already resolved into one texture at the
 * output's own size (`shaders/occlusionMask/io.wesl`: coverage, distance km). What a rig
 * binds when its output is not the image `foreground:0` was drawn in (the dome's fisheye).
 */
export type MaskSceneOcclusion = {
  readonly kind: 'mask';
  readonly maskView: GPUTextureView;
};
