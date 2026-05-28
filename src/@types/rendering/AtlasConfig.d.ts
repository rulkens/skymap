/**
 * AtlasConfig — optional atlas binding for `InstancedQuadRenderer`.
 * When present, the bind group becomes `[uniform, texture, sampler]`
 * and the returned renderer exposes `bindAtlas`. When absent, the bind
 * group is `[uniform]` only, built at construction time.
 */
export type AtlasConfig = {
  /** Sampler descriptor; the factory creates the sampler. Defaults to
   *  bilinear-clamp, matching the existing Quad + Disk samplers. */
  samplerDescriptor?: GPUSamplerDescriptor;
  /** Opt-in hi-res `texture_2d_array` + sampler pair at bindings 3 + 4.
   *  Only the textured-disk consumer enables this (for the famous-galaxy
   *  hi-res LOD); textured-quad and procedural-disk consumers leave it
   *  unset and keep the 3-entry BGL shape. When set, the renderer
   *  exposes `bindHiResArray` and the composed bind group is deferred
   *  until both `bindAtlas` and `bindHiResArray` have been called. */
  hiResArray?: true;
};
