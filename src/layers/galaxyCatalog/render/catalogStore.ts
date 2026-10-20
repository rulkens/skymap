/**
 * CatalogStore — the per-catalog GPU resources behind the point pipeline: the
 * interleaved vertex buffer plus the per-source FadeUniforms and SourceUniforms
 * buffers and bind groups, created together at upload and destroyed together at
 * unload. Split from `galaxyPointRenderer` on the storage/pipeline seam so the
 * async upload bookkeeping is testable without a stub pipeline.
 *
 * Two projections of one map: `loadedSources()` is the narrow pick feed (the raw
 * SourceUniforms buffer, since a bind group is not portable across pipelines);
 * `entries()` is the full draw record. Both iterate in `GALAXY_CATALOG_SOURCES`
 * order, not upload order, so back-to-front blending is stable.
 *
 * @module
 */

import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { SourceType } from '../../../@types/data/SourceType';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';
import type { GalaxyPointStats } from '../../../@types/engine/GalaxyPointStats';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';
import type { CatalogDrawEntry } from '../@types/CatalogDrawEntry';
import type { CatalogStore } from '../@types/CatalogStore';
import type { BuildRunner } from '../@types/BuildRunner';
import type { LoadedSource } from '../@types/LoadedSource';
import { GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../data/sources';
import { cloneGalaxyCatalogForTransfer } from '../../../data/galaxyCatalog/galaxyCatalogTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';
import { createViewSlotUniformRing } from '../../../utils/gpu/createViewSlotUniformRing';

// The bake runs off-thread to dodge a 10 s main-thread freeze on .bin arrival.
// Node-only tests can't resolve `?worker`; they inject `buildRunner` instead.
import BuildPointBufferWorker from '../../../services/engine/bake/buildPointInterleavedBuffer.worker?worker';

/**
 * Off-thread bake runner: one worker per call, because parallel catalog fetches
 * resolve in unpredictable order and spawn cost (a few ms) is dwarfed by the
 * 1–4 s bake. The cloud is copied before transfer, since transferring detaches
 * the original buffers the picker and InfoCard still read (~50 ms for 100 MB,
 * versus a multi-second structured clone).
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

// The public key is the string `GalaxyCatalogId`; the GPU-facing `sourceCode`
// and the draw order are numeric. Both derive from `SOURCE_REGISTRY`.

/** String `GalaxyCatalogId` → numeric `Source` code. */
const CODE_OF_ID = new Map<GalaxyCatalogId, SourceType>(
  GALAXY_CATALOG_SOURCES.map((code) => [SOURCE_REGISTRY[code].id as GalaxyCatalogId, code]),
);

/** Draw order paired with string ids: keys the id-keyed map while emitting the numeric `sourceCode`. */
const CATALOG_DRAW_ORDER: readonly { code: SourceType; id: GalaxyCatalogId }[] =
  GALAXY_CATALOG_SOURCES.map((code) => ({
    code,
    id: SOURCE_REGISTRY[code].id as GalaxyCatalogId,
  }));

/**
 * Allocate an empty store; everything is created lazily per catalog in `upload`.
 *
 * A named bag, not positional: the two bind-group layouts are structurally
 * indistinguishable, so a mis-ordered call would typecheck and fail late.
 * `buildRunner` is injected per store because a module-global override leaks
 * between tests.
 */
export function createCatalogStore(init: {
  device: GPUDevice;
  fadeBgl: FadeUniformsBgl;
  sourceBgl: SourceUniformsBgl;
  buildRunner?: BuildRunner;
}): CatalogStore {
  const { device, fadeBgl, sourceBgl } = init;
  const buildRunner = init.buildRunner ?? defaultWorkerRunner;

  const galaxyCatalogs = new Map<GalaxyCatalogId, LoadedSource>();

  /** Free the catalog's GPU buffers and forget it; a no-op for one never uploaded. */
  function unload(id: GalaxyCatalogId): void {
    const source = CODE_OF_ID.get(id);
    if (source === undefined) {
      throw new Error(`catalogStore cannot unload unknown galaxy catalog id '${id}'`);
    }
    const stale = galaxyCatalogs.get(id);
    if (stale) {
      stale.buffer.destroy();
      stale.fade.destroy();
      stale.sourceBuffer.destroy();
    }
    galaxyCatalogs.delete(id);
  }

  /**
   * Bake `galaxyCatalog` into a GPU vertex buffer for `id`, replacing any
   * previous one. Freeing a catalog is `unload`'s job, not an empty upload's.
   *
   * Parallel uploads of one catalog are last-writer-wins and leak nothing:
   * each reads `prev` only after its own bake resolves, so the later one
   * destroys the earlier one's buffers. The asset slot serializes commits
   * anyway, so the case needs a caller outside it.
   */
  async function upload(
    id: GalaxyCatalogId,
    galaxyCatalog: GalaxyCatalog,
    stats: GalaxyPointStats,
  ): Promise<void> {
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

    const result = await buildRunner({ cloud: galaxyCatalog, source, stats });
    const { interleaved } = result;

    const prev = galaxyCatalogs.get(id);
    if (prev) {
      prev.buffer.destroy();
      prev.fade.destroy();
      prev.sourceBuffer.destroy();
    }

    const buffer = device.createBuffer({
      label: `points-vertex-buffer-${id}`,
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, interleaved);

    const fade = createViewSlotUniformRing({
      device,
      label: `points-fade-${id}`,
      byteSize: 16,
      layout: fadeBgl,
    });

    // Constant per source, so written once; layout in lib/sourceUniforms.wesl.
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
      fade,
      sourceBuffer,
      sourceBindGroup,
    });
  }

  /** Total points across every loaded catalog — drives the status-bar count. */
  function totalCount(): number {
    let total = 0;
    for (const entry of galaxyCatalogs.values()) total += entry.count;
    return total;
  }

  /** Fresh iterator per call, so a caller may `unload()` between iterations. */
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

  /** `loadedSources()` order with the bind groups attached. */
  function* entriesGen(): IterableIterator<CatalogDrawEntry> {
    for (const { code, id } of CATALOG_DRAW_ORDER) {
      const entry = galaxyCatalogs.get(id);
      if (!entry) continue;
      yield {
        source: code,
        count: entry.count,
        vertexBuffer: entry.buffer,
        fade: entry.fade,
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
      entry.fade.destroy();
      entry.sourceBuffer.destroy();
    }
    galaxyCatalogs.clear();
  }

  return {
    upload,
    unload,
    totalCount,
    loadedSources,
    entries,
    destroy,
  };
}
