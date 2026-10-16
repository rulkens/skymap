import type { LayerSettingsRow } from '../../../@types/engine/layer/LayerSettingsRow';
import { selectMissionTrailsEnabled } from '../state/missionTrails/selectors';
import { setMissionTrailsEnabled } from '../state/missionTrails/slice';

/** The mission trails' on/off row in the shared "Labels & guides" section. */
export const missionTrailsSettingsRow: LayerSettingsRow = {
  id: 'toggle-mission-trails',
  label: 'Mission trails',
  select: selectMissionTrailsEnabled,
  set: setMissionTrailsEnabled,
};
