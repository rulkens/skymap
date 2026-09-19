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
import { layerUiContents } from '../../utils/layer/layerUiContents';
import TierChipContainer from '../containers/TierChipContainer';
import StarsSectionContainer from '../containers/StarsSectionContainer';
import CosmicWebSectionContainer from '../containers/CosmicWebSectionContainer';
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
      {layerUiContents(APP_COMPOSITION.layers, 'main').map((Section, index) => (
        <Section key={index} />
      ))}
      <StarsSectionContainer />
      <CosmicWebSectionContainer />
      <StructuresSectionContainer />
      <LabelsAndGuidesSectionContainer
        layerRows={layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides')}
      />
      <DisplaySectionContainer>
        <EarthSectionContainer />
      </DisplaySectionContainer>
    </Panel>
  );
});
