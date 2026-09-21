/** Filament overlay defaults, read from its SOURCE_REGISTRY row. */

import { Source, SOURCE_REGISTRY } from '../../../../data/sources';
import type { FilamentsSettings } from '../../../../@types/settings/FilamentsSettings';

export const initialState: FilamentsSettings = {
  enabled: SOURCE_REGISTRY[Source.Filaments].visible,
  intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
};
