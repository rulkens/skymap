// src/components/SettingsPanel/StructuresSection.tsx
/**
 * StructuresSection — presentational component for the Structures thematic group
 * inside the SettingsPanel.
 *
 * Owns the Structures thematic group UI: the tri-state master toggle and per-
 * category marker (ring) checkboxes. Isolating this into its own component
 * ensures a marker toggle re-renders ONLY this section rather than the entire
 * HUD. The section owns the tri-state master derivation (the `structuresMaster`
 * object) — that logic is section-local, summarising the per-category toggles
 * that live right here, so it belongs here, not in a shared parent.
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when `StructuresSectionContainer`'s parent re-renders for an
 * unrelated reason, `memo` bails on the prop-compare step so the section does
 * not re-render. The `useCallback`-wrapped handlers the container passes in have
 * stable identity across the container's lifetime (dispatch is invariant), making
 * the bail effective.
 */

import { memo } from 'react';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { StructureId } from '../../@types/data/structure/StructureId';

// ── Props ──────────────────────────────────────────────────────────────────────

type StructuresSectionProps = {
  /** Per-category marker visibility (ring on/off for each structure category). */
  markerCategoryVisibility: Readonly<Record<StructureId, boolean>>;
  /** Called when the user toggles a single marker category on or off. */
  onSetMarkerCategoryVisibility: (category: StructureId, visible: boolean) => void;
  /**
   * Per-category loaded structure counts. Absent entries (catalog not yet
   * loaded) render the toggle without a count rather than a misleading "0".
   */
  structureCounts?: Partial<Record<StructureId, number>>;
};

// ── StructuresSection ──────────────────────────────────────────────────────────

/**
 * Renders the full Structures thematic group: a master tri-state toggle on the
 * section header and per-category marker (ring) checkboxes in the body.
 *
 * Per audit Q11, marker visibility is a separate axis from label visibility —
 * flipping a structure marker off keeps its label visible (and vice versa via
 * the Labels group). `famousGalaxy` is absent from this section — famous
 * galaxies don't have ring markers (their visualisation is the galaxy point +
 * thumbnail).
 */
function StructuresSection({
  markerCategoryVisibility,
  onSetMarkerCategoryVisibility,
  structureCounts,
}: StructuresSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many STRUCTURE_IDS are currently marker-visible.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const enabledCount = STRUCTURE_IDS.reduce<number>(
    (n, cat) => (markerCategoryVisibility[cat] ? n + 1 : n),
    0,
  );
  const allOn = enabledCount === STRUCTURE_IDS.length;
  const noneOn = enabledCount === 0;
  const structuresMaster = {
    allOn,
    indeterminate: !allOn && !noneOn,
    onToggle: () => {
      const targetEnabled = noneOn;
      for (const cat of STRUCTURE_IDS) {
        onSetMarkerCategoryVisibility(cat, targetEnabled);
      }
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <CollapsibleSection
      title="Structures"
      headerToggle={structuresMaster.allOn}
      headerToggleIndeterminate={structuresMaster.indeterminate}
      onHeaderToggleChange={structuresMaster.onToggle}
    >
      {/* Per-category marker checkboxes live directly in the section body —
          no Advanced wrapper, since there are no other knobs to hide behind
          one. */}
      {STRUCTURE_IDS.map((cat) => {
        const count = structureCounts?.[cat];
        return (
          <div className={styles.panelRow} key={`marker-${cat}`}>
            <label htmlFor={`toggle-marker-${cat}`}>
              {CATEGORY_DISPLAY_INFO[cat].plural}
              {count !== undefined && (
                <span className={styles.sourceCount}>{count.toLocaleString()}</span>
              )}
            </label>
            <input
              id={`toggle-marker-${cat}`}
              type="checkbox"
              className={styles.toggle}
              checked={markerCategoryVisibility[cat]}
              onChange={(e) => onSetMarkerCategoryVisibility(cat, e.target.checked)}
            />
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

export default memo(StructuresSection);
