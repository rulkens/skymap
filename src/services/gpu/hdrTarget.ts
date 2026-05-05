/**
 * hdrTarget — owns the rgba16float offscreen colour texture that every
 * visible draw pass renders into instead of the swap-chain.
 *
 * ### Why a dedicated module
 *
 * The HDR target's lifetime is "as long as the canvas size is constant" —
 * it gets thrown away and recreated on resize.  Keeping that lifecycle
 * outside the renderer classes (which own pipelines, vertex buffers, and
 * other long-lived resources) avoids tangling re-creation paths.  The
 * engine's resize handler calls `target.resize(...)` once per resize and
 * the new view propagates through the per-frame `draw(...)` calls.
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
 * ### Why no depth attachment
 *
 * An earlier revision (commit `716eb6b`) added a `depth24plus` companion
 * texture so the Milky Way impostor could be occluded by per-galaxy
 * thumbnail / disk overlays via depth-test.  Commit `28aced5` then
 * switched every overlay pipeline to pure additive blending
 * (`srcFactor: 'one', dstFactor: 'one'`) with `depthWriteEnabled: false`,
 * which makes ordering moot: A+B = B+A, so no occlusion is needed.  At
 * that point the depth buffer became dead infrastructure — every frame
 * cleared it to 1.0 and nothing ever wrote a different value.  Removed
 * the attachment to drop the per-frame clear, the GPU memory, and the
 * cross-cutting "every pipeline must declare matching depthStencil
 * state" constraint that already bit us once during HMR.  If a future
 * pass needs depth (e.g. a truly opaque overlay), it can be added back
 * at that point.
 */

export type Size = { readonly width: number; readonly height: number };

export type HdrTarget = {
  /** Current colour-attachment view, stable until the next `resize()` call. */
  readonly view: GPUTextureView;
  /** Recreate the underlying texture at a new size. Old view becomes invalid. */
  resize(size: Size): void;
  /** Tear down — call on engine destroy. */
  destroy(): void;
};

export function createHdrTarget(device: GPUDevice, size: Size): HdrTarget {
  let colorTexture: GPUTexture | null = null;
  let colorView: GPUTextureView | null = null;

  function allocate(s: Size): void {
    if (colorTexture) colorTexture.destroy();
    colorTexture = device.createTexture({
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    colorView = colorTexture.createView();
  }

  allocate(size);

  return {
    get view(): GPUTextureView {
      if (!colorView) throw new Error('hdrTarget: view accessed after destroy');
      return colorView;
    },
    resize(s: Size): void {
      allocate(s);
    },
    destroy(): void {
      if (colorTexture) colorTexture.destroy();
      colorTexture = null;
      colorView = null;
    },
  };
}
