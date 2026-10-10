import type { LayerSettingsRow } from '../../../@types/engine/layer/LayerSettingsRow';
import { selectLightTimeEnabled } from '../state/lightTime/selectors';
import { setLightTimeEnabled } from '../state/lightTime/slice';

/** The light-time spheres' on/off row in the shared "Labels & guides" section. */
export const lightTimeSettingsRow: LayerSettingsRow = {
  id: 'toggle-light-time-spheres',
  label: 'Light-time spheres',
  select: selectLightTimeEnabled,
  set: setLightTimeEnabled,
};
