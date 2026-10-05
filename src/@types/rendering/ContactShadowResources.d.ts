/**
 * ContactShadowResources — one mesh body's contact-decal GPU objects, released
 * with the rest of its `MeshResources`. The bind group also holds the scene's
 * depth view, so it is minted on first draw and re-minted whenever that view
 * changes (a resize reallocates the depth texture); `depthView` is the key.
 */
export type ContactShadowResources = {
  readonly texture: GPUTexture;
  readonly uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup | null;
  depthView: GPUTextureView | null;
};
