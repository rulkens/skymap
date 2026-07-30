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
   * The swap-chain texture format. Normally `getPreferredCanvasFormat()` —
   * this is NEVER an offscreen/colour-target format. A renderer that draws
   * into an offscreen (HDR) target receives that target's format as an
   * explicit `targetFormat` argument at construction; it never reaches
   * through this field for its colour attachment. Even the post-tone-map UI
   * overlays (labels, marker lines, selection ring) that DO target the swap
   * chain take `targetFormat` explicitly, so a layer's target is legible at
   * its renderer's construction site rather than inferred here.
   *
   * HDR-output spike: `initGpu` (`device.ts`) picks `'rgba16float'` here at
   * boot when `hdrCapable` permits it — the browser's preferred format is
   * always an 8-bit fixed-point format, so the extended-range swap chain has
   * to ask for the float format directly.
   */
  format: GPUTextureFormat;

  /** The HTML canvas element — needed by `resizeCanvasToDisplay` and for layout reads. */
  canvas: HTMLCanvasElement;

  /**
   * HDR-output spike: true when the display + `?hdr` URL flag combination
   * that `initGpu` (`device.ts`) evaluates at boot permits the extended-range
   * surface — false on every default page load, and false on a non-HDR
   * display even with `?hdr` set. NOT whether the swap chain currently is
   * that surface: that's a separate, derived question — see `hdrActiveOf`.
   */
  readonly hdrCapable: boolean;
};
