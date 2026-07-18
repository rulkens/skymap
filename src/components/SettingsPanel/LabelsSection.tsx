// src/components/SettingsPanel/LabelsSection.tsx
/**
 * LabelsSection — presentational component for the Labels thematic group
 * inside the SettingsPanel.
 *
 * Owns the Labels thematic group UI: the tri-state master toggle, the per-
 * category label checkboxes, and the two foreground scene-body caption rows
 * (star names, planet names). Isolating this into its own component ensures a
 * label toggle re-renders ONLY this section rather than the entire HUD. The
 * section owns the tri-state master derivation (the `labelsMaster` object) —
 * that logic is section-local, summarising EVERY row in the section (the COSMO
 * label categories plus the two foreground caption rows), so it belongs here,
 * not in a shared parent.
 *
 * Three kinds of sources bear labels, which the container routes to three
 * dispatch homes (structure / milkyWay singleton / galaxy catalog). This
 * component sees only the flat `Record<LabelCategory, boolean>` projection and
 * a single callback — it has no knowledge of the routing.
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when `LabelsSectionContainer`'s parent re-renders for an
 * unrelated reason, `memo` bails on the prop-compare step so the section does
 * not re-render. The `useCallback`-wrapped handler the container passes in has
 * stable identity (dispatch is invariant), making the bail effective.
 */

import { memo } from 'react';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';

// ── Props ──────────────────────────────────────────────────────────────────────

type LabelsSectionProps = {
  /** Per-category label visibility (text label on/off for each label-bearing category). */
  labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
  /** Called when the user toggles a single label category on or off. */
  onSetLabelCategoryVisibility: (category: LabelCategory, visible: boolean) => void;
  /** Whether the local-star captions in the true-scale foreground are shown. */
  starLabelsEnabled: boolean;
  /** Called when the user toggles the local-star captions on or off. */
  onSetStarLabelsEnabled: (enabled: boolean) => void;
  /** Whether the Earth + planet captions in the true-scale foreground are shown. */
  planetLabelsEnabled: boolean;
  /** Called when the user toggles the Earth + planet captions on or off. */
  onSetPlanetLabelsEnabled: (enabled: boolean) => void;
};

// ── LabelsSection ──────────────────────────────────────────────────────────────

/**
 * Renders the full Labels thematic group: a master tri-state toggle on the
 * section header and per-category label checkboxes in the body.
 *
 * The label axis is independent of the marker axis (Structures group). Flipping
 * a label off keeps its ring visible, and vice versa. `milkyWay` appears here as
 * the "You are here" label category alongside structure and famousGalaxy labels.
 */
function LabelsSection({
  labelCategoryVisibility,
  onSetLabelCategoryVisibility,
  starLabelsEnabled,
  onSetStarLabelsEnabled,
  planetLabelsEnabled,
  onSetPlanetLabelsEnabled,
}: LabelsSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many of the section's rows are currently label-
  // visible. The rows are the COSMO LABEL_CATEGORIES PLUS the two foreground
  // caption rows (star names, planet names) — the master summarises every row
  // the section renders, so those two count toward it even though they live in
  // their own settings cluster rather than the category map.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const total = LABEL_CATEGORIES.length + 2;
  const enabledCount =
    LABEL_CATEGORIES.reduce<number>((n, cat) => (labelCategoryVisibility[cat] ? n + 1 : n), 0) +
    (starLabelsEnabled ? 1 : 0) +
    (planetLabelsEnabled ? 1 : 0);
  const allOn = enabledCount === total;
  const noneOn = enabledCount === 0;
  const labelsMaster = {
    allOn,
    indeterminate: !allOn && !noneOn,
    onToggle: () => {
      const targetEnabled = noneOn;
      for (const cat of LABEL_CATEGORIES) {
        onSetLabelCategoryVisibility(cat, targetEnabled);
      }
      onSetStarLabelsEnabled(targetEnabled);
      onSetPlanetLabelsEnabled(targetEnabled);
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <CollapsibleSection
      title="Labels"
      headerToggle={labelsMaster.allOn}
      headerToggleIndeterminate={labelsMaster.indeterminate}
      onHeaderToggleChange={labelsMaster.onToggle}
    >
      {/* Per-category label checkboxes inline — no Advanced wrapper, since
          there are no other knobs to hide behind one. */}
      {LABEL_CATEGORIES.map((cat) => (
        <div className={styles.panelRow} key={`label-${cat}`}>
          <label htmlFor={`toggle-label-${cat}`}>{CATEGORY_DISPLAY_INFO[cat].plural}</label>
          <input
            id={`toggle-label-${cat}`}
            type="checkbox"
            checked={labelCategoryVisibility[cat]}
            onChange={(e) => onSetLabelCategoryVisibility(cat, e.target.checked)}
          />
        </div>
      ))}
      {/* The foreground scene-body captions (local-star map, Earth + planets)
          are not COSMO label categories, so they get their own rows rather than
          joining the category map above — they live in the `labels` settings
          cluster, not the structure/galaxy-catalog registries. They still count
          toward the master tri-state, which summarises every row in the section. */}
      <div className={styles.panelRow}>
        <label htmlFor="toggle-label-stars">Star names</label>
        <input
          id="toggle-label-stars"
          type="checkbox"
          checked={starLabelsEnabled}
          onChange={(e) => onSetStarLabelsEnabled(e.target.checked)}
        />
      </div>
      <div className={styles.panelRow}>
        <label htmlFor="toggle-label-planets">Planet names</label>
        <input
          id="toggle-label-planets"
          type="checkbox"
          checked={planetLabelsEnabled}
          onChange={(e) => onSetPlanetLabelsEnabled(e.target.checked)}
        />
      </div>
    </CollapsibleSection>
  );
}

export default memo(LabelsSection);
