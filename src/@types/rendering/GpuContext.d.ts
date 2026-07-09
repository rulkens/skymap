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
   * The swap-chain texture format chosen by `getPreferredCanvasFormat()` —
   * always, full stop. This is NEVER an offscreen/colour-target format.
   * A renderer that draws into an offscreen (HDR) target receives that
   * target's format as an explicit `targetFormat` argument at construction;
   * it never reaches through this field for its colour attachment. Even the
   * post-tone-map UI overlays (labels, marker lines, selection ring) that DO
   * target the swap chain take `targetFormat` explicitly, so a layer's target
   * is legible at its renderer's construction site rather than inferred here.
   */
  format: GPUTextureFormat;

  /** The HTML canvas element — needed by `resizeCanvasToDisplay` and for layout reads. */
  canvas: HTMLCanvasElement;
};
