/**
 * PointRenderer — GPU pipeline owner for instanced billboard point sprites.
 *
 * Each catalog point renders as a single 3-vertex triangle that
 * circumscribes the unit UV circle, via WebGPU's instanced draw
 * (`draw(3, N)`).  The vertex stage reads `@builtin(vertex_index)`
 * (0..2, the corner) and per-instance attributes (position, magnitude,
 * colour index, axis ratio, baked PA cos/sin, padded radius, three bias
 * weights, baked absMag — see `POINT_VERTEX_ATTRIBUTES`).  A triangle
 * rather than the usual 6-vertex quad because this pass is vertex/
 * primitive-bound at ~2.5M instances: `draw(3, N)` halves the
 * vertex-shader invocations and the primitive setup, while the fragment
 * shader's r² > 1 discard keeps visible coverage identical (only the
 * discarded margin grows — see `triCorner` in `lib/billboard.wesl`).
 *
 * One vertex buffer per loaded galaxy catalog; an engine-supplied bitmask
 * decides which sources draw each frame.  Each source's `@group(2)`
 * SourceUniforms carries a 5-bit `sourceCode` that the vertex stage
 * composes with `@builtin(instance_index)` into the fragment's packed
 * identity for `fsPick` to write into the r32uint pick texture.
 *
 *   GalaxyCatalog → upload(id, …) → GPU vertex buffer per catalog
 *   OrbitCamera   → computeViewProj() → draw() → uniform buffer (per frame)
 *
 * @module
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PointDrawSettings } from '../../../@types/rendering/PointDrawSettings';
import type { PointRenderer } from '../../../@types/rendering/PointRenderer';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../data/sources';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';
import type { SourceType } from '../../../@types/data/SourceType';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { Vec2 } from '../../../@types/math/Vec2';

// `?worker` emits the worker as a separate chunk and exports a class
// whose `new` spawns it.  The bake runs off-thread to dodge the
// 10-second main-thread freeze on .bin arrival.  Node-only tests
// can't resolve `?worker`; they inject a synchronous fallback through
// the factory's `buildRunner` param.
import BuildPointBufferWorker from '../../engine/bake/buildPointInterleavedBuffer.worker?worker';
import { cloneGalaxyCatalogForTransfer } from '../../../data/galaxyCatalog/galaxyCatalogTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';

// `?static` runs the WESL linker at build time and hands back a plain
// WGSL string with imports resolved.
import vsCode from '../shaders/points/vertex.wesl?static';
import colorFsCode from '../shaders/points/colorFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import { packPointUniforms } from '../../../utils/gpu/packPointUniforms';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import {
  SLOTS_PER_POINT,
  POINT_STRIDE,
  POINT_VERTEX_ATTRIBUTES,
  UNIFORM_BYTES,
} from './pointVertexLayout';

/**
 * Off-thread bake runner.  Spawns a fresh worker per call, ships the
 * cloud via `postMessage` with a transferable list, and terminates the
 * worker on result.
 *
 * One worker per call (rather than long-lived) because parallel galaxy catalog
 * fetches resolve in unpredictable order; per-call workers run
 * concurrently at the OS level with zero shared state.  Spawn cost (a
 * few ms) is dwarfed by the 1–4 s bake.
 *
 * The cloud's typed arrays are `slice()`d before transfer because
 * transferring detaches the original `ArrayBuffer` (turning every view
 * into a 0-length husk), and the engine's picker + InfoCard still read
 * the cloud after the bake kicks off.  Copy-then-transfer costs ~50 ms
 * for a 100 MB cloud — strictly better than the multi-second
 * structured-clone alternative.
 */
function defaultWorkerRunner(
  input: BuildPointInterleavedBufferInput,
): Promise<BuildPointInterleavedBufferResult> {
  const { copy, transfer } = cloneGalaxyCatalogForTransfer(input.cloud);
  return runDisposableWorker<BuildPointInterleavedBufferInput, BuildPointInterleavedBufferResult>(
    BuildPointBufferWorker,
    { ...input, cloud: copy },
    transfer,
    'point-bake',
  );
}

/**
 * How a catalog's interleaved vertex buffer gets baked.  Production
 * hands over `defaultWorkerRunner`; Node tests inject a synchronous
 * function (`Worker` doesn't exist there).
 */
export type BuildRunner = (
  input: BuildPointInterleavedBufferInput,
) => Promise<BuildPointInterleavedBufferResult>;

// The `schechter*` uniform slots at byte offsets 140..155 are
// dead-but-reserved: the Schechter integral bakes into the per-vertex
// `schechterRatio` attribute, so no shader reads these slots.  They
// stay in the `Uniforms` struct for layout stability — removing them
// would shift every subsequent member's offset.

// ─── Source code ↔ catalog id resolution ──────────────────────────────────────
//
// The public key is now the string `GalaxyCatalogId`, but the GPU-facing
// identity (the 5-bit `sourceCode` packed into the pick texture) and the
// draw order (`GALAXY_CATALOG_SOURCES`) are numeric.  Both maps are derived
// from `SOURCE_REGISTRY` so the catalog set + codes stay defined in exactly
// one place — adding a galaxy catalog there extends both without a hardcoded
// list here.

/** Numeric `Source` code → string `GalaxyCatalogId`. */
const ID_OF_CODE = new Map<SourceType, GalaxyCatalogId>(
  GALAXY_CATALOG_SOURCES.map((code) => [code, SOURCE_REGISTRY[code].id as GalaxyCatalogId]),
);

/** String `GalaxyCatalogId` → numeric `Source` code. */
const CODE_OF_ID = new Map<GalaxyCatalogId, SourceType>(
  GALAXY_CATALOG_SOURCES.map((code) => [SOURCE_REGISTRY[code].id as GalaxyCatalogId, code]),
);

/**
 * Loaded catalogs in `GALAXY_CATALOG_SOURCES` (source-code) draw order,
 * paired with their string id — the draw / pick iteration consults this
 * so it can key the id-keyed map while still emitting the numeric
 * `sourceCode` per draw.
 */
const CATALOG_DRAW_ORDER: readonly { code: SourceType; id: GalaxyCatalogId }[] =
  GALAXY_CATALOG_SOURCES.map((code) => ({ code, id: ID_OF_CODE.get(code)! }));

// ─── Per-source bookkeeping ───────────────────────────────────────────────────

/** One catalog's GPU vertex buffer and the per-source bind groups it needs. */
type LoadedSource = {
  buffer: GPUBuffer;
  count: number;
  /**
   * Mirror of the interleaved Float32Array baked into `buffer`, held
   * on the JS side so the bias-correction subsystem's splice methods
   * (`spliceSchechterRatios` etc.) can rewrite slots 9 / 10 of every
   * row and re-upload the whole buffer in one `writeBuffer` call.
   * Single full re-upload (~50 ms PCIe for 17 MB SDSS) beats N sparse
   * writes — WebGPU has no scatter primitive, and per-call overhead
   * dominates.  Memory cost (~14 MB for full SDSS) is dwarfed by the
   * cloud itself; freed when the source unloads.
   */
  interleaved: Float32Array;
  /** Per-source FadeUniforms (opacity + pad) written once per frame. */
  fadeBuffer: GPUBuffer;
  fadeBindGroup: GPUBindGroup;
  /** Per-source SourceUniforms (5-bit sourceCode + pad) written once at upload. */
  sourceBuffer: GPUBuffer;
  sourceBindGroup: GPUBindGroup;
};

// ─── PointRenderer ────────────────────────────────────────────────────────────

/**
 * Build the render pipeline, allocate the uniform buffer, and create
 * the bind group.  Pipeline state lives in closure scope; the only
 * mutable bits are the per-source `galaxyCatalogs` Map and the
 * bias-correction callbacks.
 *
 * A named bag rather than a positional list: the five construction
 * dependencies are all opaque handles (three of them structurally
 * indistinguishable bind-group layouts), so a mis-ordered call would
 * typecheck and fail at pipeline-creation time instead of at the call
 * site.
 *
 * @param init.device        The WebGPU logical device. Owned by the caller.
 * @param init.targetFormat  The colour-target format the pipeline writes into —
 *                           the HDR offscreen (`'rgba16float'`), NOT the swap
 *                           chain.  Handed over explicitly because a render-pass
 *                           encoder cannot be queried for its own
 *                           colour-attachment format.
 * @param init.buildRunner   The vertex-buffer bake runner, defaulting to the
 *                           worker-spawning `defaultWorkerRunner`.  Injected
 *                           per renderer rather than swapped through a
 *                           module-global setter: a module-global is shared by
 *                           every renderer instance in the process and leaks
 *                           between tests, so an override installed for one
 *                           case silently governs the next.
 */
export function createPointRenderer(init: {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  fadeBgl: FadeUniformsBgl;
  sourceBgl: SourceUniformsBgl;
  focusBgl: FocusUniformsBgl;
  buildRunner?: BuildRunner;
}): PointRenderer {
  const { device, targetFormat, fadeBgl, sourceBgl, focusBgl } = init;
  const buildRunner = init.buildRunner ?? defaultWorkerRunner;

  // Each renderer compiles its own GPUShaderModule from the shared
  // vertex source — sharing modules across pipelines hits the WebGPU
  // 'auto' bind-group-layout trap (auto layouts have pipeline-specific
  // identity).
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'points.vertex');
  const fsModule = createShaderModuleWithDevLog(device, colorFsCode, 'points.colorFragment');

  const pipelineLayout = device.createPipelineLayout({
    label: 'points-pipeline-layout',
    bindGroupLayouts: [
      // @group(0) per-frame Uniforms (points-pipeline-specific).
      device.createBindGroupLayout({
        label: 'points-bgl-group0',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      }),
      fadeBgl, // @group(1) FadeUniforms (canonical)
      sourceBgl, // @group(2) SourceUniforms (canonical, shared with PickRenderer)
      // @group(3) FocusUniforms — a single shared/global binding (only
      // one POI focused at a time), unlike the per-source @group(1) fade.
      focusBgl,
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'points-pipeline',
    layout: pipelineLayout,

    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          // Spread because `@webgpu/types` declares the field mutable
          // while the canonical export is readonly.
          attributes: [...POINT_VERTEX_ATTRIBUTES],
        },
      ],
    },

    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Additive blend so overlapping halos brighten (long-exposure style).
          blend: ADDITIVE_BLEND,
        },
      ],
    },

    primitive: { topology: 'triangle-list' },
  });

  const uniformBuffer = device.createBuffer({
    label: 'points-uniform-buffer',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'points-bg-uniforms',
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // 16 bytes (opacity + pad) of scratch reused per-source-per-frame
  // for the fade `writeBuffer` call.  Pad slots stay zero.
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  // Loaded galaxy catalog buffers keyed by GalaxyCatalogId.  Map preserves
  // insert order and keys on the stable string id (the same key domain the
  // volume renderer uses for its fields) rather than the numeric source code.
  const galaxyCatalogs = new Map<GalaxyCatalogId, LoadedSource>();

  // Optional callbacks invoked at the end of `upload` / `unload`.  The
  // bias-correction subsystem installs them so a per-source bake fires
  // when a new source arrives mid-mode.  Uni-directional: the renderer
  // doesn't know what they do.  Null when no subsystem is attached.
  let biasUploadCallback: ((source: SourceType, cloud: GalaxyCatalog) => void) | null = null;
  let biasUnloadCallback: ((source: SourceType) => void) | null = null;

  function setBiasUploadCallback(
    cb: ((source: SourceType, cloud: GalaxyCatalog) => void) | null,
  ): void {
    biasUploadCallback = cb;
  }

  function setBiasUnloadCallback(cb: ((source: SourceType) => void) | null): void {
    biasUnloadCallback = cb;
  }

  // ─── Data upload ────────────────────────────────────────────────────────────

  /**
   * Bake `galaxyCatalog` into an interleaved GPU vertex buffer for the
   * catalog `id`, replacing any previous buffer.  Async because the bake
   * runs in a worker — 3.5 M galaxies inline would freeze the main thread
   * for ~10 s.  `galaxyCatalog.count === 0` is the unload signal: destroy
   * the catalog's buffers and remove the Map entry.
   *
   * The public key is the string `GalaxyCatalogId`, but the numeric
   * source code (resolved from the registry) is what the bake input and
   * the GPU-facing `sourceCode` need — so the bias callbacks still carry
   * the numeric source, keeping the subsystem's source-keyed caches and
   * pick-identity packing untouched.
   *
   * Last-writer-wins on parallel uploads of the same catalog: both
   * workers spawn, both `galaxyCatalogs.set` calls run in resolution
   * order, the loser's GPU buffer leaks until the next upload destroys it.
   * Theoretical — in practice each catalog uploads once per session.
   */
  async function upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog): Promise<void> {
    // PointRenderer only handles galaxy catalog sources; the registry
    // entry for this id carries the numeric source code, per-source
    // intensityFloor + falloffHalfMpc, and the discriminant we narrow on.
    const source = CODE_OF_ID.get(id);
    if (source === undefined) {
      throw new Error(`PointRenderer cannot upload unknown galaxy catalog id '${id}'`);
    }
    const entry = SOURCE_REGISTRY[source];
    if (entry.type !== 'galaxyCatalog') {
      throw new Error(
        `PointRenderer cannot upload non-galaxy catalog id '${id}' (type=${entry.type})`,
      );
    }

    // Empty cloud is the unload signal (used by tier changes that drop
    // a catalog).  Short-circuit before the bake; `createBuffer({size:0})`
    // is forbidden by the spec.
    if (galaxyCatalog.count === 0) {
      const stale = galaxyCatalogs.get(id);
      if (stale) {
        stale.buffer.destroy();
        stale.fadeBuffer.destroy();
        stale.sourceBuffer.destroy();
      }
      galaxyCatalogs.delete(id);
      biasUnloadCallback?.(source);
      return;
    }

    // `buildRunner` is either the worker spawner (production) or an
    // inline pure-function (Node tests, via the factory's `buildRunner`).
    // The renderer always uploads in 'fast' mode; the bias-correction
    // subsystem fires a per-source bake via `biasUploadCallback`
    // below if a mode is active when this resolves.
    const result = await buildRunner({ cloud: galaxyCatalog, source, mode: 'fast' });
    const { interleaved } = result;

    // GPU buffers are fixed-size — destroy and reallocate on replace.
    const prev = galaxyCatalogs.get(id);
    if (prev) {
      prev.buffer.destroy();
      prev.fadeBuffer.destroy();
      prev.sourceBuffer.destroy();
    }

    const buffer = device.createBuffer({
      label: `points-vertex-buffer-${id}`,
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, interleaved);

    const fadeBuffer = device.createBuffer({
      label: `points-fade-uniform-${id}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const fadeBindGroup = device.createBindGroup({
      label: `points-fade-bg-${id}`,
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
    });

    // SourceUniforms: 5-bit sourceCode + per-source intensityFloor +
    // per-source falloffHalfMpc + 4 B pad.  Written once here; the
    // values are constant per source so per-frame writes would be
    // wasted bytes.  See lib/sourceUniforms.wesl for the struct layout
    // and GalaxyCatalogSourceEntry.d.ts for the per-source value rationale.
    const sourceBuffer = device.createBuffer({
      label: `points-source-uniform-${id}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sourceScratch = new ArrayBuffer(16);
    const sourceU32 = new Uint32Array(sourceScratch);
    const sourceF32 = new Float32Array(sourceScratch);
    sourceU32[0] = source >>> 0;
    sourceF32[1] = entry.intensityFloor;
    sourceF32[2] = entry.falloffHalfMpc;
    device.queue.writeBuffer(sourceBuffer, 0, sourceScratch);
    const sourceBindGroup = device.createBindGroup({
      label: `points-source-bg-${id}`,
      layout: sourceBgl,
      entries: [{ binding: 0, resource: { buffer: sourceBuffer } }],
    });

    galaxyCatalogs.set(id, {
      buffer,
      count: galaxyCatalog.count,
      interleaved,
      fadeBuffer,
      fadeBindGroup,
      sourceBuffer,
      sourceBindGroup,
    });

    biasUploadCallback?.(source, galaxyCatalog);
  }

  /** No-op if the catalog was never uploaded. */
  function unload(id: GalaxyCatalogId): void {
    const entry = galaxyCatalogs.get(id);
    if (!entry) return;
    entry.buffer.destroy();
    entry.fadeBuffer.destroy();
    entry.sourceBuffer.destroy();
    galaxyCatalogs.delete(id);
    const source = CODE_OF_ID.get(id);
    if (source !== undefined) biasUnloadCallback?.(source);
  }

  // ─── Bias-correction splice surface ──────────────────────────────────────
  //
  // Layout-aware writes into the interleaved CPU mirror + re-upload of
  // the whole GPU buffer.  Slot indices are `SCHECHTER_RATIO_BYTE_OFFSET
  // / 4` and `ANGULAR_WEIGHT_BYTE_OFFSET / 4`.  The bias-correction
  // subsystem owns the state machine and calls these once its async
  // bakes resolve.
  //
  // No-op on unloaded sources: a subsystem bake can race against
  // `unload()`, and re-checking the map after every await would
  // duplicate this safety net.  Length mismatch is a programmer error
  // (not a race) and throws.
  //
  // These keep the numeric `source` in their public signature (the
  // bias subsystem's caches are source-keyed); the id-keyed map is
  // reached via `ID_OF_CODE`.

  /**
   * Slot 10 ← `ratios[i]`, then re-upload.  `ratios.length` must equal
   * the source's `count`.
   */
  function spliceSchechterRatios(source: SourceType, ratios: Float32Array): void {
    const id = ID_OF_CODE.get(source);
    const entry = id !== undefined ? galaxyCatalogs.get(id) : undefined;
    if (!entry) return;
    if (ratios.length !== entry.count) {
      throw new Error(
        `spliceSchechterRatios: length mismatch — got ${ratios.length} ratios, expected ${entry.count}`,
      );
    }
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 10] = ratios[i]!;
    }
    device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
  }

  /** Slot 11 ← `weights[i]`, then re-upload.  Length must equal `count`. */
  function spliceAngularWeights(source: SourceType, weights: Float32Array): void {
    const id = ID_OF_CODE.get(source);
    const entry = id !== undefined ? galaxyCatalogs.get(id) : undefined;
    if (!entry) return;
    if (weights.length !== entry.count) {
      throw new Error(
        `spliceAngularWeights: length mismatch — got ${weights.length} weights, expected ${entry.count}`,
      );
    }
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 11] = weights[i]!;
    }
    device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
  }

  /**
   * Zero slots 10 (Schechter ratio) and 11 (angular weight) for one
   * source or all of them.  Written as 0 rather than 1.0 because the
   * shader's `select(1.0, slot, mode==N)` gate substitutes 1.0 when
   * the mode is inactive — so the slot is dead in those modes, and 0
   * is a cleaner "obviously cleared" sentinel for debug overlays.
   */
  function clearBiasOverlays(source?: SourceType): void {
    const targets: LoadedSource[] =
      source !== undefined
        ? (() => {
            const id = ID_OF_CODE.get(source);
            const entry = id !== undefined ? galaxyCatalogs.get(id) : undefined;
            return entry ? [entry] : [];
          })()
        : Array.from(galaxyCatalogs.values());
    for (const entry of targets) {
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 10] = 0;
        entry.interleaved[i * SLOTS_PER_POINT + 11] = 0;
      }
      device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  // ─── Public API for the engine + picker ─────────────────────────────────────

  /** Total points across every loaded catalog — drives the status-bar count. */
  function totalCount(): number {
    let total = 0;
    for (const entry of galaxyCatalogs.values()) total += entry.count;
    return total;
  }

  /**
   * Per-source point count (0 when not loaded).  Engine bounds-checks
   * a picked `(source, localIdx)` pair before building a GalaxyInfo,
   * since tier swaps can shrink a source's count in flight.
   */
  function countOf(source: SourceType): number {
    const id = ID_OF_CODE.get(source);
    return (id !== undefined ? galaxyCatalogs.get(id)?.count : undefined) ?? 0;
  }

  // Whether a catalog's buffer is committed — the survey fade row guards on
  // this (same demand-loaded pattern as filamentRenderer.hasCloud): a fade
  // toward "visible" is suppressed until there is something to fade in.
  function hasCatalog(id: GalaxyCatalogId): boolean {
    return galaxyCatalogs.has(id);
  }

  /**
   * Iterate loaded sources in GALAXY_CATALOG_SOURCES order.  Fresh iterator
   * per call so the caller may `unload()` between iterations without
   * affecting the snapshot.
   */
  function* loadedSourcesGen(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }> {
    for (const { code, id } of CATALOG_DRAW_ORDER) {
      const entry = galaxyCatalogs.get(id);
      if (!entry) continue;
      yield {
        source: code,
        vertexBuffer: entry.buffer,
        count: entry.count,
        sourceBuffer: entry.sourceBuffer,
      };
    }
  }
  function loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }> {
    return loadedSourcesGen();
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Pack and upload the per-frame uniform buffer, then issue one
   * instanced draw per visible source.  Per-source fade opacity rides
   * on each source's own 16-byte fade buffer, so writes for one
   * source don't race against draws against another.
   *
   * No-op when there are no catalogs to draw. The pick pass rebuilds its
   * own uniform bytes from plain values at pick time (see
   * `pickUniformBytesOf`), so this draw owns no cross-pass snapshot.
   */
  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: PointDrawSettings,
  ): void {
    const { visibleSourceMask, focusBindGroup } = settings;
    if (galaxyCatalogs.size === 0) return;

    // Pack 176 bytes — see `UNIFORM_BYTES` for the layout, and
    // `points/io.wesl::Uniforms` for the WGSL-side struct.  `pickPass`
    // defaults to 0 (visual pass); the pick path packs its own image via
    // `pickUniformBytesOf`, never this buffer.
    const buf = packPointUniforms(viewProj, viewportPx, settings);
    device.queue.writeBuffer(uniformBuffer, 0, buf);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // @group(3) focus is the engine's shared focus bind group (one POI
    // focused at a time, written once per frame in renderFrame). Bind once
    // before the per-source loop, not per source like fade/source.
    pass.setBindGroup(3, focusBindGroup);

    for (const { code: source, id } of CATALOG_DRAW_ORDER) {
      const entry = galaxyCatalogs.get(id);
      if (!entry) continue;
      // Inlined `maskHas(visibleSourceMask, source)` — hot path.  The
      // mask + per-source fade are keyed by the numeric code, so we keep
      // it alongside the id resolved for the map lookup.
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      // One 16-byte fade writeBuffer per visible galaxy catalog per frame.
      fadeScratchF32[0] = settings.fadeOpacityOf(source);
      device.queue.writeBuffer(entry.fadeBuffer, 0, fadeScratchBuffer);

      pass.setBindGroup(1, entry.fadeBindGroup);
      pass.setBindGroup(2, entry.sourceBindGroup);
      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(3, entry.count);
    }
  }

  /**
   * Release every GPU resource this renderer owns.  Only `GPUBuffer`
   * and `GPUTexture` need explicit `destroy()` — they own VRAM that JS
   * GC alone won't release.  Pipelines / bind groups / shader modules
   * are JS-side handles and clean up via GC.
   *
   * Important in dev: Vite HMR + React StrictMode each tear down and
   * reconstruct the engine, leaking ~14 MB per SDSS deck plus per-
   * source buffers without this method.  After ten HMR saves the
   * browser GPU process can be wedged on a constrained laptop.
   *
   * Idempotent: `GPUBuffer.destroy()` is a no-op the second time, so
   * overlapping teardowns (HMR mid-StrictMode remount) are safe.
   */
  function destroy(): void {
    for (const entry of galaxyCatalogs.values()) {
      entry.buffer.destroy();
      entry.fadeBuffer.destroy();
      entry.sourceBuffer.destroy();
    }
    galaxyCatalogs.clear();
    uniformBuffer.destroy();
  }

  const renderer: PointRenderer = {
    label: 'pointRenderer',
    upload,
    unload,
    setBiasUploadCallback,
    setBiasUnloadCallback,
    spliceSchechterRatios,
    spliceAngularWeights,
    clearBiasOverlays,
    totalCount,
    countOf,
    hasCatalog,
    loadedSources,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
