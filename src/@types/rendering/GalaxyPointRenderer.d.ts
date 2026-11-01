/**
 * GalaxyPointRenderer — public surface of the galaxy-catalog point renderer,
 * produced by `createGalaxyPointRenderer`. The pick renderer owns its own
 * uniform buffer, rebuilt at pick time (see `pickUniformBytesOf`).
 */

import type { Mat4 } from 'wgpu-matrix';
import type { SourceType } from '../data/SourceType';
import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyPointDrawSettings } from './GalaxyPointDrawSettings';
import type { GalaxyPointStats } from '../engine/GalaxyPointStats';
import type { Vec2 } from '../math/Vec2';

export type GalaxyPointRenderer = {
  /** Part of the shared `Renderer` contract (`Renderer.d.ts`). */
  readonly label: string;
  /** Pack a catalog into an interleaved GPU vertex buffer, replacing any previous one for `id`. */
  upload(id: GalaxyCatalogId, galaxyCatalog: GalaxyCatalog, stats: GalaxyPointStats): Promise<void>;
  /** Destroy the catalog's buffers and drop its entry. */
  unload(id: GalaxyCatalogId): void;
  /** Total number of points across every loaded source. */
  totalCount(): number;
  /** Every loaded source's GPU buffer in `Source` enum order; a fresh generator per call. */
  loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    /**
     * Per-source SourceUniforms buffer, written once at upload; the pick
     * renderer wraps it in its own @group(2) bind group.
     */
    sourceBuffer: GPUBuffer;
  }>;
  /** One instanced draw per visible source; no-op when nothing is loaded. */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    settings: GalaxyPointDrawSettings,
  ): void;
  /** Release every GPU resource this renderer owns. */
  destroy(): void;
};
