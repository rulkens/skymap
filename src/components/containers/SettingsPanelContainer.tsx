/**
 * SettingsPanelContainer — App-boundary for `SettingsPanel`'s mount-time
 * viewport read.
 *
 * This is not a store subscription: `SettingsPanel` and its section
 * containers own all their own settings reach internally. The one thing App
 * used to carry on its behalf was the one-shot `useInitialMobile` viewport
 * sample that seeds `defaultOpen`; hoisting it here keeps App purely
 * structural.
 */

import { memo } from 'react';
import { SettingsPanel } from '../SettingsPanel/SettingsPanel';
import { useInitialMobile } from '../../hooks/useInitialMobile';

export type SettingsPanelContainerProps = {
  /** Render without the collapsible card (the phone sheet owns the surface). */
  readonly bare?: boolean;
};

function SettingsPanelContainer({ bare }: SettingsPanelContainerProps): React.ReactElement {
  const initialMobile = useInitialMobile();
  return <SettingsPanel defaultOpen={!initialMobile} bare={bare} />;
}

export default memo(SettingsPanelContainer);
