import type { LayerSettingsRow } from '../../../@types/engine/layer/LayerSettingsRow';
import { selectConstellationsEnabled } from '../state/constellations/selectors';
import { setConstellationsEnabled } from '../state/constellations/slice';

/** The constellation stick figures' on/off row in the shared "Labels & guides" section. */
export const constellationsSettingsRow: LayerSettingsRow = {
  id: 'toggle-constellations',
  label: 'Constellations',
  select: selectConstellationsEnabled,
  set: setConstellationsEnabled,
};
