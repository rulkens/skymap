/**
 * SurfaceTileStreamDeps — construction config for `createSurfaceTileStream`.
 */

export type SurfaceTileStreamDeps = {
  readonly device: GPUDevice;
  /** Wakes the render loop when a fetch lands; the stream never votes itself. */
  readonly requestRender: () => void;
};
