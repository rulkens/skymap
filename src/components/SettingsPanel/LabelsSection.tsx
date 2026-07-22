// src/components/SettingsPanel/LabelsSection.tsx
/**
 * LabelsSection — presentational component for the Labels thematic group
 * inside the SettingsPanel.
 *
 * Owns the Labels thematic group UI: the tri-state master toggle, the per-
 * category label checkboxes, the two foreground scene-body caption rows (star
 * names, planet names), and the constellation row (the single toggle that
 * governs both the stick-figure overlay and its name captions). Isolating this
 * into its own component ensures a label toggle re-renders ONLY this section
 * rather than the entire HUD. The section owns the tri-state master derivation
 * (the `labelsMaster` object) — that logic is section-local, summarising EVERY
 * boolean row in the section (the COSMO label categories, the two foreground
 * caption rows, and the constellation toggle), so it belongs here, not in a
 * shared parent.
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
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * A boolean label row that is NOT a COSMO `LabelCategory` — the foreground
 * scene-body captions (star names, planet names) and the constellation toggle
 * (the stick-figure overlay, whose name captions ride the same gate). Each
 * lives in its own settings cluster rather than the category map, but they are
 * structurally identical checkboxes, so the container hands them as a uniform
 * row array and the section derives the master tri-state + JSX from it instead
 * of hand-syncing a fixed set of individual props. `id` is the checkbox
 * element id (also the `label`'s `htmlFor`).
 */
export type NonCategoryLabelRow = {
  id: string;
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

type LabelsSectionProps = {
  /** Per-category label visibility (text label on/off for each label-bearing category). */
  labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
  /** Called when the user toggles a single label category on or off. */
  onSetLabelCategoryVisibility: (category: LabelCategory, visible: boolean) => void;
  /**
   * The non-category boolean rows (star names, planet names, constellations),
   * in render + master-derivation order. Every entry counts toward the master
   * tri-state.
   */
  nonCategoryRows: ReadonlyArray<NonCategoryLabelRow>;
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
  nonCategoryRows,
}: LabelsSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many of the section's BOOLEAN rows are currently on.
  // The rows are the COSMO LABEL_CATEGORIES PLUS the `nonCategoryRows` (star
  // names, planet names, and the constellation toggle) — the master summarises
  // every checkbox the section renders, so each non-category row counts toward
  // it even though they live in their own settings clusters rather than the
  // category map. The count is derived from the row array, so adding a row is
  // one container edit, not four hand-synced call sites here.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const total = LABEL_CATEGORIES.length + nonCategoryRows.length;
  const enabledCount =
    LABEL_CATEGORIES.reduce<number>((n, cat) => (labelCategoryVisibility[cat] ? n + 1 : n), 0) +
    nonCategoryRows.reduce<number>((n, row) => (row.enabled ? n + 1 : n), 0);
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
      for (const row of nonCategoryRows) {
        row.onChange(targetEnabled);
      }
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
            className={styles.toggle}
            checked={labelCategoryVisibility[cat]}
            onChange={(e) => onSetLabelCategoryVisibility(cat, e.target.checked)}
          />
        </div>
      ))}
      {/* The non-category boolean rows — the foreground scene-body captions
          (star names, planet names) and the constellation toggle (the
          stick-figure overlay, which also governs its figure NAME captions).
          They are not COSMO label categories (they live in the `labels` /
          `constellations` settings clusters, not the structure/galaxy-catalog
          registries), so they render as their own uniform rows. Every row
          counts toward the master tri-state. */}
      {nonCategoryRows.map((row) => (
        <div className={styles.panelRow} key={row.id}>
          <label htmlFor={row.id}>{row.label}</label>
          <input
            id={row.id}
            type="checkbox"
            className={styles.toggle}
            checked={row.enabled}
            onChange={(e) => row.onChange(e.target.checked)}
          />
        </div>
      ))}
    </CollapsibleSection>
  );
}

export default memo(LabelsSection);
