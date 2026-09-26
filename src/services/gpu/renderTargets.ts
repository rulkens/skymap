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
 * in dense cluster cores.
 *
 * ### Why the foreground row carries a depth texture
 *
 * `foreground:0` is the first row to declare `depth`. The foreground pass
 * draws OPAQUE geometry (Earth, Moon, Sun) that must occlude the background
 * by depth-test, and WebGPU runs a depth-test only against a bound depth
 * attachment — so a row that declares depth gets a second texture allocated
 * and resized in lockstep with its colour texture. The depth texture is also
 * `TEXTURE_BINDING`, so any `{ sample }` step (`executeFrame`) can bind it as
 * a texture and hand it to its passes as `view.sampledDepth` — today that is
 * `contactShadowsPass` alone, reading its OWN row's depth (it compares
 * `sampledDepth.row` against its slab before drawing): each painter-chain row
 * clears its own depth (spec §7.3), so the buffer never holds more than the
 * last-cleared row and can't back a cross-row occlusion test. The caption
 * occlusion pass
 * (`foregroundLabelsPass` and the other overlay layers, via
 * `lib/sceneDepth.wesl`) instead reads the COLOUR texture's alpha, which
 * accumulates across rows under OVER compositing. It renders at full
 * resolution (`scale: 1`) because opaque geometry has hard edges that the
 * bilinear upsample used for the low-frequency reduced-res rows would smear — and
 * full-res is also what lets a swap-pass fragment index the colour texel 1:1
 * (spec invariant: `foreground:0` and `swap` both render at `scale: 1`).
 *
 * ### Why the swap row has a spec but no texture
 *
 * The `swap` row completes the target table (a `ContentPass.target` can
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
import { DOME_FACE_COUNT } from '../../data/rendering/domeFaces';
import { HDR_TARGET_FORMAT, FOREGROUND_DEPTH_FORMAT } from '../../data/renderTargetFormats';
import { reducedTargetSize } from '../../utils/gpu/reducedTargetSize';
import { captureRowAllocateWhen } from '../../utils/gpu/captureRowAllocateWhen';
import { depthClearValueFor } from '../../utils/gpu/depthClearValueFor';

/** `farDepthView`'s placeholder texture — 1 texel is enough, every read is the same far value. */
const FAR_DEPTH_PLACEHOLDER_PX = 1;

/** A row's divisor for this state — constant rows ignore the state entirely. */
function resolveScale(spec: RenderTargetSpec, state: EngineState): number {
  return typeof spec.scale === 'function' ? spec.scale(state) : spec.scale;
}

/**
 * A `fixedSizePx` row's declared per-axis size for this state — mirrors
 * `resolveScale`.
 */
function resolveFixedSize(
  fixedSizePx: { size: number | ((state: EngineState) => number) },
  state: EngineState,
): number {
  return typeof fixedSizePx.size === 'function' ? fixedSizePx.size(state) : fixedSizePx.size;
}

/**
 * The declared render-target table for this frame configuration. A function
 * (not a module constant) because the swap row's format is runtime-decided —
 * the live swap-chain format (`bgra8unorm` on macOS, `rgba8unorm` elsewhere).
 * Rows per the renderer-unification design's concrete target table; the pick
 * rows arrive in a later plan phase. Exported so the boot check
 * (`checkFrameOrder`) and its test can cross-check `FRAME_ORDER`'s target
 * strings against the declared ids without a GPU device.
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
    // The sky a reflection probe is captured over, on the same lazy terms as
    // the blackHoles Layer's `sky-cubemap`: 6 layers, held only while the
    // camera is inside the solar system. A fixed size, not a live knob: only
    // the probe capture samples it.
    {
      id: 'solar-system-sky',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: 1, // unused: fixedSizePx below overrides it (required by the type).
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      allocateWhen: captureRowAllocateWhen('solarSystem'),
      layers: 6,
      fixedSizePx: { size: 256 },
    },
    // The fisheye's five cube-adjacent faces (front/left/right/back/top), one
    // canvas-sized 2d-array layer each — a normal render target that happens
    // to carry `layers`, not a `fixedSizePx` row: the dome image IS the
    // canvas size. 5 × N² × 8 B is 671 MB at 4096², hence `allocateWhen`
    // gates it to the dome rig alone.
    {
      id: 'dome-cube',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: 1,
      layers: DOME_FACE_COUNT,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      allocateWhen: (state) => state.viewRig === 'dome',
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
  rows: readonly RenderTargetSpec[],
  size: Size,
  state: EngineState,
): RenderTargets {
  // `let`, not `const`: setSwapFormat below replaces this array wholesale
  // rather than mutating a row in place (house preference for immutability).
  let specs = [...rows];
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
  // A dimension:'cube' view alongside `views`' default (2d-array) one, for a
  // row whose 6 layers are later sampled as a `texture_cube` (see
  // `RenderTargets.cubeViewOf`'s doc). Keyed off `fixedSizePx.layers === 6`
  // (data-driven, not a hardcoded id check) so every 6-layer row gets one.
  const cubeViews = new Map<string, GPUTextureView>();
  // One single-array-layer `dimension: '2d'` view per layer, for a row whose
  // `views`' default (a whole-array `2d-array` view with no `baseArrayLayer`)
  // is unusable as a COLOUR ATTACHMENT when the row has more than one layer —
  // WebGPU rejects a multi-layer view there. The capture rows need this
  // (`executeFrame`'s per-face colour attachment), gated the same data-driven
  // way as `cubeViews` rather than a hardcoded id check.
  const layerViews = new Map<string, readonly GPUTextureView[]>();
  const depthTextures = new Map<string, GPUTexture>();
  const depthViews = new Map<string, GPUTextureView>();
  // Recorded beside `textures`/`views` so `sizeOf` never reads a texture's
  // width directly — test doubles for `RenderTargets` stub textures without
  // real dimensions (see `renderTargets.test.ts`'s `mockDevice`).
  const sizes = new Map<string, Size>();

  // A `{ sample }` step's stand-in when nothing has cleared its source yet
  // this frame — outside the spec table (no `reconcile` entry, no resize) so
  // its identity is good for the owner's whole lifetime. Cleared here, once,
  // via its own encoder: no `FrameStep` exists yet to carry that clear.
  const farDepthTexture = device.createTexture({
    label: 'render-target-far-depth-placeholder',
    format: FOREGROUND_DEPTH_FORMAT,
    dimension: '2d',
    size: {
      width: FAR_DEPTH_PLACEHOLDER_PX,
      height: FAR_DEPTH_PLACEHOLDER_PX,
      depthOrArrayLayers: 1,
    },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const farDepthTextureView = farDepthTexture.createView();
  {
    const clearEncoder = device.createCommandEncoder();
    clearEncoder
      .beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: {
          view: farDepthTextureView,
          depthClearValue: depthClearValueFor(true),
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      })
      .end();
    device.queue.submit([clearEncoder.finish()]);
  }

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
      size: { width, height, depthOrArrayLayers: spec.layers ?? 1 },
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
    if (spec.layers === 6) {
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
    const layerCount = spec.layers ?? 1;
    if (layerCount > 1) {
      layerViews.set(
        spec.id,
        Array.from({ length: layerCount }, (_unused, layer) =>
          texture.createView({
            label: `render-target-${spec.id}-layer${layer}-view`,
            dimension: '2d',
            baseArrayLayer: layer,
            arrayLayerCount: 1,
          }),
        ),
      );
    }

    if (spec.depth) {
      depthTextures.get(spec.id)?.destroy();
      const depthTexture = device.createTexture({
        label: `render-target-${spec.id}-depth`,
        format: spec.depth,
        dimension: '2d',
        size: { width, height, depthOrArrayLayers: spec.layers ?? 1 },
        // Each painter-chain row clears its own depth (spec §7.3), so this
        // buffer only ever holds the LAST row's value — which is why the
        // caption occlusion pass (lib/sceneDepth.wesl) reads the COLOUR
        // texture's alpha instead (see the colour texture's own
        // TEXTURE_BINDING comment above), and why any sampler bound to this
        // texture can only ever be asking about that last row.
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      depthTextures.set(spec.id, depthTexture);
      depthViews.set(spec.id, depthTexture.createView());
    }
  }

  /**
   * Drop one row's textures + views. Every map is cleared together with the
   * size record, so the row misses the held-size comparison on the frame its
   * `allocateWhen` turns true again and reallocates through the normal path.
   */
  function release(id: string): void {
    if (!textures.has(id) && !depthTextures.has(id)) return;
    textures.get(id)?.destroy();
    depthTextures.get(id)?.destroy();
    textures.delete(id);
    views.delete(id);
    cubeViews.delete(id);
    layerViews.delete(id);
    depthTextures.delete(id);
    depthViews.delete(id);
    sizes.delete(id);
  }

  // Keyed on the size the row was allocated at, never on a remembered divisor:
  // the texture is the authoritative record of what it was built at, so a canvas
  // resize and a settings-driven divisor move reduce to one question. Two
  // divisors that floor to the same pixels genuinely need no reallocation — the
  // surviving texture is the one every consumer's `viewOf` already resolves.
  // (`reducedTargetSize` is the shared sizing rule; see its docblock.)
  function reconcile(s: EngineState, canvas: Size): void {
    for (const spec of offscreenSpecs) {
      // A row that declares `allocateWhen` holds VRAM only while its
      // condition does — same per-frame seam as a moved size, so entering
      // and leaving the condition need no lifecycle path of their own.
      // `sizes.has` (not `textures.has`) is the "currently allocated" signal
      // a hysteresis predicate needs — it's cleared by `release` in lockstep
      // with the texture, so a row can't observe itself as allocated the
      // frame after it was dropped.
      if (spec.allocateWhen !== undefined && !spec.allocateWhen(s, sizes.has(spec.id))) {
        release(spec.id);
        continue;
      }
      // A fixed-size row is a size that never changes across resizes, not a
      // separate code path past this one branch: the held-size comparison
      // and `allocate` call below stay shared with every other row.
      const fixed = spec.fixedSizePx ? resolveFixedSize(spec.fixedSizePx, s) : 0;
      const [width, height] = spec.fixedSizePx
        ? [fixed, fixed]
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
    layerViewOf(id: string, layer: number): GPUTextureView {
      const view = layerViews.get(id)?.[layer];
      if (!view) {
        // Covers a row with <= 1 layer, an out-of-range layer index, 'swap',
        // unknown ids, and use-after-destroy — same loud-failure discipline
        // as `viewOf`.
        throw new Error(`renderTargets: no layer view for target '${id}' layer ${layer}`);
      }
      return view;
    },
    depthViewOf(id: string): GPUTextureView {
      const view = depthViews.get(id);
      if (!view) {
        // Covers depthless rows ('hdr', 'mw-aggregate', 'swap'), unknown ids, and
        // use-after-destroy — an absent depth view is either "this row
        // declares no depth" or a wiring bug, both loud.
        throw new Error(`renderTargets: no depth view for target '${id}'`);
      }
      return view;
    },
    farDepthView(): GPUTextureView {
      return farDepthTextureView;
    },
    reconcile,
    setSwapFormat(next: GPUTextureFormat): void {
      specs = specs.map((s) => (s.id === 'swap' ? { ...s, format: next } : s));
    },
    destroy(): void {
      for (const texture of textures.values()) texture.destroy();
      for (const texture of depthTextures.values()) texture.destroy();
      farDepthTexture.destroy();
      textures.clear();
      views.clear();
      cubeViews.clear();
      layerViews.clear();
      depthTextures.clear();
      depthViews.clear();
      sizes.clear();
    },
  };
}
