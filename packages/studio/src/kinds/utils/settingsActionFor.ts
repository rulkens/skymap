/**
 * The action a Set step dispatches for a kind and an on/off value, built with the app's own action
 * creators so the stored step is exactly what a hand-written `scene(...)` holds. Flow tuning carries
 * a knob patch, not an on/off, so it is not built here.
 */
import { setFlowEnabled } from '../../../../../src/layers/flow/state/flow/slice';
import { setGalaxyCatalogVisible } from '../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import { setLabelsFocusedOnly } from '../../../../../src/state/settings/core/labelsSlice';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';
import type { SettingKind } from '../../@types/kinds/SettingKind';

export function settingsActionFor(
  kind: Exclude<SettingKind, 'tuning'>,
  on: boolean,
  catalog: GalaxyCatalogId,
): SettingsAction {
  if (kind === 'flow') return setFlowEnabled(on);
  if (kind === 'labels') return setLabelsFocusedOnly(on);
  return setGalaxyCatalogVisible({ id: catalog, enabled: on });
}
