/**
 * AtlasConfig — optional atlas binding for `InstancedQuadRenderer`.
 * When present, the bind group becomes a 3-binding shape
 * `[uniform, texture, sampler]` and the returned renderer exposes
 * `bindAtlas`. When absent, the bind group is a 1-binding shape
 * `[uniform]` built at construction time.
 */
export type AtlasConfig = {
  /** Sampler descriptor; the factory creates the sampler. Defaults
   *  to bilinear-clamp, matching the existing Quad + Disk samplers. */
  samplerDescriptor?: GPUSamplerDescriptor;
};
