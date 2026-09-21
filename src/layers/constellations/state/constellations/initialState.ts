/**
 * Constellation stick-figure overlay, read from the registry constellations
 * row (same pattern as `filaments`) so that entry stays the single source of
 * truth for the default-visible gate + intensity.
 */

import { Source, SOURCE_REGISTRY } from '../../../../data/sources';
import type { ConstellationsSettings } from '../../../../@types/settings/ConstellationsSettings';

export const initialState: ConstellationsSettings = {
  enabled: SOURCE_REGISTRY[Source.Constellations].visible,
  intensity: SOURCE_REGISTRY[Source.Constellations].intensity,
};
