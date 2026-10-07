import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCutDraw } from './StarCutDraw';

/**
 * What the pick renderer shares with the visual star renderer: the three bind
 * group layouts (its pipeline is group-equivalent), each source's records bind
 * group, and the frame cut's leaf list. The lookups are live functions: a tier
 * swap unloads and reloads a source.
 */
export type StarCatalogPickResources = {
  readonly cameraBgl: GPUBindGroupLayout;
  /** `@group(1)`: the GPU cut's node table, fades and one draw list. */
  readonly drawBgl: GPUBindGroupLayout;
  readonly recordsBgl: GPUBindGroupLayout;
  /** `null` when the source has no catalog. */
  recordsBindGroup(source: SourceType): GPUBindGroup | null;
  /** The frame cut's leaf list; `null` until a frame has cut the source. */
  leafDraw(source: SourceType): StarCutDraw | null;
};
