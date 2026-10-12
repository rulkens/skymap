/**
 * SettingsPanelContainer — App-boundary for `SettingsPanel`. Not a store
 * subscription: the panel and its section containers own their settings reach.
 */

import { memo } from 'react';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';

function SettingsPanelContainer(): React.ReactElement {
  return <SettingsPanel />;
}

export default memo(SettingsPanelContainer);
