import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';

/** One volume field's settings, plus its id and display label, for the SettingsPanel. */
export type VolumeFieldRowData = Omit<VolumeFieldSettings, 'bands'> & {
  readonly id: CosmicWebDensityFieldId;
  readonly label: string;
};
