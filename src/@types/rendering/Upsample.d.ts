/**
 * Upsample — the narrow shape `createUpsampleLayer` needs from a GPU
 * upsample handle: encode a fullscreen blit of `srcView` into an already-open
 * pass. `AdditiveUpsample` (`./AdditiveUpsample.d.ts`) satisfies this
 * structurally plus a `destroy()` the layer never calls; this type exists so
 * the layer factory (and its tests) don't need the wider handle shape.
 */

export type Upsample = {
  draw(pass: GPURenderPassEncoder, srcView: GPUTextureView): void;
};
