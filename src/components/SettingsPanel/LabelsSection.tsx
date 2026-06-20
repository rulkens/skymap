// src/components/SettingsPanel/LabelsSection.tsx
/**
 * LabelsSection — presentational component for the Labels thematic group
 * inside the SettingsPanel.
 *
 * Owns the Labels thematic group UI: the tri-state master toggle and per-
 * category label checkboxes. Isolating this into its own component ensures a
 * label toggle re-renders ONLY this section rather than the entire HUD. The
 * section owns the tri-state master derivation (the `labelsMaster` object) —
 * that logic is section-local, summarising the per-category toggles that live
 * right here, so it belongs here, not in a shared parent.
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
}: LabelsSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many LABEL_CATEGORIES are currently label-visible.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const enabledCount = LABEL_CATEGORIES.reduce<number>(
    (n, cat) => (labelCategoryVisibility[cat] ? n + 1 : n),
    0,
  );
  const allOn = enabledCount === LABEL_CATEGORIES.length;
  const noneOn = enabledCount === 0;
  const labelsMaster = {
    allOn,
    indeterminate: !allOn && !noneOn,
    onToggle: () => {
      const targetEnabled = noneOn;
      for (const cat of LABEL_CATEGORIES) {
        onSetLabelCategoryVisibility(cat, targetEnabled);
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
            checked={labelCategoryVisibility[cat]}
            onChange={(e) => onSetLabelCategoryVisibility(cat, e.target.checked)}
          />
        </div>
      ))}
    </CollapsibleSection>
  );
}

export default memo(LabelsSection);
