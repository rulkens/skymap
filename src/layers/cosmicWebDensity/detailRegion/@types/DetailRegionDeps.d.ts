import type { VolumeFieldRenderer } from '../../../../@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityFieldId } from '../../@types/CosmicWebDensityFieldId';

/** What one field's detail region is built from. */
export type DetailRegionDeps = {
  readonly device: GPUDevice;
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly requestRender: () => void;
  readonly id: CosmicWebDensityFieldId;
  readonly binBaseName: string;
  /** K, from the tier. */
  readonly bricksPerAxis: number;
};
