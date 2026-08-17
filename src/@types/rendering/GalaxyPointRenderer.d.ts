/**
 * GalaxyPointRenderer — public surface of the galaxy-catalog point renderer.
 *
 * Produced by the closure factory `createGalaxyPointRenderer`.
 * `loadedSources` returns a fresh generator on each call.
 * Consumers: engine, frame body, bias-correction subsystem.
 * The pick renderer no longer shares the uniform buffer — it owns its
 * own GPU buffer and rebuilds the packed bytes at pick time from the
 * slab view (see `pickUniformBytesOf`).
 */

import type { Mat4 } from 'wgpu-matrix';
import type { SourceType } from '../data/SourceType';
import type { GalaxyCatalog } from '../data/GalaxyCatalog';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyPointDrawSettings } from './GalaxyPointDrawSettings';
import type { Vec2 } from '../math/Vec2';

export type GalaxyPointRenderer = {
  /**
   * Human-readable identifier (`'galaxyPointRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Pack a `GalaxyCatalog` into an interleaved GPU vertex buffer for the
   * given catalog id (mirroring `volumeFieldRenderer.upload`, which keys
   * by field id).  Replaces any previous buffer for that catalog.  See
   * the factory body for the off-thread bake / race-condition rationale.
   */
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog): Promise<void>;
  /**
   * Remove a catalog's GPU vertex buffer and reclaim its VRAM.  No-op
   * if the catalog was never uploaded.
   */
  unload(id: GalaxyCatalogId): void;
  /**
   * Install the upload-tail callback used by the bias-correction
   * subsystem.  Pass `null` to detach.  Idempotent.
   */
  setBiasUploadCallback(cb: ((source: SourceType, cloud: GalaxyCatalog) => void) | null): void;
  /** Install the unload-tail callback for the bias-correction subsystem. */
  setBiasUnloadCallback(cb: ((source: SourceType) => void) | null): void;
  /** Splice per-row Schechter ratios into slot 9 of the source's interleaved mirror. */
  spliceSchechterRatios(source: SourceType, ratios: Float32Array): void;
  /** Splice per-row HEALPix angular weights into slot 10. */
  spliceAngularWeights(source: SourceType, weights: Float32Array): void;
  /** Zero slots 9 + 10 for one source or every loaded source. */
  clearBiasOverlays(source?: SourceType): void;
  /** Total number of points across every loaded source. */
  totalCount(): number;
  /** Per-source point count, or 0 when the source isn't loaded. */
  countOf(source: SourceType): number;
  /** True when the catalog's buffer is committed — the survey fade row's guard reads this. */
  hasCatalog(id: GalaxyCatalogId): boolean;
  /**
   * Iterate over every loaded source's GPU buffer in `Source` enum order.
   * The iterable is generated fresh on each call.
   */
  loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    /**
     * The per-source SourceUniforms GPU buffer (16 bytes — sourceCode
     * u32 + 12 bytes pad). GalaxyPickRenderer builds its OWN per-source
     * @group(2) bind group around this buffer using the canonical
     * sourceUniformsBgl layout (shared with the visual pipeline). The
     * underlying GPUBuffer is shared; GalaxyPickRenderer's bind group is
     * just a per-pipeline view of the same bytes.
     *
     * The buffer is written ONCE at upload time (sourceCode never
     * changes for a given source) and read by both the visual and
     * pick pipelines on every draw.
     */
    sourceBuffer: GPUBuffer;
  }>;
  /**
   * Issue one instanced draw call per visible source.  No-op when no
   * catalogs are loaded.  The pick pass rebuilds its own uniform bytes at
   * pick time from the slab view (see `pickUniformBytesOf`), so this draw
   * owns no cross-pass snapshot.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: GalaxyPointDrawSettings,
  ): void;
  /** Release every GPU resource this renderer owns. */
  destroy(): void;
};
