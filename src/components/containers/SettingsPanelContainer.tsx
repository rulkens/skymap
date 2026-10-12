/**
 * SettingsPanelContainer — App-boundary for `SettingsPanel`. Not a store
 * subscription: the panel and its section containers own their settings reach.
 */

import { memo } from 'react';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';

export type SettingsPanelContainerProps = {
  /** Render without the collapsible card (the phone sheet owns the surface). */
  readonly bare?: boolean;
};

function SettingsPanelContainer({ bare }: SettingsPanelContainerProps): React.ReactElement {
  return <SettingsPanel bare={bare} />;
}

export default memo(SettingsPanelContainer);
