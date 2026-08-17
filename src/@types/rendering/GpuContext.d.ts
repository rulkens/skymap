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
   * `initGpu` (`device.ts`) always configures `getPreferredCanvasFormat()`
   * here at boot — the extended-range `'rgba16float'` format is chosen later,
   * only if the visitor turns the Settings → Display HDR toggle on, via the
   * swap-format reconfigure (`applySwapFormat`), never at boot.
   */
  format: GPUTextureFormat;

  /** The HTML canvas element — needed by `resizeCanvasToDisplay` and for layout reads. */
  canvas: HTMLCanvasElement;

  /**
   * True when the ACTIVE display reports more than SDR range (the CSS Media
   * Queries Level 5 `dynamic-range` feature, evaluated at boot by `initGpu`
   * in `device.ts`). A status the display reports, not a choice — NOT
   * whether the swap chain currently IS the extended-range surface: that's a
   * separate, derived question — see `hdrActiveOf`. Also carried live (not
   * just this boot snapshot) on the engine slice via
   * `engineHdrCapabilityChanged`, so a later display change is observable
   * without re-reading `GpuContext`.
   */
  readonly hdrCapable: boolean;
};
