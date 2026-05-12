/**
 * GpuContext — the four objects downstream code needs to issue draw calls:
 * device, canvas context, swap-chain format, and the canvas element itself.
 * Bundled together to avoid threading them as separate arguments everywhere.
 */

/**
 * Everything downstream code needs to issue draw calls.
 *
 * Bundling these four objects together avoids threading `device`, `context`,
 * and `format` as separate function arguments through every module. Passing
 * a single `GpuContext` keeps call-sites tidy and makes it easy to swap in a
 * test double (e.g. an `offscreenCanvas`-based context) later.
 */
export type GpuContext = {
  /** The logical GPU device — create buffers, pipelines, and encoders from here. */
  device: GPUDevice;

  /**
   * The canvas's WebGPU context. Call `context.getCurrentTexture()` each
   * frame to get the swap-chain texture to render into.
   */
  context: GPUCanvasContext;

  /**
   * The swap-chain texture format chosen by `getPreferredCanvasFormat()`.
   * Pipeline descriptors must declare the same format for their colour
   * attachments, so we store it here for easy access.
   */
  format: GPUTextureFormat;

  /** The HTML canvas element — needed by `resizeCanvasToDisplay` and for layout reads. */
  canvas: HTMLCanvasElement;
};
