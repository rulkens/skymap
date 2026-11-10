/** A scene step's settings action as a row value: `flow on`, `flow tuned`, `sdss off`, `labels focused`. */
import { setFlow, setFlowEnabled } from '../../../../../src/layers/flow/state/flow/slice';
import { setGalaxyCatalogVisible } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setLabelsFocusedOnly } from '../../../../../src/state/settings/core/labelsSlice';
import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';

export function describeSettingsAction(action: SettingsAction): string {
  if (setFlowEnabled.match(action)) return `flow ${action.payload ? 'on' : 'off'}`;
  if (setFlow.match(action)) return 'flow tuned';
  if (setGalaxyCatalogVisible.match(action)) {
    return `${action.payload.id} ${action.payload.enabled ? 'on' : 'off'}`;
  }
  return setLabelsFocusedOnly.match(action) && action.payload ? 'labels focused' : 'labels all';
}
