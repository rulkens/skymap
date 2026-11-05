/**
 * SettingsPanel — the desktop settings HUD: the shared Panel chrome around
 * `SettingsSections`, with the Tier chip in the header strip.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import TierChipContainer from '../containers/TierChipContainer';
import { SettingsSections } from './SettingsSections';

export const SettingsPanel = memo(function SettingsPanel(): ReactNode {
  return (
    <Panel title="Settings" ariaLabel="Renderer settings" headerExtra={<TierChipContainer />}>
      <SettingsSections />
    </Panel>
  );
});
