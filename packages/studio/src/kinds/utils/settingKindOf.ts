import { setFlow, setFlowEnabled } from '../../../../../src/layers/flow/state/flow/slice';
import { setGalaxyCatalogVisible } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';
import type { SettingKind } from '../../@types/kinds/SettingKind';

export function settingKindOf(action: SettingsAction): SettingKind {
  if (setFlowEnabled.match(action)) return 'flow';
  if (setFlow.match(action)) return 'tuning';
  if (setGalaxyCatalogVisible.match(action)) return 'catalog';
  return 'labels';
}
