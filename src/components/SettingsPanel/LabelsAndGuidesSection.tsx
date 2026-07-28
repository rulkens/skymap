// src/components/SettingsPanel/LabelsAndGuidesSection.tsx
/**
 * LabelsAndGuidesSection — presentational component for the Labels & Guides
 * thematic group inside the SettingsPanel.
 *
 * Owns the Labels & Guides thematic group UI: the tri-state master toggle,
 * the per-category label checkboxes, the foreground planet-caption row, and
 * the overlay guide rows — the
 * constellation stick figures and the near-field orbit trails. Isolating this
 * into its own component ensures a toggle re-renders ONLY this section rather
 * than the entire HUD. The section owns the tri-state master derivation (the
 * `sectionMaster` object) — that logic is section-local, summarising EVERY
 * boolean row in the section (the COSMO label categories plus every
 * `nonCategoryRows` entry), so it belongs here, not in a shared parent.
 *
 * Several source types bear labels, and the container routes each to its own
 * dispatch home. This component sees only the flat
 * `Record<LabelCategory, boolean>` projection and a single callback — it has no
 * knowledge of the routing.
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when `LabelsAndGuidesSectionContainer`'s parent re-renders for
 * an unrelated reason, `memo` bails on the prop-compare step so the section
 * does not re-render. The `useCallback`-wrapped handler the container passes
 * in has stable identity (dispatch is invariant), making the bail effective.
 */

import { memo } from 'react';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../../data/structure/categoryDisplayInfo';
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * A boolean row that is NOT a COSMO `LabelCategory` — the foreground
 * planet-caption toggle and the overlay guide
 * toggles (the constellation stick figures, the orbit trails). Each lives in
 * its own settings cluster rather than the category map, but they are
 * structurally identical checkboxes, so the container hands them as a uniform
 * row array and the section derives the master tri-state + JSX from it instead
 * of hand-syncing a fixed set of individual props. `id` is the checkbox
 * element id (also the `label`'s `htmlFor`).
 */
export type NonCategoryRow = {
  id: string;
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

type LabelsAndGuidesSectionProps = {
  /** Per-category label visibility (text label on/off for each label-bearing category). */
  labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
  /** Called when the user toggles a single label category on or off. */
  onSetLabelCategoryVisibility: (category: LabelCategory, visible: boolean) => void;
  /**
   * The non-category boolean rows (planet names, constellations, orbit
   * trails), in render + master-derivation order. Every entry counts toward
   * the master tri-state.
   */
  nonCategoryRows: ReadonlyArray<NonCategoryRow>;
};

// ── LabelsAndGuidesSection ────────────────────────────────────────────────────

/**
 * Renders the full Labels & Guides thematic group: a master tri-state toggle
 * on the section header and per-category label checkboxes in the body.
 *
 * The label axis is independent of the marker axis (Structures group). Flipping
 * a label off keeps its ring visible, and vice versa. `milkyWay` appears here as
 * the "You are here" label category alongside the structure, famousGalaxy and
 * famousStar labels.
 */
function LabelsAndGuidesSection({
  labelCategoryVisibility,
  onSetLabelCategoryVisibility,
  nonCategoryRows,
}: LabelsAndGuidesSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many of the section's BOOLEAN rows are currently on.
  // The rows are the COSMO LABEL_CATEGORIES PLUS the `nonCategoryRows` (planet
  // names and the overlay guide toggles — constellations, orbit
  // trails) — the master summarises every checkbox the section renders, so
  // each non-category row counts toward it even though they live in their own
  // settings clusters rather than the category map. The count is derived from
  // the row array, so adding a row is one container edit, not four hand-synced
  // call sites here.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const total = LABEL_CATEGORIES.length + nonCategoryRows.length;
  const enabledCount =
    LABEL_CATEGORIES.reduce<number>((n, cat) => (labelCategoryVisibility[cat] ? n + 1 : n), 0) +
    nonCategoryRows.reduce<number>((n, row) => (row.enabled ? n + 1 : n), 0);
  const allOn = enabledCount === total;
  const noneOn = enabledCount === 0;
  const sectionMaster = {
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
      title="Labels & Guides"
      headerToggle={sectionMaster.allOn}
      headerToggleIndeterminate={sectionMaster.indeterminate}
      onHeaderToggleChange={sectionMaster.onToggle}
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
      {/* The non-category boolean rows — the foreground planet-caption toggle
          and the overlay guide toggles
          (constellation stick figures, orbit trails). They are not COSMO
          label categories (they live in their own settings clusters, not the
          structure/galaxy-catalog registries), so they render as their own
          uniform rows. Every row counts toward the master tri-state. */}
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

export default memo(LabelsAndGuidesSection);
