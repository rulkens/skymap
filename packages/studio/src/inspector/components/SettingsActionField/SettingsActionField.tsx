import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import PickField from '../../../primitives/components/PickField/PickField';
import ReadoutField from '../../../primitives/components/ReadoutField/ReadoutField';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import { settingKindOf } from '../../../kinds/utils/settingKindOf';
import { settingsActionFor } from '../../../kinds/utils/settingsActionFor';
import { describeSettingsAction } from '../../../kinds/utils/describeSettingsAction';
import {
  CATALOG_OPTIONS,
  ON_OFF_OPTIONS,
  SETTING_OPTIONS,
  TUNING_OPTION,
} from './SettingsActionField.constants';
import { setGalaxyCatalogVisible } from '../../../../../../src/layers/galaxyCatalog/state/galaxyCatalogs/slice';
import type { GalaxyCatalogId } from '../../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { SettingsAction } from '../../../../../../src/compositions/@types/SettingsAction';
import type { SettingKind } from '../../../@types/kinds/SettingKind';

type Props = {
  readonly action: SettingsAction;
  readonly onChange: (action: SettingsAction) => void;
};

/**
 * A Set step as rows of the inspector's grid: which setting, the catalog when it is one, and on or
 * off. Switching the setting keeps the on/off, so Flow on becomes Focused labels on.
 */
function SettingsActionField({ action, onChange }: Props) {
  const kind = settingKindOf(action);
  const catalog: GalaxyCatalogId = setGalaxyCatalogVisible.match(action)
    ? action.payload.id
    : CATALOG_OPTIONS[0]!.value;
  const on =
    typeof action.payload === 'boolean'
      ? action.payload
      : 'enabled' in action.payload && action.payload.enabled === true;
  const set = (next: SettingKind, nextOn: boolean, nextCatalog: GalaxyCatalogId) => {
    if (next !== 'tuning') onChange(settingsActionFor(next, nextOn, nextCatalog));
  };

  return (
    <>
      <InspectorRow label="Setting">
        <PickField
          label="Setting"
          value={kind}
          options={kind === 'tuning' ? [...SETTING_OPTIONS, TUNING_OPTION] : SETTING_OPTIONS}
          onChange={(v) => set(v as SettingKind, on, catalog)}
        />
      </InspectorRow>
      {kind === 'catalog' && (
        <InspectorRow label="Catalog">
          <PickField
            label="Catalog"
            value={catalog}
            options={CATALOG_OPTIONS}
            onChange={(v) => set(kind, on, v as GalaxyCatalogId)}
          />
        </InspectorRow>
      )}
      <InspectorRow label="Value">
        {kind === 'tuning' ? (
          <ReadoutField>{describeSettingsAction(action)}</ReadoutField>
        ) : (
          <SegmentedField
            label="Value"
            value={on ? 'on' : 'off'}
            options={ON_OFF_OPTIONS}
            onChange={(v) => set(kind, v === 'on', catalog)}
          />
        )}
      </InspectorRow>
    </>
  );
}

export default SettingsActionField;
