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
 *   5. **Labels** — every text annotation (cluster names, "you are here", …).
 *   6. **Display** — power-user tone-curve disclosure (default closed).
 *
 * ### Props
 *
 * Only the four props that cannot be sourced from the Redux store are
 * threaded through here:
 *
 *   - `defaultOpen` — initial Panel open/closed state (false on mobile viewports).
 *   - `sourceCounts` — per-source loaded point counts from the engine's async
 *     catalog-landing events; passed to GalaxiesSectionContainer, which forwards
 *     them to GalaxiesSection for the "N" badge next to each catalog toggle.
 *   - `structureCounts` — per-category structure counts from the engine; same
 *     pattern as sourceCounts for the Structures section badges.
 *   - `onResetCamera` — called when the user clicks "Reset camera"; wired in App
 *     to `handleRef.current?.camera.focusOnHome()`.
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
import type { SourceType } from '../../@types/data/SourceType';
import type { StructureId } from '../../@types/data/structure/StructureId';
import { Panel } from '../common/Panel/Panel';
import Button from '../common/Button/Button';
import TierChipContainer from '../containers/TierChipContainer';
import GalaxiesSectionContainer from '../containers/GalaxiesSectionContainer';
import CosmicWebSectionContainer from '../containers/CosmicWebSectionContainer';
import FlowSectionContainer from '../containers/FlowSectionContainer';
import StructuresSectionContainer from '../containers/StructuresSectionContainer';
import LabelsSectionContainer from '../containers/LabelsSectionContainer';
import DisplaySectionContainer from '../containers/DisplaySectionContainer';
import styles from './SettingsPanel.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

type SettingsPanelProps = {
  /** Initial Panel open/closed state. App passes `false` on mobile viewports. */
  defaultOpen?: boolean;
  /**
   * Per-source loaded point counts. Comes from the engine's async catalog-
   * landing events, not the Redux store — forwarded to GalaxiesSectionContainer.
   */
  sourceCounts?: Partial<Record<SourceType, number>>;
  /**
   * Per-category loaded structure counts. Same source as sourceCounts — forwarded
   * to StructuresSectionContainer.
   */
  structureCounts?: Partial<Record<StructureId, number>>;
  /** Called when the user clicks "Reset camera". App wires `camera.focusOnHome()`. */
  onResetCamera: () => void;
};

// ── SettingsPanel ──────────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel({
  defaultOpen,
  sourceCounts,
  structureCounts,
  onResetCamera,
}: SettingsPanelProps): ReactNode {
  return (
    <Panel
      title="Settings"
      ariaLabel="Renderer settings"
      defaultOpen={defaultOpen}
      headerExtra={<TierChipContainer />}
    >
      <GalaxiesSectionContainer sourceCounts={sourceCounts} />
      <CosmicWebSectionContainer />
      <FlowSectionContainer />
      <StructuresSectionContainer structureCounts={structureCounts} />
      <LabelsSectionContainer />
      <DisplaySectionContainer />
      <div className={styles.panelDivider} role="separator" />
      <Button className={styles.resetButton} onClick={onResetCamera}>
        Reset camera
      </Button>
    </Panel>
  );
});
