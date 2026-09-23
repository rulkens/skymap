/** Filament overlay defaults, read from its SOURCE_REGISTRY row. */

import { Source, SOURCE_REGISTRY } from '../../../../data/sources';
import type { CosmicWebFilamentsSettings } from '../../../../@types/settings/CosmicWebFilamentsSettings';

export const initialState: CosmicWebFilamentsSettings = {
  enabled: SOURCE_REGISTRY[Source.Filaments].visible,
  intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
};
