/**
 * SettingsPanel — presentational shell for the renderer settings HUD panel.
 *
 * ### Role of this component
 *
 * Composes the seven section containers (Tasks 3–9) into the correct
 * section order and wraps them in the shared Panel chrome. Zero store
 * reach lives here — every selector and dispatch call belongs to the
 * containers this shell renders.
 *
 * ### Section order (from the 2026-05-19 UX audit)
 *
 * The order mirrors the explorer's mental model of the scene:
 *
 *   1. **Galaxies** — the points themselves.
 *   2. **Cosmic web** — the diffuse matter between galaxies (volumes + filaments).
 *   3. **Flow** — CF4++ peculiar-velocity overlay, sibling of Cosmic web.
 *   4. **Structures** — clusters / superclusters / voids as marker rings.
 *   5. **Labels & Guides** — every text annotation (cluster names, "you are
 *      here", …) plus the overlay guide toggles (constellation stick figures,
 *      orbit trails).
 *   6. **Display** — power-user tone-curve disclosure (default closed).
 *
 * ### Props
 *
 * One prop remains, beyond the Redux store's reach:
 *
 *   - `defaultOpen` — initial Panel open/closed state (false on mobile viewports).
 *
 * Engine counts (`sourceCounts`, `structureCounts`) are now read directly in
 * `GalaxiesSectionContainer` and `StructuresSectionContainer` via the engine
 * Redux slice selectors, so they no longer pass through this shell.
 *
 * ### Tier chip
 *
 * `TierChipContainer` sits in the Panel header strip via `headerExtra` — always
 * visible without consuming a panel-body row. The container owns its own store
 * reach (tier read + requestTier dispatch).
 *
 * ### Layout CSS
 *
 * Row/slider/dropdown styling lives in `SettingsPanel.module.css`; panel chrome
 * lives in the shared `Panel` / `Panel.module.css`.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import { Panel } from '../common/Panel/Panel';
import TierChipContainer from '../containers/TierChipContainer';
import GalaxiesSectionContainer from '../containers/GalaxiesSectionContainer';
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
      <GalaxiesSectionContainer />
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
