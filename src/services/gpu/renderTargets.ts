/**
 * renderTargets — the single owner of every offscreen render target's
 * lifecycle, driven by the `RenderTargetSpec` table.
 *
 * Pre-unification the HDR target lived in `postProcess.ts` and the half-res
 * volume target in `volumeOffscreen.ts` — two modules with identical
 * construct / resize / destroy shapes, two `state.gpu.*` fields that always
 * flipped together, and a frame resize handler that enumerated the pair by
 * hand. The target table collapses that: an offscreen target is a ROW
 * (`id`, `format`, `depth`, `scale`), and this module allocates, resizes,
 * and releases every row uniformly. A new offscreen (a pick target, a
 * foreground slab) is a new row, not a new module + handle + resize call.
 *
 * ### Why the HDR offscreen exists at all
 *
 * Every visible draw pass (points, quads, disks, filaments) writes into a
 * shared viewport-sized rgba16float texture instead of the swap chain, with
 * additive blending; the frame's `hdr→swap` composite then tone-maps the
 * accumulated linear-light values into the presented frame. Tone-mapping is
 * non-linear (`tonemap(a + b) ≠ tonemap(a) + tonemap(b)`), so contributions
 * must accumulate linearly FIRST and compress once at the end — hence an
 * intermediate HDR target rather than in-shader tone-mapping per pipeline.
 *
 * ### Why rgba16float and not rgba32float
 *
 * 16-bit half-float is the WebGPU minimum for sampleable + renderable
 * floating-point textures; 32-bit float requires the `float32-filterable`
 * feature on most platforms. Half-float gives ~5 decimal digits and a range
 * of ±65 504 — plenty for additive billboard sums peaking at a few hundred
 * in dense cluster cores. The volume row matches the HDR precision so the
 * additive field sum doesn't lose dynamic range across the upsample.
 *
 * ### Why the volume row renders at 1/3 scale
 *
 * The scalar-volume fragment shader is the heaviest per-pixel pass (192
 * raymarch steps × N active fields × every back-facing cube fragment). The
 * 3D volume texture is bandlimited and the per-fragment dither covers
 * sub-pixel aliasing, so full-res raymarching is wasted work; the upsample
 * pass bilinearly samples the small target back into HDR and the
 * interpolation is invisible for low-frequency volumetric data. The `scale`
 * field IS the downsample divisor — total fragment reduction is its square
 * (3 → 1/9th the fragments). `floor` (not `round`) matches the upsample
 * shader's sample-at-uv semantics, and the min-1-px clamp guards tiny
 * canvases where `floor(size / 3)` would yield an illegal 0-dimension
 * texture. Consumers that need "viewport == texture size" (the raymarch
 * layer's dither-frequency viewport) read the SAME `scale` off the
 * `'volume'` spec row, so the two sites cannot drift.
 *
 * ### Why the swap row has a spec but no texture
 *
 * The `swap` row completes the target table (a `ContentLayer.target` can
 * name it, and its format is the renderer-profile half of the
 * target↔pipeline invariant), but the swap chain is an ACQUIRED texture —
 * `context.getCurrentTexture()` per frame — not one this owner allocates.
 * `viewOf('swap')` therefore throws; the executor resolves swap from the
 * per-frame acquired view.
 *
 * ### Why target lifetimes live here, not inside renderers
 *
 * An offscreen's lifetime is "as long as the canvas size is constant" — it
 * is thrown away and recreated on resize. Renderers own pipelines, vertex
 * buffers, and other long-lived resources; braiding target re-creation into
 * them tangles two unrelated lifecycles. Renderers stay pure draw
 * producers whose colour attachment is provided by whoever opens the pass.
 */

import type { RenderTargets } from '../../@types/rendering/RenderTargets';
import type { RenderTargetSpec } from '../../@types/engine/frame/RenderTargetSpec';
import type { Size } from '../../@types/rendering/Size';

/**
 * Per-target first-touch clear values, consumed by the executor: the first
 * pass opened against a target in a frame clears to this colour; later
 * passes load. They live beside the target table (not on `RenderTargetSpec`
 * — that type is a locked cross-plan contract) because a clear value is a
 * property of the target, not of any layer drawing into it. `hdr` and
 * `swap` clear opaque black (a=1); `volume` clears to a=0 so the half-res
 * additive raymarch starts from zero coverage — the upsample's additive
 * blend then adds nothing for fragments the volumes didn't reach.
 */
export const TARGET_CLEAR_VALUES: Readonly<Record<string, GPUColor>> = {
  hdr: { r: 0, g: 0, b: 0, a: 1 },
  volume: { r: 0, g: 0, b: 0, a: 0 },
  swap: { r: 0, g: 0, b: 0, a: 1 },
};

/**
 * Build the concrete target table for this frame configuration. A function
 * (not a module constant) because the swap row's format is the runtime
 * swap-chain format (`bgra8unorm` on macOS, `rgba8unorm` elsewhere).
 * Rows per the renderer-unification design's concrete target table; the
 * pick + foreground rows arrive in later plan phases.
 */
function buildSpecs(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[] {
  return [
    { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
    { id: 'volume', format: 'rgba16float', depth: null, scale: 3 },
    { id: 'swap', format: swapFormat, depth: null, scale: 1 },
  ];
}

export function createRenderTargets(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  size: Size,
): RenderTargets {
  const specs = buildSpecs(swapFormat);
  // Only offscreen rows get textures — the swap row is executor-resolved
  // from the acquired frame view (see the module header).
  const offscreenSpecs = specs.filter((s) => s.id !== 'swap');

  // Per-row allocation state, keyed by spec id. `destroy()` clears both maps
  // so a stale `viewOf` fails loudly instead of handing back a destroyed view.
  const textures = new Map<string, GPUTexture>();
  const views = new Map<string, GPUTextureView>();

  function allocate(spec: RenderTargetSpec, s: Size): void {
    textures.get(spec.id)?.destroy();
    const texture = device.createTexture({
      label: `render-target-${spec.id}`,
      format: spec.format,
      size: {
        // floor(size / scale), min 1 px — see the module header on why
        // floor (upsample uv semantics) and why the clamp (0 is an illegal
        // texture dimension on tiny canvases).
        width: Math.max(1, Math.floor(s.width / spec.scale)),
        height: Math.max(1, Math.floor(s.height / spec.scale)),
      },
      // RENDER_ATTACHMENT lets the content layers' pipelines write into the
      // target; TEXTURE_BINDING lets the compositor / upsample fragment
      // shaders sample from it. Both are required on the same texture —
      // WebGPU descriptors don't support re-tagging after creation.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    textures.set(spec.id, texture);
    views.set(spec.id, texture.createView());
  }

  for (const spec of offscreenSpecs) allocate(spec, size);

  return {
    specs,
    viewOf(id: string): GPUTextureView {
      const view = views.get(id);
      if (!view) {
        // Covers 'swap' (per-frame, executor-resolved), unknown ids, and
        // use-after-destroy — all wiring bugs, all loud.
        throw new Error(`renderTargets: no allocated view for target '${id}'`);
      }
      return view;
    },
    resize(s: Size): void {
      for (const spec of offscreenSpecs) allocate(spec, s);
    },
    destroy(): void {
      for (const texture of textures.values()) texture.destroy();
      textures.clear();
      views.clear();
    },
  };
}
