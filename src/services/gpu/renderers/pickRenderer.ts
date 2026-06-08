/**
 * PickRenderer — offscreen per-point picking.
 *
 * Re-renders the scene into a tiny `r32uint` texture where each
 * fragment encodes `(sourceCode << 27) | localIdx + 1` (see
 * `pickFragment.wesl`).  `pick()` reads back the texel under the
 * cursor and decodes it; 0 is the cleared-background sentinel.
 *
 * Depth test (`depth24plus`, `less`, write-enabled) resolves
 * overlapping billboards so the front-most wins, matching visual
 * occlusion.  The visual pipeline skips depth because additive
 * blending wants every halo to contribute.
 *
 * The pick pipeline reads `PointRenderer`'s vertex + uniform buffers
 * directly — callers must run the visual pass first so this frame's
 * viewProj/viewport/etc are already written when `pick()` fires.
 * Point billboards pick a `pointSizePx`-clamped dot; resolved galaxy
 * disks are picked by the procedural-disk pass at the disk edge.
 *
 * @module
 */

// Vertex source is textually shared with PointRenderer but compiled
// into our own GPUShaderModule — never share modules across pipelines
// (see the `auto` bind-group-layout trap in pointRenderer.ts).
import vsCode from '../shaders/points/vertex.wesl?static';
import pickFsCode from '../shaders/points/pickFragment.wesl?static';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PickSourceDraw } from '../../../@types/rendering/PickSourceDraw';
import type { PickRenderer } from '../../../@types/rendering/PickRenderer';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { PointRenderer } from '../../../@types/rendering/PointRenderer';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import type { StructureMarkerRenderer } from '../../../@types/rendering/StructureMarkerRenderer';
import type { ProceduralDiskRenderer } from '../../../@types/rendering/ProceduralDiskRenderer';
import {
  POINT_STRIDE,
  POINT_VERTEX_ATTRIBUTES,
  SELECTED_PACKED_BYTE_OFFSET,
  POINT_SIZE_BYTE_OFFSET,
  PICK_PASS_BYTE_OFFSET,
} from './pointRenderer';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { SELECTION_NONE_SENTINEL, unpackPick } from '../../../data/selectionEncoding';
import type { PickResult } from '../../../data/selectionEncoding';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Extra pixels added to `pointSizePx` for the pick pass.  Widens the
 * click target for distant point-like galaxies (5 px-diameter dots at
 * the default 2.5 px floor → ~9 px with padding) without growing the
 * visible sprites.  Additive so it scales with the user's slider.
 */
const PICK_PADDING_PX = 4;

/**
 * Construct a `PickRenderer` bound to `device` and a specific
 * `PointRenderer`.  Pick textures are allocated lazily and recreated
 * on viewport change.  `pointRenderer` is held by reference and read
 * inside `pick()` to find the shared uniform buffer — destroy this
 * picker before destroying the PointRenderer.
 */
export function createPickRenderer(
  device: GPUDevice,
  pointRenderer: PointRenderer,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
  focusBgl: FocusUniformsBgl,
  // The engine's shared cluster-focus bind group (live buffer, written
  // once per frame in renderFrame).  Bound at @group(3) so the pick pass
  // sees the same focus state the visual pass does and the shared vertex
  // shader can cull non-members of a focused structure from hit-testing.
  focusBindGroup: GPUBindGroup,
  // Optional structure-ring pick provider.  When present, the pick pass
  // calls `structureMarkerRenderer.pickRing(pass)` after the galaxy
  // draws so cluster / supercluster / void ring hits land in the same
  // texture.  Shared depth state means a foreground galaxy still
  // claims the pixel — clicks through a ring select the galaxy.
  // Optional so tests can construct the picker in isolation; passing
  // `undefined` yields a galaxy-only pick pass.
  structureMarkerRenderer?: StructureMarkerRenderer,
  // Optional procedural-disk pick provider.  When present, the pick
  // pass calls `proceduralDiskRenderer.pickDisks(pass)` so resolved
  // galaxies (in the 8 px+ band) are pickable via their disk surface
  // rather than only their companion point billboard.  Optional so
  // tests and pre-init paths can omit it.
  proceduralDiskRenderer?: ProceduralDiskRenderer,
): PickRenderer {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'pick.vertex');
  const fsModule = createShaderModuleWithDevLog(device, pickFsCode, 'pick.pickFragment');

  // Explicit pipeline layout (not 'auto') so @group(1) FadeUniforms
  // and @group(2) SourceUniforms share identity with the visual
  // pipeline — bind groups built against the canonical BGLs work for
  // either pipeline.
  const pipelineLayout = device.createPipelineLayout({
    label: 'pick-pipeline-layout',
    bindGroupLayouts: [
      device.createBindGroupLayout({
        label: 'pick-bgl-group0',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      }),
      fadeBgl,
      sourceBgl,
      focusBgl,
    ],
  });

  // The shared vertex shader's layout declares @group(1) FadeUniforms
  // even though the pick fragment never reads fade.opacity.  Zeroed
  // dummy buffer keeps the bind group valid.
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

  // @group(2) bind groups cached by GPUBuffer identity — pick() fires
  // on every hover/click and the loaded sources are stable between
  // picks.  WeakMap means a tier swap that destroys the old
  // sourceBuffer invalidates the cached bind group via GC.
  const sourceBindGroupCache = new WeakMap<GPUBuffer, GPUBindGroup>();

  const pipeline = device.createRenderPipeline({
    label: 'pick-pipeline',
    layout: pipelineLayout,

    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      // Layout imported from PointRenderer as the single source of
      // truth — both pipelines bind the same const so drift is
      // structurally impossible.  Spread because @webgpu/types
      // declares `attributes` as mutable.
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
      entryPoint: 'fsPick',
      // r32uint: 32-bit unsigned int per texel.  No blend descriptor;
      // WebGPU disallows blending on integer formats.  Depth test
      // resolves overlapping fragments instead.
      targets: [{ format: 'r32uint' }],
    },

    primitive: { topology: 'triangle-list' },

    // Front-most point wins per pixel (the visual pass omits depth so
    // additive halos can overlap; the pick pass needs single-claim).
    // `depthWriteEnabled` must be true or every fragment passes.
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // `copyTextureToBuffer` requires `bytesPerRow` to be a multiple of
  // 256.  We only read 4 bytes per pick but must allocate at least
  // 256.  MAP_READ-only — never written from the CPU.
  const stagingBuffer = device.createBuffer({
    label: 'pick-staging-buffer',
    size: 256,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Textures allocated on first `pick()` and recreated on viewport
  // change, so the constructor doesn't need to know the canvas size.
  let pickTexture: GPUTexture | null = null;
  let depthTexture: GPUTexture | null = null;
  let texWidth = 0;
  let texHeight = 0;

  // `mapAsync` is async; a second pick before the first resolves
  // would map an already-mapped staging buffer (validation error).
  // `inFlight` keeps the second call from racing — it returns null.
  let inFlight = false;

  // `destroy()` can race with an in-flight `mapAsync`; the buffer
  // teardown rejects the pending map with `AbortError`.  We swallow
  // that specific abort silently so the harmless teardown race
  // doesn't surface as an uncaught rejection; other errors still
  // throw.
  let destroyed = false;

  /**
   * Reallocate the pick + depth textures when the viewport changes.
   * No-op when dimensions already match.
   *
   * Pick texture usages:
   *   - RENDER_ATTACHMENT — written by the pick pass.
   *   - COPY_SRC — `pick()` reads back a single texel.
   *   - TEXTURE_BINDING — sampled by the pick-debug overlay's
   *     fullscreen fragment.  Always included so flipping the debug
   *     toggle at runtime doesn't require texture recreation.
   */
  function ensureTextures(w: number, h: number): void {
    if (w === texWidth && h === texHeight && pickTexture !== null) return;

    pickTexture?.destroy();
    depthTexture?.destroy();

    pickTexture = device.createTexture({
      label: 'pick-target',
      size: { width: w, height: h },
      format: 'r32uint',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });
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

  /**
   * Record the shared per-source pick pass into `encoder`.  Both
   * `pick()` and `renderForDebug()` use this for the common middle —
   * uniform overrides, bind groups, draw loop, structure ring picks.  The
   * two callers diverge only on the tail (readback vs return-texture).
   *
   * Reads `sharedUniformBuffer` lazily so a future PointRenderer
   * device-loss recovery picks up the new buffer handle.  The bind-
   * group cache is keyed by GPUBuffer identity, so a tier swap that
   * destroys an old sourceBuffer invalidates the cached bind group
   * via GC.
   */
  function recordPickPass(
    encoder: GPUCommandEncoder,
    sourceList: readonly PickSourceDraw[],
    passLabel: string,
    pointSizePx: number | undefined,
    timingDescriptor: GPURenderPassTimestampWrites | undefined,
  ): GPUTexture {
    const sharedUniformBuffer = pointRenderer.uniformBuffer;
    const pt = pickTexture!;
    const dt = depthTexture!;

    // Three in-place uniform overrides, all reset by the next visual
    // frame's full-buffer rewrite:
    //   - `selectedPacked` → none-sentinel: stops the 8× selection-
    //     ring scaling from inflating the pick area.
    //   - `pointSizePx` + PICK_PADDING_PX: widens the click target
    //     for far-field dots.
    //   - `pickPass` = 1: shared vertex shader skips procedural-disk
    //     crossfade-OUT and the intensity-floor cull, so disk-sized
    //     galaxies remain pickable (the disk renderer has no pick
    //     pipeline of its own).
    device.queue.writeBuffer(
      sharedUniformBuffer,
      SELECTED_PACKED_BYTE_OFFSET,
      new Uint32Array([SELECTION_NONE_SENTINEL]),
    );
    if (pointSizePx !== undefined) {
      device.queue.writeBuffer(
        sharedUniformBuffer,
        POINT_SIZE_BYTE_OFFSET,
        new Float32Array([pointSizePx + PICK_PADDING_PX]),
      );
    }
    device.queue.writeBuffer(sharedUniformBuffer, PICK_PASS_BYTE_OFFSET, new Uint32Array([1]));

    const pass = encoder.beginRenderPass({
      label: `${passLabel}-pass`,
      colorAttachments: [
        {
          view: pt.createView(),
          // 0 = the "no hit" sentinel (everything else is +1-offset).
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
      // Spread-omit so the key never lands as `undefined` (validation
      // noise varies by implementation).
      ...(timingDescriptor ? { timestampWrites: timingDescriptor } : {}),
    });

    const bindGroup = device.createBindGroup({
      label: `${passLabel}-uniforms`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: sharedUniformBuffer } }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, dummyFadeBindGroup);
    pass.setBindGroup(3, focusBindGroup);

    for (const src of sourceList) {
      let sourceBindGroup = sourceBindGroupCache.get(src.sourceBuffer);
      if (!sourceBindGroup) {
        sourceBindGroup = device.createBindGroup({
          label: `${passLabel}-source-${src.source}`,
          layout: sourceBgl,
          entries: [{ binding: 0, resource: { buffer: src.sourceBuffer } }],
        });
        sourceBindGroupCache.set(src.sourceBuffer, sourceBindGroup);
      }
      pass.setBindGroup(2, sourceBindGroup);
      pass.setVertexBuffer(0, src.vertexBuffer);
      pass.draw(6, src.count);
    }

    // Structure ring picks share depth state with the galaxy draws, so a
    // foreground galaxy claims the pixel — clicks through a ring at a
    // galaxy select the galaxy.  Skipped when no marker renderer.
    if (structureMarkerRenderer) {
      structureMarkerRenderer.pickRing(pass);
    }

    // Procedural-disk pick: shared depth means a closer point dot or
    // disk claims the pixel; the disk and its companion point carry the
    // SAME packed id, so overlap is harmless.
    if (proceduralDiskRenderer) {
      proceduralDiskRenderer.pickDisks(pass);
    }

    pass.end();
    return pt;
  }

  // Whether this pick pass has anything to draw — galaxy sources OR
  // cluster / SC / void ring markers (drawn by
  // `structureMarkerRenderer.pickRing` inside `recordPickPass`).  Shared
  // by `pick` and `renderForDebug` so a galaxy-empty scene with visible
  // rings still picks (and the pick-debug texture isn't black when every
  // survey is toggled off).  `markerCount() > 0` mirrors
  // `structureMarkersPass`'s enable gate (0 when the category is hidden or
  // every ring has faded out).
  const hasAnyPickTarget = (sourceList: readonly PickSourceDraw[]): boolean =>
    sourceList.length > 0 ||
    (structureMarkerRenderer !== undefined && structureMarkerRenderer.markerCount() > 0);

  async function pick(
    viewportPx: Vec2,
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    pointSizePx?: number,
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): Promise<PickResult | null> {
    if (inFlight) return null;

    // Materialise once so we can check emptiness and iterate without
    // re-walking a one-shot generator.
    const sourceList = Array.from(sources);
    if (!hasAnyPickTarget(sourceList)) return null;

    const [vpW, vpH] = viewportPx;
    ensureTextures(vpW, vpH);

    // Clamp so `copyTextureToBuffer` stays inside the texture (DPR-
    // scaled CSS coords can land out of range during a resize).
    const px = Math.max(0, Math.min(vpW - 1, Math.floor(pickXPx)));
    const py = Math.max(0, Math.min(vpH - 1, Math.floor(pickYPx)));

    const encoder = device.createCommandEncoder();
    const pt = recordPickPass(encoder, sourceList, 'pick', pointSizePx, timingDescriptor);

    // `bytesPerRow` must be a multiple of 256; staging buffer is
    // pre-sized to 256 even though we only read 4 bytes.
    encoder.copyTextureToBuffer(
      { texture: pt, origin: { x: px, y: py, z: 0 } },
      { buffer: stagingBuffer, bytesPerRow: 256 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
    device.queue.submit([encoder.finish()]);

    inFlight = true;
    try {
      try {
        await stagingBuffer.mapAsync(GPUMapMode.READ);
      } catch (err) {
        // Buffer torn down by destroy() during the await — harmless.
        if (destroyed && (err as Error).name === 'AbortError') return null;
        throw err;
      }
      const mapped = new Uint32Array(stagingBuffer.getMappedRange(0, 4));
      const raw = mapped[0]!;
      stagingBuffer.unmap();
      return unpackPick(raw);
    } finally {
      inFlight = false;
    }
  }

  /**
   * Render the pick pass into the texture and return the handle —
   * same draw work `pick()` does, but no readback.  The pick-debug
   * overlay samples the result.
   *
   * Independent of `pick()`'s `inFlight` guard: that guard protects
   * the staging buffer, which this path never touches.  Sharing it
   * would make the overlay flicker whenever a hover-pick was mid-
   * flight.  Two paths writing the same texture is safe — submits
   * run in queue order, so a debug write after `pick()`'s
   * `copyTextureToBuffer` can't disturb the staging snapshot.
   */
  function renderForDebug(
    viewportPx: Vec2,
    sources: Iterable<PickSourceDraw>,
    pointSizePx?: number,
  ): GPUTexture | null {
    const sourceList = Array.from(sources);
    if (!hasAnyPickTarget(sourceList)) return null;
    const [vpW, vpH] = viewportPx;
    ensureTextures(vpW, vpH);

    const encoder = device.createCommandEncoder({ label: 'pick-debug-encoder' });
    const pt = recordPickPass(encoder, sourceList, 'pick-debug', pointSizePx, undefined);
    device.queue.submit([encoder.finish()]);
    return pt;
  }

  function destroy(): void {
    destroyed = true;
    pickTexture?.destroy();
    depthTexture?.destroy();
    stagingBuffer.destroy();
    dummyFadeBuffer.destroy();
    // focusBindGroup wraps the engine-owned shared focus buffer; the
    // engine's destroy() releases it, not the picker.
  }

  const renderer: PickRenderer = { label: 'pickRenderer', pick, renderForDebug, destroy };
  renderer satisfies Renderer;
  return renderer;
}
