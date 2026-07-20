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
 * ### Why the star-aggregate row renders at half scale
 *
 * The survey (Gaia bin) star pass splits into two streams. Leaf stars (real
 * point-source dots, ~1.5 px) stay full-resolution in the HDR accumulation.
 * The AGGREGATE stream — interior octree nodes whose glow fills the box
 * footprint × the glow-overlap spread — is the fill-bound half: measured at
 * tens-to-hundreds of full screens of additive overdraw at kpc-scale zoom.
 * That glow field is low-frequency (a smooth summed-flux haze, not sharp
 * dots), so rendering it into a half-res target and bilinearly upsampling is
 * invisible while quartering its fragment cost. The `star-aggregates` row
 * matches the HDR precision (rgba16float) so the additive flux sum keeps its
 * dynamic range across the upsample. Its `scale` is the downsample divisor —
 * total fragment reduction is its square (2 → 1/4 the fragments). Like the
 * volume row it clears to a=0 so the composite's additive blend adds nothing
 * for fragments the aggregates didn't reach. Unlike the volume row, the
 * upsample composite is NOT a plain blit: it re-applies the star pass's
 * hue-preserving knee to the SUMMED aggregate field (the offscreen alpha
 * carries the pre-knee scalar), fixing the LOD compression asymmetry between
 * a concentrated bright leaf and a stack of sub-knee aggregate quads.
 *
 * ### Why the foreground row carries a depth texture
 *
 * `foreground:0` is the first row to declare `depth`. The foreground pass
 * draws OPAQUE geometry (Earth, Moon, Sun) that must occlude the background
 * by depth-test, and WebGPU runs a depth-test only against a bound depth
 * attachment — so a row that declares depth gets a second texture allocated
 * and resized in lockstep with its colour texture. The depth texture carries
 * `RENDER_ATTACHMENT` (it feeds the depth-test as the pass draws) AND
 * `TEXTURE_BINDING`, because it is ALSO sampled downstream: the near-field
 * caption occlusion pass (`foregroundLabelsLayer`, via `lib/sceneDepth.wesl`)
 * reads this depth to hide a planet's name behind a nearer body. It renders
 * at full resolution (`scale: 1`) because opaque geometry has hard edges that
 * the bilinear upsample used for the low-frequency volume row would smear —
 * and full-res is also what lets a swap-pass fragment index the depth texel
 * 1:1 (spec invariant: `foreground:0` and `swap` both render at `scale: 1`).
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
 * `foreground:0` clears transparent (a=0) so the later OVER composite leaves
 * every pixel the foreground did not draw unchanged — an empty foreground
 * frame composites to a no-op rather than a black wash over the background.
 * `star-aggregates` clears to a=0 for the same reason `volume` does — its
 * upsample composite adds nothing where no aggregate glow landed.
 *
 * The paired depth clear (`1.0`, the far plane) is NOT table data here — it
 * is the same constant for every depth-bearing row, so the executor supplies
 * it inline when it opens the pass. See `executeFrame`.
 */
export const TARGET_CLEAR_VALUES: Readonly<Record<string, GPUColor>> = {
  hdr: { r: 0, g: 0, b: 0, a: 1 },
  volume: { r: 0, g: 0, b: 0, a: 0 },
  'star-aggregates': { r: 0, g: 0, b: 0, a: 0 },
  'foreground:0': { r: 0, g: 0, b: 0, a: 0 },
  swap: { r: 0, g: 0, b: 0, a: 1 },
};

/**
 * Downsample divisor for the half-res `star-aggregates` row — total fragment
 * reduction is its square (2 → 1/4 the fragments). Named here beside the
 * target table (the volume row's divisor is inline `scale: 3`) so raising it
 * to 4 to shed more fill is a one-line change.
 */
const STAR_AGGREGATE_DIVISOR = 2;

/**
 * Build the concrete target table for this frame configuration. A function
 * (not a module constant) because the swap row's format is the runtime
 * swap-chain format (`bgra8unorm` on macOS, `rgba8unorm` elsewhere).
 * Rows per the renderer-unification design's concrete target table; the
 * pick rows arrive in a later plan phase.
 */
function buildSpecs(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[] {
  return [
    { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
    { id: 'volume', format: 'rgba16float', depth: null, scale: 3 },
    { id: 'star-aggregates', format: 'rgba16float', depth: null, scale: STAR_AGGREGATE_DIVISOR },
    { id: 'foreground:0', format: 'rgba16float', depth: 'depth32float', scale: 1 },
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

  // Per-row allocation state, keyed by spec id. `destroy()` clears every map
  // so a stale `viewOf` / `depthViewOf` fails loudly instead of handing back a
  // destroyed view. Depth textures live in their own maps because only the
  // rows that declare `depth` have them — an absent key IS "this row has no
  // depth attachment", which is exactly what `depthViewOf` throws on.
  const textures = new Map<string, GPUTexture>();
  const views = new Map<string, GPUTextureView>();
  const depthTextures = new Map<string, GPUTexture>();
  const depthViews = new Map<string, GPUTextureView>();

  function allocate(spec: RenderTargetSpec, s: Size): void {
    // floor(size / scale), min 1 px — see the module header on why floor
    // (upsample uv semantics) and why the clamp (0 is an illegal texture
    // dimension on tiny canvases). The depth texture, when present, shares
    // these dimensions exactly so its samples line up with the colour target.
    const width = Math.max(1, Math.floor(s.width / spec.scale));
    const height = Math.max(1, Math.floor(s.height / spec.scale));

    textures.get(spec.id)?.destroy();
    const texture = device.createTexture({
      label: `render-target-${spec.id}`,
      format: spec.format,
      size: { width, height },
      // RENDER_ATTACHMENT lets the content layers' pipelines write into the
      // target; TEXTURE_BINDING lets the compositor / upsample fragment
      // shaders sample from it. Both are required on the same texture —
      // WebGPU descriptors don't support re-tagging after creation.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    textures.set(spec.id, texture);
    views.set(spec.id, texture.createView());

    if (spec.depth) {
      depthTextures.get(spec.id)?.destroy();
      const depthTexture = device.createTexture({
        label: `render-target-${spec.id}-depth`,
        format: spec.depth,
        size: { width, height },
        // Both flags: RENDER_ATTACHMENT feeds the depth-test while the
        // foreground pass draws opaque geometry; TEXTURE_BINDING lets the
        // near-field caption occlusion fragment shaders sample this same depth
        // afterwards (via lib/sceneDepth.wesl) to hide captions behind nearer
        // bodies. WebGPU descriptors can't re-tag usage after creation, so a
        // texture that is later sampled must be born with TEXTURE_BINDING.
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      depthTextures.set(spec.id, depthTexture);
      depthViews.set(spec.id, depthTexture.createView());
    }
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
    depthViewOf(id: string): GPUTextureView {
      const view = depthViews.get(id);
      if (!view) {
        // Covers depthless rows ('hdr', 'volume', 'swap'), unknown ids, and
        // use-after-destroy — an absent depth view is either "this row
        // declares no depth" or a wiring bug, both loud.
        throw new Error(`renderTargets: no depth view for target '${id}'`);
      }
      return view;
    },
    resize(s: Size): void {
      for (const spec of offscreenSpecs) allocate(spec, s);
    },
    destroy(): void {
      for (const texture of textures.values()) texture.destroy();
      for (const texture of depthTextures.values()) texture.destroy();
      textures.clear();
      views.clear();
      depthTextures.clear();
      depthViews.clear();
    },
  };
}
