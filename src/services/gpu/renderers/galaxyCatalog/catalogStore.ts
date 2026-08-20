/**
 * CatalogStore — the per-catalog GPU resources behind the point pipeline.
 *
 * A loaded galaxy catalog is a small cluster of coupled things: the
 * interleaved vertex buffer, the CPU mirror of those bytes (so the
 * bias-correction subsystem can splice two slots and re-upload), the
 * per-source FadeUniforms buffer + bind group, and the per-source
 * SourceUniforms buffer + bind group carrying the 6-bit GPU identity.
 * They are created together at upload, destroyed together at unload, and
 * every one of them outlives the frame that drew them.
 *
 * That storage life-cycle is a different concern from the pipeline
 * life-cycle.  `galaxyPointRenderer` owns things that exist once and never
 * change — shader modules, the render pipeline, the per-frame `@group(0)`
 * uniform buffer — and things that are recomputed every frame (the fade
 * opacity write, the visibility mask gate).  The store owns things that
 * appear and disappear as the user switches tiers, arrive asynchronously
 * from a worker bake, and must survive a replace without leaking VRAM.
 * Braiding the two in one closure meant every question about the async
 * upload path ("does a parallel rebake stomp the fresh buffer?") had to
 * be answered while stepping over pipeline-descriptor code, and the
 * upload bookkeeping could not be tested without standing up a stub
 * pipeline.  The alternative — leaving it as one file and reaching into
 * the private map from `draw()` — is what we had; splitting on the
 * storage/pipeline seam is what lets `draw()` consume a plain iterator.
 *
 * The store deliberately keeps TWO projections of the same map:
 *
 *   - `loadedSources()` — the narrow feed the pick program consumes
 *     (vertex buffer + count + the raw SourceUniforms *buffer*, because
 *     `galaxyPickRenderer` builds its own bind group around those bytes with
 *     its own pipeline's layout — a bind group is not portable across
 *     pipelines).
 *   - `entries()` — the full draw-time record (fade buffer + both bind
 *     groups) so `galaxyPointRenderer.draw()` binds without reaching into
 *     store internals.
 *
 * Both iterate in `GALAXY_CATALOG_SOURCES` draw order, not upload order,
 * so back-to-front blending is stable regardless of which `.bin` landed
 * first.
 *
 *   GalaxyCatalog → upload(id, …) → worker bake → GPU buffers + bind groups
 *                                                      ↓
 *                     galaxyPointRenderer.draw() ← entries() / galaxyPickRenderer ← loadedSources()
 *
 * @module
 */

import type { GalaxyCatalog } from '../../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { SourceType } from '../../../../@types/data/SourceType';
import type { BuildPointInterleavedBufferInput } from '../../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../../@types/engine/BuildPointInterleavedBufferResult';
import type { FadeUniformsBgl } from '../../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../../@types/rendering/SourceUniformsBgl';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../../data/sources';
import { cloneGalaxyCatalogForTransfer } from '../../../../data/galaxyCatalog/galaxyCatalogTransfer';
import { runDisposableWorker } from '../../../../utils/worker/runDisposableWorker';
import { SLOTS_PER_GALAXY_POINT } from './galaxyPointVertexLayout';

// `?worker` emits the worker as a separate chunk and exports a class
// whose `new` spawns it.  The bake runs off-thread to dodge the
// 10-second main-thread freeze on .bin arrival.  Node-only tests
// can't resolve `?worker`; they inject a synchronous fallback through
// the factory's `buildRunner` param.
import BuildPointBufferWorker from '../../../engine/bake/buildPointInterleavedBuffer.worker?worker';

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

// ─── Source code ↔ catalog id resolution ──────────────────────────────────────
//
// The public key is the string `GalaxyCatalogId`, but the GPU-facing
// identity (the 6-bit `sourceCode` packed into the pick texture) and the
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
   * (`spliceSchechterRatios` etc.) can rewrite slots 10 / 11 of every
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
  /** Per-source SourceUniforms (6-bit sourceCode + pad) written once at upload. */
  sourceBuffer: GPUBuffer;
  sourceBindGroup: GPUBindGroup;
};

/**
 * One loaded catalog's GPU resources, in `GALAXY_CATALOG_SOURCES` draw
 * order, as `galaxyPointRenderer.draw()` binds them.  The CPU mirror stays
 * private to the store — a draw pass has no business rewriting vertex
 * bytes.
 */
export type CatalogDrawEntry = {
  source: SourceType;
  count: number;
  vertexBuffer: GPUBuffer;
  fadeBuffer: GPUBuffer;
  fadeBindGroup: GPUBindGroup;
  sourceBindGroup: GPUBindGroup;
};

/** The per-catalog GPU-resource store — see the module header. */
export type CatalogStore = {
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog): Promise<void>;
  unload(id: GalaxyCatalogId): void;
  setBiasUploadCallback(cb: ((source: SourceType, cloud: GalaxyCatalog) => void) | null): void;
  setBiasUnloadCallback(cb: ((source: SourceType) => void) | null): void;
  spliceSchechterRatios(source: SourceType, ratios: Float32Array): void;
  spliceAngularWeights(source: SourceType, weights: Float32Array): void;
  clearBiasOverlays(source?: SourceType): void;
  totalCount(): number;
  countOf(source: SourceType): number;
  hasCatalog(id: GalaxyCatalogId): boolean;
  /** Narrow public projection consumed by the pick program. */
  loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }>;
  /** Full per-source draw essentials, in draw order, for `galaxyPointRenderer.draw()`. */
  entries(): IterableIterator<CatalogDrawEntry>;
  destroy(): void;
};

/**
 * Allocate an empty store.  Everything it owns is created lazily, per
 * catalog, inside `upload`.
 *
 * A named bag rather than a positional list: the dependencies are opaque
 * handles (two of them structurally indistinguishable bind-group
 * layouts), so a mis-ordered call would typecheck and blow up later at
 * bind-group creation instead of at the call site.
 *
 * @param init.device       The WebGPU logical device. Owned by the caller.
 * @param init.fadeBgl      Canonical FadeUniforms layout — the per-source
 *                          `@group(1)` bind groups are built against it.
 * @param init.sourceBgl    Canonical SourceUniforms layout for `@group(2)`.
 * @param init.buildRunner  The vertex-buffer bake runner, defaulting to the
 *                          worker-spawning `defaultWorkerRunner`.  Injected
 *                          per store rather than swapped through a
 *                          module-global setter: a module-global is shared by
 *                          every instance in the process and leaks between
 *                          tests, so an override installed for one case
 *                          silently governs the next.
 */
export function createCatalogStore(init: {
  device: GPUDevice;
  fadeBgl: FadeUniformsBgl;
  sourceBgl: SourceUniformsBgl;
  buildRunner?: BuildRunner;
}): CatalogStore {
  const { device, fadeBgl, sourceBgl } = init;
  const buildRunner = init.buildRunner ?? defaultWorkerRunner;

  // Loaded galaxy catalog buffers keyed by GalaxyCatalogId.  Map preserves
  // insert order and keys on the stable string id (the same key domain the
  // volume renderer uses for its fields) rather than the numeric source code.
  const galaxyCatalogs = new Map<GalaxyCatalogId, LoadedSource>();

  // Optional callbacks invoked at the end of `upload` / `unload`.  The
  // bias-correction subsystem installs them so a per-source bake fires
  // when a new source arrives mid-mode.  Uni-directional: the store
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
    // The store only handles galaxy catalog sources; the registry
    // entry for this id carries the numeric source code, per-source
    // sbBoost + falloffHalfMpc, and the discriminant we narrow on.
    const source = CODE_OF_ID.get(id);
    if (source === undefined) {
      throw new Error(`catalogStore cannot upload unknown galaxy catalog id '${id}'`);
    }
    const entry = SOURCE_REGISTRY[source];
    if (entry.type !== 'galaxyCatalog') {
      throw new Error(
        `catalogStore cannot upload non-galaxy catalog id '${id}' (type=${entry.type})`,
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
    // The store always uploads in 'fast' mode; the bias-correction
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

    // SourceUniforms: 6-bit sourceCode + per-source sbBoost +
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
    sourceF32[1] = entry.sbBoost;
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
      entry.interleaved[i * SLOTS_PER_GALAXY_POINT + 10] = ratios[i]!;
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
      entry.interleaved[i * SLOTS_PER_GALAXY_POINT + 11] = weights[i]!;
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
        entry.interleaved[i * SLOTS_PER_GALAXY_POINT + 10] = 0;
        entry.interleaved[i * SLOTS_PER_GALAXY_POINT + 11] = 0;
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

  /**
   * Draw-order iteration with the bind groups attached.  Same order and
   * same skip-the-unloaded rule as `loadedSources()`; the extra fields
   * exist only so the draw pass never has to know the shape of the
   * private map.
   */
  function* entriesGen(): IterableIterator<CatalogDrawEntry> {
    for (const { code, id } of CATALOG_DRAW_ORDER) {
      const entry = galaxyCatalogs.get(id);
      if (!entry) continue;
      yield {
        source: code,
        count: entry.count,
        vertexBuffer: entry.buffer,
        fadeBuffer: entry.fadeBuffer,
        fadeBindGroup: entry.fadeBindGroup,
        sourceBindGroup: entry.sourceBindGroup,
      };
    }
  }
  function entries(): IterableIterator<CatalogDrawEntry> {
    return entriesGen();
  }

  /**
   * Release every per-source GPU buffer and forget the catalogs.  Only
   * `GPUBuffer` / `GPUTexture` need an explicit `destroy()` — they own
   * VRAM that JS GC alone won't release; bind groups are JS-side handles
   * that GC reclaims.
   *
   * Idempotent: `GPUBuffer.destroy()` is a no-op the second time and the
   * map is cleared, so overlapping teardowns (HMR mid-StrictMode remount)
   * are safe.
   */
  function destroy(): void {
    for (const entry of galaxyCatalogs.values()) {
      entry.buffer.destroy();
      entry.fadeBuffer.destroy();
      entry.sourceBuffer.destroy();
    }
    galaxyCatalogs.clear();
  }

  return {
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
    entries,
    destroy,
  };
}
