import type { LayerSettingsRow } from '../../../@types/engine/layer/LayerSettingsRow';
import { selectZoneOfAvoidanceEnabled } from '../state/zoneOfAvoidance/selectors';
import { setZoneOfAvoidanceEnabled } from '../state/zoneOfAvoidance/slice';

/** The zone-of-avoidance band's on/off row in the shared "Labels & guides" section. */
export const zoneOfAvoidanceSettingsRow: LayerSettingsRow = {
  id: 'toggle-zone-of-avoidance',
  label: 'Zone of Avoidance',
  select: selectZoneOfAvoidanceEnabled,
  set: setZoneOfAvoidanceEnabled,
};
