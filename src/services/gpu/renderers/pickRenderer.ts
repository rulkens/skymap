/**
 * PickRenderer — GPU pipeline for offscreen per-point picking.
 *
 * ### What is GPU picking?
 *
 * Instead of doing CPU-side ray-casting against all 100 k point positions, we
 * re-render the scene into a tiny offscreen texture where each fragment's colour
 * encodes the *instance index* of the billboard that produced it.  To find which
 * point is under the cursor we read back exactly one pixel from that texture.
 *
 * This is faster than CPU ray-casting for large point clouds and is accurate
 * at the pixel level (the GPU resolves overlapping billboards via the depth test
 * so the front-most point wins automatically).
 *
 * ### Texture format: r32uint
 *
 * The pick texture has format `'r32uint'` — a single channel of 32-bit unsigned
 * integer per texel.  This gives us 4 294 967 295 addressable points, far more
 * than we will ever need.  The `fsPick` entry point in `points.wgsl` writes
 * `instanceIdx + 1` into the red channel; we read it back on the CPU side.
 *
 * ### Sentinel value: 0 = background
 *
 * The texture is cleared to 0 before each pick pass.  The shader writes
 * `instanceIdx + 1`, so 0 unambiguously means "the cursor is over empty sky",
 * and any value ≥ 1 decodes to the 0-based point index by subtracting 1.
 *
 * ### Depth test
 *
 * The pick pass uses a `depth24plus` depth attachment with `depthCompare:'less'`
 * and `depthWriteEnabled:true`.  This means only the front-most billboard at each
 * pixel writes its index — if two points overlap on screen, the closer one wins,
 * which matches the user's expectation.  (The visual pass does NOT use depth,
 * because additive blending intentionally lets every overlapping halo contribute.)
 *
 * ### Shared resources
 *
 * The pick pipeline reuses the *same* vertex buffer and *same* uniform buffer as
 * the visual pass.  The caller must ensure that the visual pass has already
 * written its per-frame uniforms (cam.viewProj, cam.viewportPx, pointSizePx,
 * brightness, ...) before calling `pick()` — the pick pass reads the same
 * values without re-uploading them.  See the `pick()` JSDoc for the exact contract.
 *
 * ### Forgiveness radius
 *
 * The `fsPick` fragment shader discards fragments where r² > 2.25 (radius 1.5)
 * rather than the visual r² > 1.0 (radius 1.0).  This makes each billboard's
 * pick area 1.5× larger than its visible disk, giving the user some pixel slack.
 *
 * @module
 */

// The points shader was split into four files (Task 13 of the WGSL→WESL
// conversion plan): `points/io.wesl` (shared structs), `points/vertex.wesl`
// (the `vs` entry point shared with PointRenderer), `points/colorFragment.wesl`
// (PointRenderer's visual `fs`), and `points/pickFragment.wesl` (the
// `fsPick` entry point — this renderer). The vertex source is textually
// shared with PointRenderer, but we compile our OWN GPUShaderModule from
// it; never share modules across pipelines (see the `auto` bind-group-
// layout trap noted in pointRenderer.ts).
import vsCode from '../shaders/points/vertex.wesl?static';
import pickFsCode from '../shaders/points/pickFragment.wesl?static';
import type { Source } from '../../../data/sources';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PickSourceDraw } from '../../../@types/rendering/PickSourceDraw';
import type { PickRenderer } from '../../../@types/rendering/PickRenderer';
import type { PointRenderer } from '../../../@types/rendering/PointRenderer';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
import { POINT_STRIDE, POINT_VERTEX_ATTRIBUTES } from './pointRenderer';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import {
  SELECTION_NONE_SENTINEL,
  // Interim shim while the foundations sub-plan lands the
  // discriminated-union `PickResult` ahead of the plan-3 consumer
  // migration. The pickRenderer here only knows how to surface
  // survey-galaxy hits to the caller's `{source, localIdx}` contract;
  // plan 3 swaps this for a real switch on `result.kind`.
  unpackPickGalaxyOnly,
} from '../../../data/selectionEncoding';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Construct a `PickRenderer` bound to the given WebGPU device and a
 * specific `PointRenderer`.
 *
 * The method:
 *   1. Compiles the same WGSL shader module used by `PointRenderer`.
 *   2. Creates a `GPURenderPipeline` that uses the `vs` + `fsPick` entry points,
 *      targeting `r32uint` with a depth attachment.
 *   3. Allocates a 256-byte staging buffer for readback (the minimum
 *      `bytesPerRow` imposed by `copyTextureToBuffer` is 256).
 *
 * Pick textures are allocated lazily on the first `pick()` call and
 * recreated automatically whenever the viewport size changes.
 *
 * The `pointRenderer` argument is held by reference and read inside
 * `pick()` to find the shared uniform buffer.  Binding the coupling at
 * construction time (rather than threading the buffer through every
 * call) keeps the engine ↔ renderer surface narrow: the engine no
 * longer needs visibility into a renderer-internal buffer.
 *
 * @param device         The WebGPU logical device.  Owned by the caller.
 * @param pointRenderer  The visual renderer this picker reads its uniform
 *                       buffer from.  The two MUST share their per-frame
 *                       uniforms; passing a different PointRenderer than
 *                       the one rendering the visual pass would make the
 *                       pick texture see a stale or wrong viewProj matrix.
 *                       Held by reference; the caller owns its lifecycle.
 *                       Destroying the PointRenderer before this
 *                       PickRenderer leaves the picker in undefined-
 *                       behaviour territory — call `pickRenderer.destroy()`
 *                       first.
 */
/**
 * Padding (in CSS pixels) added to `pointSizePx` for the pick pass only.
 *
 * Distant point-like galaxies render at the visual floor of `pointSizePx`
 * (default 2.5 px = a 5 px-diameter dot).  That's a small target for a
 * mouse cursor — easy to miss when trying to inspect a faint background
 * galaxy among the cosmic-web filaments.  Padding the *pick* pass's
 * floor by this amount makes the pickable area noticeably larger
 * without affecting how the galaxy looks on screen.
 *
 * Mechanism: just before each pick render pass we overwrite the
 * `pointSizePx` slot in the shared uniform buffer with
 * `pointSizePx + PICK_PADDING_PX`.  The next visual frame writes the
 * real value back, so the visual pass is unaffected.  Same in-place
 * mutation trick used for `selectedIndex` (see comment near the
 * sentinel write below for the rationale).
 *
 * Why an additive constant rather than a fixed absolute floor?
 * Scales naturally with the user's chosen `pointSizePx` — bumping
 * the slider doesn't shrink the pick target relative to the visual
 * dot.
 *
 * Why 4 px?  Empirically comfortable for a mouse cursor (~9 px total
 * pick diameter from the default 2.5 px floor).  Touch interaction
 * uses the same value; touch targets benefit from an even larger
 * radius but the standard 44 px iOS/Android tap-target is enforced
 * elsewhere by the dedicated touch input layer.
 */
const PICK_PADDING_PX = 4;

export function createPickRenderer(
  device: GPUDevice,
  pointRenderer: PointRenderer,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
): PickRenderer {
  // ── Shader modules ─────────────────────────────────────────────────────────
  //
  // The vertex stage source is textually shared with PointRenderer, but we
  // compile our OWN GPUShaderModule from it — never share modules across
  // pipelines (see the `auto` bind-group-layout trap above). The fragment
  // module compiles `pickFragment.wesl`, which contains only the `fsPick`
  // entry point; the visual `fs` lives in a sibling file that this
  // renderer never touches.
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'pick.vertex');
  const fsModule = createShaderModuleWithDevLog(device, pickFsCode, 'pick.pickFragment');

  // ── Render pipeline ────────────────────────────────────────────────────────
  //
  // The pick pipeline is structurally similar to the visual pipeline but:
  //   - Fragment target format is 'r32uint' (integer), not the swap-chain format.
  //   - No blend state: integers cannot be blended; we rely on the depth test
  //     to resolve overlapping points.
  //   - Depth-stencil state is enabled: `depthCompare:'less'` + `depthWriteEnabled:true`.
  //     The front-most point wins per pixel, matching visual occlusion.
  //   - Fragment entry point is 'fsPick', not 'fs'.
  //
  // The pipeline uses an EXPLICIT layout (not 'auto') with the same canonical
  // BGLs used by the visual pipeline. This is the whole point of the
  // unified-fade architecture: both pipelines share @group(1) (FadeUniforms)
  // and @group(2) (SourceUniforms) identity so bind groups built against the
  // canonical layouts are valid for either pipeline.
  const pipelineLayout = device.createPipelineLayout({
    label: 'pick-pipeline-layout',
    bindGroupLayouts: [
      device.createBindGroupLayout({
        label: 'pick-bgl-group0',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      }),
      fadeBgl,   // @group(1) — FadeUniforms (canonical, matches visual pipeline)
      sourceBgl, // @group(2) — SourceUniforms (canonical, shared identity with visual)
    ],
  });

  // Pick pipeline declares @group(1) (FadeUniforms) to match the shared
  // vertex shader's pipeline-layout shape, but the pick fragment doesn't
  // read fade.opacity. A zeroed buffer is fine — the pick pipeline writes
  // to the r32uint pick texture, not the visual swap chain, so opacity
  // has no observable effect.
  const dummyFadeBuffer = device.createBuffer({
    label: 'pick-fade-uniform-dummy',
    size: 16,
    usage: GPUBufferUsage.UNIFORM,
  });
  const dummyFadeBindGroup = device.createBindGroup({
    label: 'pick-fade-bg-dummy',
    layout: fadeBgl,
    entries: [{ binding: 0, resource: { buffer: dummyFadeBuffer } }],
  });

  // Cache @group(2) bind groups keyed by the source's GPUBuffer
  // identity. pick() is called on every mouse hover/click, and the
  // loaded-source set is stable between picks; without this cache each
  // pick would allocate one GPUBindGroup per loaded source. WeakMap
  // keys mean a tier swap (which destroys the old sourceBuffer and
  // creates a new one) transparently invalidates the cached bind group
  // — no explicit cleanup needed when an upload replaces a source.
  const sourceBindGroupCache = new WeakMap<GPUBuffer, GPUBindGroup>();

  const pipeline = device.createRenderPipeline({
    label: 'pick-pipeline',
    layout: pipelineLayout,

    vertex: {
      module: vsModule,
      entryPoint: 'vs',

      // Vertex buffer layout — imported from PointRenderer as the single
      // source of truth.  Pre-H2 cleanup this block re-declared the table
      // inline with magic numbers; a missed edit silently failed pipeline
      // validation or read garbage attributes.  The imports make drift
      // structurally impossible — both pipelines bind the same const.
      //
      // The spread `[...POINT_VERTEX_ATTRIBUTES]` exists because
      // `@webgpu/types` declares `attributes: GPUVertexAttribute[]`
      // (mutable), so the readonly canonical export can't pass verbatim.
      // The O(10) spread runs once at pipeline build, never per-frame.
      //
      // WebGPU validation requires the pick pipeline to declare a layout
      // matching every attribute the SHARED vertex buffer carries, even
      // attributes the pick fragment doesn't read (the SHARED vertex
      // stage still reads them before forwarding into VSOut).
      //
      // Identity encoding: previous revisions had a `globalInstanceIdx
      // u32` at offset 20 carrying a baked running-sum global ID.  Both
      // are gone — the picker now reads `cloud.sourceCode` from the
      // per-source @group(1) bind group and composes each instance's
      // packed identity as `(sourceCode << 27) | @builtin(instance_index)`
      // entirely on the GPU side.  Vertex stride shrank 52 → 48 bytes.
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          attributes: [...POINT_VERTEX_ATTRIBUTES],
        },
      ],
    },

    fragment: {
      module: fsModule,
      entryPoint: 'fsPick', // the picking fragment — writes instance index to r32uint

      targets: [
        {
          // `r32uint` is a single 32-bit unsigned integer per texel.
          // The `fsPick` shader writes `instanceIdx + 1` into the red channel.
          // No blend descriptor: WebGPU does not support blending on integer formats.
          format: 'r32uint',
        },
      ],
    },

    primitive: { topology: 'triangle-list' },

    // ── Depth-stencil state ────────────────────────────────────────────────
    //
    // The visual pass omits depth because additive blending wants *every*
    // overlapping galaxy halo to contribute.  The pick pass is different: only
    // the front-most point should claim a pixel.  Depth test 'less' means a
    // new fragment replaces the stored depth only if it is closer to the camera.
    // depthWriteEnabled must be true, otherwise the depth buffer is never updated
    // and every fragment would pass (last draw wins instead of nearest wins).
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── Staging buffer ─────────────────────────────────────────────────────────
  //
  // `copyTextureToBuffer` requires `bytesPerRow` to be a multiple of 256 (the
  // WebGPU spec §18.3 alignment requirement). Even though we only copy a single
  // 4-byte texel, we must allocate at least 256 bytes.  We never map this
  // buffer for writing — only MAP_READ is needed.
  const stagingBuffer = device.createBuffer({
    label: 'pick-staging-buffer',
    size: 256,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // ── Texture state (lazily allocated) ───────────────────────────────────────
  //
  // We defer texture creation to the first `pick()` call (and recreate when the
  // viewport changes) so the constructor never needs to know the canvas size.
  let pickTexture: GPUTexture | null = null;
  let depthTexture: GPUTexture | null = null;
  let texWidth = 0;
  let texHeight = 0;

  // ── Concurrency guard ──────────────────────────────────────────────────────
  //
  // mapAsync is async; if two hover events fire within the same GPU frame, the
  // second call would try to map a buffer that is still in use — a WebGPU
  // validation error.  We track inflight state and bail early with -1.
  // Task 17 will throttle pointer events so this guard is rarely triggered.
  let inFlight = false;

  // ── Teardown flag ──────────────────────────────────────────────────────────
  //
  // React StrictMode and HMR both unmount-then-remount the engine, which
  // calls `destroy()`.  When that happens with a `pick()` already awaiting
  // `stagingBuffer.mapAsync`, destroying the buffer aborts the pending map
  // with `AbortError: Buffer was destroyed before mapping was resolved`.
  // The error is harmless — the caller doesn't need a result from a torn-
  // down picker — but it surfaces as an uncaught promise rejection in the
  // console.  We flip `destroyed` in `destroy()` and use it to swallow that
  // specific abort silently.  Any other failure still propagates so genuine
  // bugs aren't masked.
  let destroyed = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Ensure the pick texture and depth texture match the requested dimensions.
   * Destroys and recreates them only when the size actually changes, to avoid
   * unnecessary GPU allocations on every frame.
   */
  function ensureTextures(w: number, h: number): void {
    if (w === texWidth && h === texHeight && pickTexture !== null) return;

    // Destroy stale textures before allocating new ones to reclaim VRAM.
    pickTexture?.destroy();
    depthTexture?.destroy();

    // ── Pick texture ───────────────────────────────────────────────────────
    //
    // `RENDER_ATTACHMENT` — the render pass can write to it.
    // `COPY_SRC`          — we copy a single pixel out of it after the pass.
    pickTexture = device.createTexture({
      label: 'pick-target',
      size: { width: w, height: h },
      format: 'r32uint',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    // ── Depth texture ──────────────────────────────────────────────────────
    //
    // `depth24plus` gives a 24-bit depth buffer (the minimum the spec guarantees
    // for the `depthCompare:'less'` mode we configured above).
    // Only `RENDER_ATTACHMENT` is needed — depth buffers are not typically read
    // back to the CPU, so no `COPY_SRC` here.
    depthTexture = device.createTexture({
      label: 'pick-depth',
      size: { width: w, height: h },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    texWidth = w;
    texHeight = h;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    pointSizePx?: number,
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): Promise<{ source: Source; localIdx: number } | null> {
    // Resolve the shared uniform buffer from the bound PointRenderer at
    // call time rather than at construction.  Reading it lazily means we
    // pick up any future buffer recreation (e.g. device-loss recovery
    // would rebuild the PointRenderer's internal buffer) without having
    // to invalidate this PickRenderer.  The PointRenderer's
    // `uniformBuffer` getter is `@internal` — we are the only consumer.
    const sharedUniformBuffer = pointRenderer.uniformBuffer;

    // Concurrency guard — see the `inFlight` declaration above for rationale.
    if (inFlight) return null;

    // Materialise the source iterator once so we can check emptiness up front
    // and iterate it again for the draw loop without re-walking the engine's
    // generator (which is one-shot).  Bail before allocating any GPU
    // resources if no surveys are visible — saves a pointless texture clear.
    const sourceList = Array.from(sources);
    if (sourceList.length === 0) return null;

    const [vpW, vpH] = viewportPx;

    // Recreate textures if the viewport changed.
    ensureTextures(vpW, vpH);

    // Safety assertions — TypeScript can't prove these non-null after
    // ensureTextures() but we know they are.
    const pt = pickTexture!;
    const dt = depthTexture!;

    // ── Clamp pick coordinates ────────────────────────────────────────────
    //
    // The caller passes DPR-scaled CSS coordinates.  Clamp to [0, dim-1] so
    // `copyTextureToBuffer` never reads outside the texture bounds (which would
    // be a validation error).
    const px = Math.max(0, Math.min(vpW - 1, Math.floor(pickXPx)));
    const py = Math.max(0, Math.min(vpH - 1, Math.floor(pickYPx)));

    // ── Suppress the selection halo for the pick pass ─────────────────────
    //
    // The shared uniform buffer carries `selectedPacked`, which the
    // visual shader uses to enlarge the selected billboard 8× and render
    // it as a ring.  We re-use the same buffer here so viewProj /
    // viewport stay in sync, but if we *also* let the pick pass see the
    // real selectedPacked it would inherit the 8× scaling — combined
    // with the pick fragment's `r² < 2.25` forgiveness radius this
    // gives the selected point a pick area roughly 12× larger than
    // every other point, swallowing clicks around its halo.
    //
    // Fix: write the "no selection" sentinel (0xFFFFFFFF) into the
    // uniform's selectedPacked slot for the duration of the pick
    // render pass.  The visual pass on the next frame overwrites this
    // with the real selectedPacked, so we don't need to restore
    // anything afterward.
    //
    // Layout (post-CameraUniforms refactor): the shared 80-byte
    // 'CameraUniforms' prefix occupies bytes 0..79 (viewProj + viewportPx
    // + two pad slots), so 'selectedPacked' sits at byte offset 80 — the
    // SAME offset as before the refactor (pre-refactor was viewProj 64 +
    // viewport 8 + pointSizePx 4 + brightness 4 = 80).  The value at this
    // offset is the packed (source, localIdx) u32, not an instance
    // index — see PointRenderer.toGlobalIdx for the encoding.
    const SELECTED_PACKED_OFFSET = 80;
    const noneSentinel = new Uint32Array([SELECTION_NONE_SENTINEL]);
    device.queue.writeBuffer(sharedUniformBuffer, SELECTED_PACKED_OFFSET, noneSentinel);

    // ── Boost the floor point size for easier hover/click ────────────────
    //
    // See the `PICK_PADDING_PX` doc comment at the top of this file for the
    // full rationale.  Pads the visual `pointSizePx` floor by a few extra
    // pixels so distant point-like galaxies become easier mouse targets
    // without growing them on screen.  Same in-place mutation pattern as
    // the SELECTED_PACKED write above — the next visual frame writes the
    // real `pointSizePx` back, so the visual pass is unaffected.
    //
    // Layout reminder (post-CameraUniforms refactor): pointSizePx now sits
    // at byte offset 88 (cam: CameraUniforms = 80 B prefix + selectedPacked
    // u32 + instanceIdOffset u32 = 88).  It used to live at offset 72, but
    // adopting the shared 'CameraUniforms' prefix (which reserves bytes
    // 72..79 as '_pad0/_pad1') forced 'pointSizePx' + 'brightness' to
    // move into the existing 8-byte alignment slack between
    // 'instanceIdOffset' and the vec3-aligned 'camPosWorld'.  See the
    // 'Uniforms layout' doc-block in points.wesl for the migration
    // diagram and the matching f32-index update in pointRenderer.ts.
    //
    // Skipped entirely when the caller didn't supply pointSizePx —
    // preserves the legacy "pick whatever the visual frame just wrote"
    // contract for any test that constructs the renderer in isolation.
    if (pointSizePx !== undefined) {
      const POINT_SIZE_OFFSET = 88;
      const boostedSize = new Float32Array([pointSizePx + PICK_PADDING_PX]);
      device.queue.writeBuffer(sharedUniformBuffer, POINT_SIZE_OFFSET, boostedSize);
    }

    // ── Single-encoder, single-submit pick pass ───────────────────────────
    //
    // One encoder, one render pass, multiple per-source draw calls — the
    // standard WebGPU pattern.  Cross-survey identification works because
    // each source has its own @group(2) SourceUniforms bind group whose
    // `sourceCode` slot is set at upload time; the shader composes
    // each instance's packed identity from `(sourceCode << 27) | ii`
    // without any per-vertex bake.  Per-source bind groups dodge the
    // queue.writeBuffer race entirely (different uniform buffers per
    // source means writes to one don't race against draws against
    // another).
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: pt.createView(),
          // Cleared to 0 (the "no hit" sentinel after subtracting 1).
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: dt.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
      // Per-pass GPU timing.  Undefined unless the caller passed a
      // descriptor (which happens only when the engine's timing
      // service is alive — see PickRenderer.pick's `timingDescriptor`
      // JSDoc for the cross-frame resolution story).  Spread-omit
      // when absent so the descriptor stays byte-identical to the
      // pre-timing shape and we don't accidentally hand WebGPU an
      // `undefined`-valued `timestampWrites` key (validation noise
      // varies by implementation).
      ...(timingDescriptor ? { timestampWrites: timingDescriptor } : {}),
    });

    // ── Bind group ─────────────────────────────────────────────────────────
    //
    // Build the @group(0) bind group with the lazily-resolved
    // `sharedUniformBuffer` (read from `pointRenderer.uniformBuffer` at the
    // top of this call) so the pick pass sees the same viewProj/viewport
    // values the visual pass wrote.
    //
    // Creating the bind group inside pick() (rather than once in the
    // constructor) avoids caching a stale buffer reference: if PointRenderer
    // ever rebuilds its uniform buffer (e.g. device-loss recovery), the
    // next pick() call picks up the fresh handle without needing to
    // invalidate this PickRenderer.
    const bindGroup = device.createBindGroup({
      label: 'pick-bg-uniforms',
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: sharedUniformBuffer } }],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // @group(1) is the same dummy buffer for every source in this pick —
    // bind once outside the per-source loop.
    pass.setBindGroup(1, dummyFadeBindGroup);

    // Per-source @group(2) bind groups are cached by sourceBuffer
    // identity. A pick() typically iterates over 3-5 loaded sources and
    // fires on every mouse hover/click — without caching this would
    // allocate one GPUBindGroup per source per pick. The WeakMap keys
    // by the GPUBuffer reference, so a tier swap that destroys the old
    // sourceBuffer and creates a new one transparently invalidates the
    // cached bind group via GC. The underlying buffer was written by
    // the visual pass at upload time; both pipelines share one canonical
    // sourceBgl identity, so the same bind group is valid for either.
    for (const src of sourceList) {
      let sourceBindGroup = sourceBindGroupCache.get(src.sourceBuffer);
      if (!sourceBindGroup) {
        sourceBindGroup = device.createBindGroup({
          label: `pick-bg-source-${src.source}`,
          layout: sourceBgl,
          entries: [{ binding: 0, resource: { buffer: src.sourceBuffer } }],
        });
        sourceBindGroupCache.set(src.sourceBuffer, sourceBindGroup);
      }
      pass.setBindGroup(2, sourceBindGroup);
      pass.setVertexBuffer(0, src.vertexBuffer);
      pass.draw(6, src.count);
    }
    pass.end();

    // ── Texture → staging buffer copy ─────────────────────────────────────
    //
    // Copy the single texel at (px, py) into the staging buffer.
    //
    // `bytesPerRow` must be a multiple of 256 per the WebGPU spec (§18.3).
    // We allocate 256 bytes for the staging buffer so this constraint is met
    // even though we only read 4 bytes (one r32uint = 4 bytes).
    encoder.copyTextureToBuffer(
      { texture: pt, origin: { x: px, y: py, z: 0 } },
      { buffer: stagingBuffer, bytesPerRow: 256 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );

    // Submit to the GPU. `queue.submit` is non-blocking on the JS side; the
    // GPU executes the commands asynchronously. `mapAsync` below will wait
    // until the GPU has finished writing the staging buffer before resolving.
    device.queue.submit([encoder.finish()]);

    // ── Async readback ─────────────────────────────────────────────────────
    //
    // `mapAsync(GPUMapMode.READ)` returns a Promise that resolves once:
    //   1. The submitted commands have completed on the GPU.
    //   2. The staging buffer contents have been copied into CPU-accessible memory.
    //
    // Between `mapAsync` resolving and `unmap()`, we can read the buffer via
    // `getMappedRange()`.  After `unmap()` the buffer returns to GPU-owned
    // memory and is ready for the next pick call.
    inFlight = true;
    try {
      try {
        await stagingBuffer.mapAsync(GPUMapMode.READ);
      } catch (err) {
        // If destroy() ran while we were awaiting the map, the buffer
        // has been torn down and mapAsync rejects with an AbortError.
        // Treat this as "no pick result" — the renderer is going away
        // anyway.  Any other rejection re-throws so genuine errors
        // (validation, lost device) still surface.
        if (destroyed && (err as Error).name === 'AbortError') return null;
        throw err;
      }
      const mapped = new Uint32Array(stagingBuffer.getMappedRange(0, 4));
      const raw = mapped[0]!;
      stagingBuffer.unmap();

      // Decode the (sourceCode << 27 | localIdx + 1) pick value.
      //
      //   raw == 0           → cleared sentinel (no hit) → null
      //   raw >= 1           → top 5 bits = sourceCode, bottom 27 = (localIdx + 1)
      //
      // We subtract 1 from the bottom 27 bits to recover the 0-based
      // localIdx; `>>> 27` recovers the source code.  Both are pure
      // bitwise ops, so the decode is one shift + one mask + one
      // subtract.
      const decoded = unpackPickGalaxyOnly(raw);
      if (decoded === null) return null;
      return { source: decoded.source as Source, localIdx: decoded.localIdx };
    } finally {
      // Always clear inFlight, even if an exception is thrown.
      inFlight = false;
    }
  }

  function destroy(): void {
    destroyed = true;
    pickTexture?.destroy();
    depthTexture?.destroy();
    stagingBuffer.destroy();
    dummyFadeBuffer.destroy();
  }

  const renderer: PickRenderer = { label: 'pickRenderer', pick, destroy };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
