import type { SourceType } from '../../../@types/data/SourceType';
import type { ViewSlotUniformRing } from '../../../@types/rendering/ViewSlotUniformRing';

/**
 * One loaded catalog's GPU resources, in `GALAXY_CATALOG_SOURCES` draw
 * order, as `galaxyPointRenderer.draw()` binds them. The CPU mirror stays
 * private to `catalogStore` — a draw pass has no business rewriting vertex
 * bytes.
 */
export type CatalogDrawEntry = {
  source: SourceType;
  count: number;
  vertexBuffer: GPUBuffer;
  fade: ViewSlotUniformRing;
  sourceBindGroup: GPUBindGroup;
};
