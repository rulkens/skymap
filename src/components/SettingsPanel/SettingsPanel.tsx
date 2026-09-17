/**
 * SettingsPanel — presentational shell for the renderer settings HUD panel.
 *
 * Renders the composed Layers' own `ui` sections (in composition order, D13),
 * then the seven core section containers, wrapped in the shared Panel chrome.
 * Zero store reach lives here — every selector and dispatch call belongs to
 * the containers/Layers this shell renders. `defaultOpen` is the one prop
 * beyond the Redux store's reach (false on mobile viewports).
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import { APP_COMPOSITION } from '../../compositions/app';
import type { Layer } from '../../@types/engine/layer/Layer';
import TierChipContainer from '../containers/TierChipContainer';
import StarsSectionContainer from '../containers/StarsSectionContainer';
import CosmicWebSectionContainer from '../containers/CosmicWebSectionContainer';
import FlowSectionContainer from '../containers/FlowSectionContainer';
import StructuresSectionContainer from '../containers/StructuresSectionContainer';
import LabelsAndGuidesSectionContainer from '../containers/LabelsAndGuidesSectionContainer';
import DisplaySectionContainer from '../containers/DisplaySectionContainer';
import EarthSectionContainer from '../containers/EarthSectionContainer';

// ── Props ──────────────────────────────────────────────────────────────────────

type SettingsPanelProps = {
  /** Initial Panel open/closed state. App passes `false` on mobile viewports. */
  defaultOpen?: boolean;
};

// ── SettingsPanel ──────────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel({
  defaultOpen,
}: SettingsPanelProps): ReactNode {
  return (
    <Panel
      title="Settings"
      ariaLabel="Renderer settings"
      defaultOpen={defaultOpen}
      headerExtra={<TierChipContainer />}
    >
      {APP_COMPOSITION.layers.map((layer: Layer<string, unknown>) => {
        const Settings = layer.ui?.settings;
        return Settings ? <Settings key={layer.name} /> : null;
      })}
      <StarsSectionContainer />
      <CosmicWebSectionContainer />
      <FlowSectionContainer />
      <StructuresSectionContainer />
      <LabelsAndGuidesSectionContainer />
      <DisplaySectionContainer>
        <EarthSectionContainer />
      </DisplaySectionContainer>
    </Panel>
  );
});
