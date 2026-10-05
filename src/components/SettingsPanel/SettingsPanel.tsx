/**
 * SettingsPanel — presentational shell for the renderer settings HUD panel.
 *
 * Renders the composed Layers' own `ui` sections (in composition order, D13),
 * then the five core section containers, wrapped in the shared Panel chrome.
 * Zero store reach lives here — every selector and dispatch call belongs to
 * the containers/Layers this shell renders. `defaultOpen` is the one prop
 * beyond the Redux store's reach (false on mobile viewports).
 */

import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import { APP_COMPOSITION } from '../../compositions/app';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import TierChipContainer from '../containers/TierChipContainer';
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
  const mainSections = useMemo(() => layerUiContents(APP_COMPOSITION.layers, 'main'), []);
  const labelsAndGuidesRows = useMemo(
    () => layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides'),
    [],
  );
  return (
    <Panel
      title="Settings"
      ariaLabel="Renderer settings"
      defaultOpen={defaultOpen}
      headerExtra={<TierChipContainer />}
    >
      {mainSections.map((Section, index) => (
        <Section key={index} />
      ))}
      <StructuresSectionContainer />
      <LabelsAndGuidesSectionContainer layerRows={labelsAndGuidesRows} />
      <DisplaySectionContainer>
        <EarthSectionContainer />
      </DisplaySectionContainer>
    </Panel>
  );
});
