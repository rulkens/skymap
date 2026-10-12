/**
 * SettingsPanel — presentational shell for the renderer settings HUD panel.
 *
 * Renders the composed Layers' own `ui` sections (in composition order, D13),
 * then the four core section containers, wrapped in the shared Panel chrome.
 * Zero store reach lives here — every selector and dispatch call belongs to
 * the containers/Layers this shell renders.
 */

import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import { APP_COMPOSITION } from '../../compositions/app';
import { layerUiContents } from '../../utils/layer/layerUiContents';
import TierChipContainer from '../containers/TierChipContainer';
import LabelsAndGuidesSectionContainer from '../containers/LabelsAndGuidesSectionContainer';
import DisplaySectionContainer from '../containers/DisplaySectionContainer';
import EarthSectionContainer from '../containers/EarthSectionContainer';

// ── Props ──────────────────────────────────────────────────────────────────────

type SettingsPanelProps = {
  /** Render without the collapsible card, for hosts that own the surface. */
  bare?: boolean;
};

// ── SettingsPanel ──────────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel({ bare }: SettingsPanelProps): ReactNode {
  const mainSections = useMemo(() => layerUiContents(APP_COMPOSITION.layers, 'main'), []);
  const labelsAndGuidesRows = useMemo(
    () => layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides'),
    [],
  );
  return (
    <Panel
      title="Settings"
      ariaLabel="Renderer settings"
      bare={bare}
      headerExtra={<TierChipContainer />}
    >
      {mainSections.map((Section, index) => (
        <Section key={index} />
      ))}
      <LabelsAndGuidesSectionContainer layerRows={labelsAndGuidesRows} />
      <DisplaySectionContainer>
        <EarthSectionContainer />
      </DisplaySectionContainer>
    </Panel>
  );
});
