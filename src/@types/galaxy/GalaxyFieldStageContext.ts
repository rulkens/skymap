/**
 * GalaxyFieldStageContext — everything a `GALAXY_FIELD_STAGES` row, a dispatch
 * builder or the probe reads. Built afresh per `graph.run` call, so `input` is
 * a value rather than a getter: `setMixture` reassigns the renderer's own
 * record, and a stage that closed over the old one would key on a stale galaxy.
 */
import type { GrowOnlyRecordBuffer } from '../../services/gpu/renderers/galaxyField/gpu/createGrowOnlyRecordBuffer';
import type { IsmMapChain } from '../../services/gpu/renderers/galaxyField/ismMap/createIsmMapChain';
import type { GalaxyFieldMixtureInput } from './GalaxyFieldMixtureInput';
import type { GalaxyFieldModel } from './GalaxyFieldModel';
import type { GalaxyFieldRendererDeps } from './GalaxyFieldRendererDeps';

export type GalaxyFieldStageContext = {
  readonly device: GPUDevice;
  readonly input: GalaxyFieldMixtureInput;
  readonly chain: IsmMapChain;
  readonly fieldComps: GrowOnlyRecordBuffer;
  readonly hiiComps: GrowOnlyRecordBuffer;
  readonly model: GalaxyFieldModel;
  readonly hooks: Pick<GalaxyFieldRendererDeps, 'onIsmMapRebuilt' | 'onOrientationRebuilt'>;
};
