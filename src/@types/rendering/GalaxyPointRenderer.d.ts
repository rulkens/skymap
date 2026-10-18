/**
 * GalaxyPointRenderer — public surface of the galaxy-catalog point renderer.
 *
 * Produced by the closure factory `createGalaxyPointRenderer`.
 * `loadedSources` returns a fresh generator on each call.
 * Consumers: engine, frame body.
 * The pick renderer no longer shares the uniform buffer — it owns its
 * own GPU buffer and rebuilds the packed bytes at pick time from the
 * slab view (see `pickUniformBytesOf`).
 */

import type { Mat4 } from 'wgpu-matrix';
import type { SourceType } from '../data/SourceType';
import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyPointDrawSettings } from './GalaxyPointDrawSettings';
import type { GalaxyPointStats } from '../engine/GalaxyPointStats';
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
   * by field id), with the record source's `stats`.  Replaces any previous
   * buffer for that catalog.  See
   * the factory body for the off-thread bake / race-condition rationale.
   */
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog, stats: GalaxyPointStats): Promise<void>;
  /** Destroy the catalog's buffers and drop its entry. */
  unload(id: GalaxyCatalogId): void;
  /** Total number of points across every loaded source. */
  totalCount(): number;
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
