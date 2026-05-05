/**
 * hdrTarget — owns the rgba16float offscreen colour texture AND the
 * companion depth buffer that every visible draw pass renders into
 * instead of the swap-chain.
 *
 * ### Why a dedicated module
 *
 * The HDR target's lifetime is "as long as the canvas size is constant" —
 * it gets thrown away and recreated on resize.  Keeping that lifecycle
 * outside the renderer classes (which own pipelines, vertex buffers, and
 * other long-lived resources) avoids tangling re-creation paths.  The
 * engine's resize handler calls `target.resize(...)` once per resize and
 * the new views propagate through the per-frame `draw(...)` calls.
 *
 * ### Why rgba16float and not rgba32float
 *
 * 16-bit half-float is the WebGPU minimum for sampleable + renderable
 * floating-point textures; 32-bit float requires the `float32-filterable`
 * feature on most platforms.  Half-float gives us ~5 decimal digits of
 * precision and a range of ±65 504, which is more than enough for our
 * additive billboard math (per-fragment alpha contributions in [0, 1],
 * accumulating to peaks of maybe a few hundred in the densest cluster
 * cores before tone-mapping).
 *
 * ### Why TEXTURE_BINDING + RENDER_ATTACHMENT
 *
 * RENDER_ATTACHMENT lets the points/quads/disks pipelines write into it.
 * TEXTURE_BINDING lets the tone-map fragment shader sample from it.
 * Both flags are required on the same texture — they're set as a bitmask
 * because WebGPU descriptors don't support "sample-or-render" tagging
 * after creation.
 *
 * ### Why a depth buffer at all
 *
 * The original v1 of this module didn't have one — every pass blended
 * additively / OVER and the order of draws determined stacking.  That
 * works for an emissive star field, but it breaks down once an
 * EMISSIVE BACKDROP (the procedural Milky Way impostor at the world
 * origin) competes with PER-GALAXY OVERLAYS (textured-thumbnail quads
 * and procedural-disk impostors at galactic positions).  Without a
 * depth test, a thumbnail drawn after the impostor always blots over
 * it — including thumbnails for galaxies on the FAR side of the world
 * origin, which physically should be occluded by the Milky Way.
 *
 * The fix is the standard "transparent emissive reads but doesn't write
 * depth, opaque-ish overlays write depth" pattern:
 *
 *   - thumbnail / disk pipelines: depthCompare=less, depthWriteEnabled=true
 *   - milky-way / points pipelines: depthCompare=less, depthWriteEnabled=false
 *
 * combined with a draw order of `points → thumbnails → milky way` so
 * the milky-way pass tests against thumbnail-written depths and gets
 * correctly occluded by any thumbnail in front of the world origin
 * (while passing through where no thumbnail covers it).
 *
 * `depth24plus` is the canonical "give me a depth buffer that just
 * works everywhere" format — a 24-bit fixed-point depth, no stencil,
 * and the WebGPU spec guarantees support on every implementation.
 * 32-bit-float depth would buy us more precision near the far plane
 * but isn't necessary at our world scale (few hundred Mpc, near plane
 * 0.001 Mpc) and would invite an unnecessary feature dependency.
 */

export type Size = { readonly width: number; readonly height: number };

export type HdrTarget = {
  /** Current colour-attachment view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /**
   * Current depth-attachment view, stable until the next `resize()` call.
   * Pipelines that draw into the HDR pass must declare a depthStencil
   * state with format `depth24plus` (the format this view exposes).
   */
  readonly depthView: GPUTextureView;
  /** Recreate the underlying textures at a new size. Old views become invalid. */
  resize(size: Size): void;
  /** Tear down — call on engine destroy. */
  destroy(): void;
};

export function createHdrTarget(device: GPUDevice, size: Size): HdrTarget {
  let colorTexture: GPUTexture | null = null;
  let colorView: GPUTextureView | null = null;
  let depthTexture: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;

  function allocate(s: Size): void {
    if (colorTexture) colorTexture.destroy();
    if (depthTexture) depthTexture.destroy();
    colorTexture = device.createTexture({
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    colorView = colorTexture.createView();
    // Depth target.  No TEXTURE_BINDING — the tone-map pass only
    // samples the colour texture; nothing reads the depth buffer
    // outside the HDR render pass itself.  Keeping the usage bitmask
    // minimal lets the implementation pick the most efficient memory
    // layout (compressed depth tile storage on tile-based GPUs).
    depthTexture = device.createTexture({
      format: 'depth24plus',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthView = depthTexture.createView();
  }

  allocate(size);

  return {
    get view(): GPUTextureView {
      if (!colorView) throw new Error('hdrTarget: view accessed after destroy');
      return colorView;
    },
    get depthView(): GPUTextureView {
      if (!depthView) throw new Error('hdrTarget: depthView accessed after destroy');
      return depthView;
    },
    resize(s: Size): void {
      allocate(s);
    },
    destroy(): void {
      if (colorTexture) colorTexture.destroy();
      if (depthTexture) depthTexture.destroy();
      colorTexture = null;
      colorView = null;
      depthTexture = null;
      depthView = null;
    },
  };
}
