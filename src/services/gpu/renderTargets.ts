/**
 * renderTargets — the single owner of every offscreen render target's
 * lifecycle, driven by the `RenderTargetSpec` table.
 *
 * An offscreen target is a ROW (`id`, `format`, `depth`, `scale`), and this
 * module allocates, reconciles, and releases every row uniformly — a new
 * offscreen (a pick target, a foreground slab) is a new row, not a new
 * module + handle + resize call, and the frame loop never has to enumerate
 * targets by hand.
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
 * layer's dither-frequency viewport) read it via `sizeOf`, so the two sites
 * cannot drift.
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
 * ### Why the mw-aggregate row renders at reduced resolution
 *
 * The Milky Way cloud stands in for ~1e11 stars with a budget in the hundreds
 * of thousands, so at any framing where the disc covers real screen area the
 * sprites are sub-pixel and the field reads as discrete particles rather than
 * as a galaxy. The only cure is more overlap per pixel — bigger, softer, fewer
 * sprites — and measurement says that wall is FILL, not vertex count: at ~5x
 * the baseline sprite area the frame rate collapses while the instance count is
 * going DOWN.
 *
 * That is the same shape the `star-aggregates` row exists for, and the same
 * remedy applies: a smooth summed-glow field is low-frequency, so rendering it
 * at 1/scale and bilinearly upsampling is visually free while the fragment cost
 * drops by the square of the divisor. The DUST pass stays full-res in HDR — its
 * multiplicative transmittance has to land on the real cosmological
 * accumulation, and it is not the fill-bound half.
 *
 * This is the one row whose divisor is NOT a constant here: its `scale` is a
 * function of the live `settings.milkyWay.aggregateDivisor`, resolved afresh by
 * every `reconcile`. The divisor trades against the star shader's `starPxMin` /
 * `starPxMax` clamps, stated in TARGET pixels and already live sliders, so the
 * three move together against a moving frame. No 'last applied' record exists
 * anywhere: the allocated texture size (`sizeOf`) is the record of the size in
 * force, and `reconcile` compares against it.
 *
 * ### Why the zone-of-avoidance row renders at 1/5 scale
 *
 * The band is a fullscreen 32-step ray march — the heaviest per-pixel
 * additive overlay after the scalar-volume raymarch, too costly to run at
 * full res. Same remedy as `volume` /
 * `star-aggregates` / `mw-aggregate`: the band is smooth low-frequency haze
 * with no high-frequency detail, so a 1/5-res raymarch bilinearly upsampled
 * into HDR is visually free while dropping fragment cost by the square of
 * the divisor (5 → 1/25th). The curved "Zone of Avoidance" lettering does
 * NOT ride this row — MSDF text needs crisp edges at any zoom, so it draws
 * straight into full-res HDR from the upsample layer, after the band
 * composites in. Clears to a=0 for the same additive-identity reason as its
 * three siblings.
 *
 * ### Why the foreground row carries a depth texture
 *
 * `foreground:0` is the first row to declare `depth`. The foreground pass
 * draws OPAQUE geometry (Earth, Moon, Sun) that must occlude the background
 * by depth-test, and WebGPU runs a depth-test only against a bound depth
 * attachment — so a row that declares depth gets a second texture allocated
 * and resized in lockstep with its colour texture. The depth texture carries
 * ONLY `RENDER_ATTACHMENT` (it feeds the depth-test as the pass draws) —
 * nothing samples it downstream: each painter-chain row clears its own depth
 * (spec §7.3), so the buffer only ever holds the LAST row's value and can't
 * back a cross-row occlusion test. The caption occlusion pass
 * (`foregroundLabelsLayer` and the other overlay layers, via
 * `lib/sceneDepth.wesl`) instead reads the COLOUR texture's alpha, which
 * accumulates across rows under OVER compositing. It renders at full
 * resolution (`scale: 1`) because opaque geometry has hard edges that the
 * bilinear upsample used for the low-frequency volume row would smear — and
 * full-res is also what lets a swap-pass fragment index the colour texel 1:1
 * (spec invariant: `foreground:0` and `swap` both render at `scale: 1`).
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

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { RenderTargets } from '../../@types/rendering/RenderTargets';
import type { RenderTargetSpec } from '../../@types/engine/frame/RenderTargetSpec';
import type { Size } from '../../@types/rendering/Size';
import { BLOOM_LEVELS, bloomScale } from '../../data/bloomConstants';
import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../data/renderTargetFormats';
import { reducedTargetSize } from '../../utils/gpu/reducedTargetSize';

/**
 * Downsample divisor for the half-res `star-aggregates` row — total fragment
 * reduction is its square (2 → 1/4 the fragments). Named here beside the
 * target table (the volume row's divisor is inline `scale: 3`) so raising it
 * to 4 to shed more fill is a one-line change.
 */
const STAR_AGGREGATE_DIVISOR = 2;

/**
 * Downsample divisor for the reduced-res `zoa` row — total fragment
 * reduction is its square (5 → 1/25th the fragments). Named here for the
 * same one-line-change reason as `STAR_AGGREGATE_DIVISOR`.
 */
const ZONE_OF_AVOIDANCE_DIVISOR = 5;

/** A row's divisor for this state — constant rows ignore the state entirely. */
function resolveScale(spec: RenderTargetSpec, state: EngineState): number {
  return typeof spec.scale === 'function' ? spec.scale(state) : spec.scale;
}

/**
 * The declared render-target table for this frame configuration. A function
 * (not a module constant) because the swap row's format is runtime-decided —
 * the live swap-chain format (`bgra8unorm` on macOS, `rgba8unorm` elsewhere).
 * Rows per the renderer-unification design's concrete target table; the pick
 * rows arrive in a later plan phase. Exported so `targetParity.test.ts` can
 * cross-check its ids against `CONTENT_LAYERS` and `frameProgram` without a
 * GPU device — see that file's header for why those checks matter.
 */
export function renderTargetRows(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[] {
  return [
    // hdr and swap clear opaque black (a=1); every other row clears to a=0 so
    // its upsample/composite adds nothing for a fragment it didn't reach —
    // WebGPU defaults an omitted clearValue to {0,0,0,0}, so dropping either
    // a=1 row here would be a silent visual change.
    {
      id: 'hdr',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: 1,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    },
    // Half-res additive raymarch starts from zero coverage.
    {
      id: 'volume',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: 3,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // Zone-of-avoidance band raymarch — same reason as `volume`.
    {
      id: 'zoa',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: ZONE_OF_AVOIDANCE_DIVISOR,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // Same reason as `volume`.
    {
      id: 'star-aggregates',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: STAR_AGGREGATE_DIVISOR,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // Same reason as `volume` and `star-aggregates`: the Milky Way's star
    // billboards draw additively into this row.
    {
      id: 'mw-aggregate',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: (state) => state.settings.milkyWay.aggregateDivisor,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // Transparent (a=0) so the later OVER composite leaves every pixel the
    // foreground did not draw unchanged — an empty foreground frame
    // composites to a no-op rather than a black wash over the background.
    {
      id: 'foreground:0',
      format: HDR_TARGET_FORMAT,
      depth: FOREGROUND_DEPTH_FORMAT,
      scale: 1,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
    },
    // Bloom mip pyramid: an ever-wider glow. rgba16float mirrors the HDR
    // precision so the additive fold keeps its dynamic range. No depth: these
    // are fullscreen post passes, not depth-tested geometry. The depth, the
    // per-level divisor, AND the clear (a=0 — the pyramid accumulates
    // additively, so an untouched texel must contribute nothing) all come
    // from `bloomConstants`/this one generator so a pyramid level can never
    // fall out of step with its row. bloom0 keeps a=0 too even though the
    // bright pass overwrites it outright: the upsample folds add onto
    // bloom0..3, and any level the fold doesn't cover has to start from zero
    // coverage.
    ...Array.from(
      { length: BLOOM_LEVELS },
      (_unused, n): RenderTargetSpec => ({
        id: `bloom${n}`,
        format: HDR_TARGET_FORMAT,
        depth: null,
        scale: bloomScale(n),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      }),
    ),
    // The black-hole lens's captured environment: 6 layers of a fixed-size
    // 2d-array, later bound as a `texture_cube` (see `CubeFace.d.ts`). Same
    // depthless/additive/zero-clear profile as `hdr` — the captured roster
    // (point-sprites, star-catalog/aggregates, S-star glints) is additive.
    {
      id: 'sky-cubemap',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: 1, // unused: fixedSizePx below overrides it (required by the type).
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      fixedSizePx: { size: 256, layers: 6 },
    },
    {
      id: 'swap',
      format: swapFormat,
      depth: null,
      scale: 1,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    },
  ];
}

export function createRenderTargets(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  size: Size,
  state: EngineState,
  // Test-only injection seam: appends rows the production table
  // (`renderTargetRows`) doesn't declare yet, so `fixedSizePx` behaviour is
  // exercisable before Phase B lands the real sky-cubemap row. No production
  // caller passes this.
  extraRows: readonly RenderTargetSpec[] = [],
): RenderTargets {
  // `let`, not `const`: setSwapFormat below replaces this array wholesale
  // rather than mutating a row in place (house preference for immutability).
  let specs = [...renderTargetRows(swapFormat), ...extraRows];
  // Only offscreen rows get textures — the swap row is executor-resolved
  // from the acquired frame view (see the module header). Computed once:
  // setSwapFormat never touches an offscreen row, so this stays valid.
  const offscreenSpecs = specs.filter((s) => s.id !== 'swap');

  // Per-row allocation state, keyed by spec id. `destroy()` clears every map
  // so a stale `viewOf` / `depthViewOf` fails loudly instead of handing back a
  // destroyed view. Depth textures live in their own maps because only the
  // rows that declare `depth` have them — an absent key IS "this row has no
  // depth attachment", which is exactly what `depthViewOf` throws on.
  const textures = new Map<string, GPUTexture>();
  const views = new Map<string, GPUTextureView>();
  // A dimension:'cube' view alongside `views`' default (2d-array) one, for the
  // one row whose 6 layers are later sampled as a `texture_cube` (see
  // `RenderTargets.cubeViewOf`'s doc). Keyed off `fixedSizePx.layers === 6`
  // (data-driven, not a hardcoded 'sky-cubemap' id check) so a future second
  // 6-layer row gets one for free.
  const cubeViews = new Map<string, GPUTextureView>();
  const depthTextures = new Map<string, GPUTexture>();
  const depthViews = new Map<string, GPUTextureView>();
  // Recorded beside `textures`/`views` so `sizeOf` never reads a texture's
  // width directly — test doubles for `RenderTargets` stub textures without
  // real dimensions (see `renderTargets.test.ts`'s `mockDevice`).
  const sizes = new Map<string, Size>();

  function allocate(spec: RenderTargetSpec, width: number, height: number): void {
    sizes.set(spec.id, { width, height });

    textures.get(spec.id)?.destroy();
    const texture = device.createTexture({
      label: `render-target-${spec.id}`,
      format: spec.format,
      // 'dimension: 2d' is WebGPU's default, but stated explicitly so a
      // `fixedSizePx.layers > 1` row (a 2d-array texture, e.g. the sky
      // cubemap's 6 faces) reads unambiguously beside `depthOrArrayLayers`.
      dimension: '2d',
      size: { width, height, depthOrArrayLayers: spec.fixedSizePx?.layers ?? 1 },
      // RENDER_ATTACHMENT lets the content layers' pipelines write into the
      // target; TEXTURE_BINDING lets the compositor / upsample fragment
      // shaders sample from it — for 'foreground:0' this is ALSO what the
      // caption occlusion pass reads (its alpha, via lib/sceneDepth.wesl).
      // Both usage flags are required on the same texture — WebGPU
      // descriptors don't support re-tagging after creation.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    textures.set(spec.id, texture);
    views.set(spec.id, texture.createView());
    if (spec.fixedSizePx?.layers === 6) {
      cubeViews.set(
        spec.id,
        texture.createView({
          label: `render-target-${spec.id}-cube-view`,
          dimension: 'cube',
          baseArrayLayer: 0,
          arrayLayerCount: 6,
        }),
      );
    }

    if (spec.depth) {
      depthTextures.get(spec.id)?.destroy();
      const depthTexture = device.createTexture({
        label: `render-target-${spec.id}-depth`,
        format: spec.depth,
        dimension: '2d',
        size: { width, height, depthOrArrayLayers: spec.fixedSizePx?.layers ?? 1 },
        // RENDER_ATTACHMENT only: this feeds the depth-test while the
        // foreground pass draws opaque geometry, and nothing samples it
        // downstream any more. The caption occlusion pass (lib/sceneDepth.wesl)
        // reads the COLOUR texture's alpha instead (see the colour texture's
        // own TEXTURE_BINDING comment above) — each painter-chain row clears
        // its own depth (spec §7.3), so the depth buffer only ever holds the
        // LAST row's value and can't back a coverage test.
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      depthTextures.set(spec.id, depthTexture);
      depthViews.set(spec.id, depthTexture.createView());
    }
  }

  // Keyed on the size the row was allocated at, never on a remembered divisor:
  // the texture is the authoritative record of what it was built at, so a canvas
  // resize and a settings-driven divisor move reduce to one question. Two
  // divisors that floor to the same pixels genuinely need no reallocation — the
  // surviving texture is the one every consumer's `viewOf` already resolves.
  // (`reducedTargetSize` is the shared sizing rule; see its docblock.)
  function reconcile(s: EngineState, canvas: Size): void {
    for (const spec of offscreenSpecs) {
      // A fixed-size row is a size that never changes across resizes, not a
      // separate code path past this one branch: the held-size comparison
      // and `allocate` call below stay shared with every other row.
      const [width, height] = spec.fixedSizePx
        ? [spec.fixedSizePx.size, spec.fixedSizePx.size]
        : reducedTargetSize(canvas.width, canvas.height, resolveScale(spec, s));
      const held = sizes.get(spec.id);
      if (held !== undefined && held.width === width && held.height === height) continue;
      allocate(spec, width, height);
    }
  }

  // Boot takes the same path a frame does: nothing is allocated yet, so every
  // offscreen row misses and gets its first texture.
  reconcile(state, size);

  return {
    // A getter, not a captured value: setSwapFormat reassigns `specs`, and
    // callers must observe the replacement through the same handle.
    get specs() {
      return specs;
    },
    specOf(id: string): RenderTargetSpec {
      const spec = specs.find((s) => s.id === id);
      if (!spec) {
        throw new Error(`renderTargets: no spec row for target '${id}'`);
      }
      return spec;
    },
    sizeOf(id: string): Size {
      const size = sizes.get(id);
      if (!size) {
        // Covers 'swap' (no allocated texture), unknown ids, and
        // use-after-destroy — the same loud-failure discipline as `viewOf`.
        throw new Error(`renderTargets: no allocated size for target '${id}'`);
      }
      return size;
    },
    viewOf(id: string): GPUTextureView {
      const view = views.get(id);
      if (!view) {
        // Covers 'swap' (per-frame, executor-resolved), unknown ids, and
        // use-after-destroy — all wiring bugs, all loud.
        throw new Error(`renderTargets: no allocated view for target '${id}'`);
      }
      return view;
    },
    cubeViewOf(id: string): GPUTextureView {
      const view = cubeViews.get(id);
      if (!view) {
        // Covers a row with < 6 layers, 'swap', unknown ids, and
        // use-after-destroy — same loud-failure discipline as `viewOf`.
        throw new Error(`renderTargets: no cube view for target '${id}'`);
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
    reconcile,
    setSwapFormat(next: GPUTextureFormat): void {
      specs = specs.map((s) => (s.id === 'swap' ? { ...s, format: next } : s));
    },
    destroy(): void {
      for (const texture of textures.values()) texture.destroy();
      for (const texture of depthTextures.values()) texture.destroy();
      textures.clear();
      views.clear();
      cubeViews.clear();
      depthTextures.clear();
      depthViews.clear();
      sizes.clear();
    },
  };
}
