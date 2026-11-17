import type { HiiTier } from '../../starFormation/@types/HiiTier';
import type { FieldBindGroups } from './FieldBindGroups';
import type { FieldBindGroupResources } from './FieldBindGroupResources';

export type FieldPipelines = {
  readonly fieldSplatPipe: GPURenderPipeline;
  readonly hiiYoungPipe: GPURenderPipeline;
  readonly hiiErosionPipe: GPURenderPipeline;
  readonly hiiExtrasPipe: GPURenderPipeline;
  readonly dustMapPipe: GPURenderPipeline;
  readonly dustPresentPipe: GPURenderPipeline;
  /** Which pipeline draws a given HII tier — see its own doc below. */
  hiiTierPipeline(kind: HiiTier): GPURenderPipeline;

  /**
   * Rebuild every bind group whose declared inputs' IDENTITY moved since the
   * last call; return the full set. Idempotent and cheap — called at the top
   * of every `encode`.
   */
  sync(resources: FieldBindGroupResources): FieldBindGroups;
};
