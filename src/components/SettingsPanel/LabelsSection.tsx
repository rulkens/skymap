// src/components/SettingsPanel/LabelsSection.tsx
/**
 * LabelsSection — presentational component for the Labels thematic group
 * inside the SettingsPanel.
 *
 * Owns the Labels thematic group UI: the tri-state master toggle, the per-
 * category label checkboxes, the two foreground scene-body caption rows (star
 * names, planet names), and the constellation rows (the stick-figure overlay
 * toggle, its name-labels toggle, and its intensity slider). Isolating this into
 * its own component ensures a label toggle re-renders ONLY this section rather
 * than the entire HUD. The section owns the tri-state master derivation (the
 * `labelsMaster` object) — that logic is section-local, summarising EVERY
 * boolean row in the section (the COSMO label categories, the two foreground
 * caption rows, and the two constellation toggles; the intensity slider is a
 * scalar, not a boolean row, so it stays out of the master), so it belongs here,
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
  /** Whether the true-3D constellation stick-figure overlay (the lines) is shown. */
  constellationsEnabled: boolean;
  /** Called when the user toggles the constellation overlay on or off. */
  onToggleConstellations: (enabled: boolean) => void;
  /** Whether the constellation figure NAME labels are shown (independent of the lines). */
  constellationLabelsEnabled: boolean;
  /** Called when the user toggles the constellation name labels on or off. */
  onSetConstellationLabelsEnabled: (enabled: boolean) => void;
  /** Constellation line brightness scale (1.0 = identity). */
  constellationIntensity: number;
  /** Called when the user moves the constellation-intensity slider. */
  onConstellationIntensityChange: (v: number) => void;
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
  constellationsEnabled,
  onToggleConstellations,
  constellationLabelsEnabled,
  onSetConstellationLabelsEnabled,
  constellationIntensity,
  onConstellationIntensityChange,
}: LabelsSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many of the section's BOOLEAN rows are currently on.
  // The rows are the COSMO LABEL_CATEGORIES PLUS the two foreground caption rows
  // (star names, planet names) PLUS the two constellation toggles (the overlay
  // lines, the figure name labels) — the master summarises every checkbox the
  // section renders, so all four extra rows count toward it even though they
  // live in their own settings clusters rather than the category map. The
  // constellation intensity slider is a scalar knob, not a boolean row, so it is
  // deliberately NOT part of the master.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const total = LABEL_CATEGORIES.length + 4;
  const enabledCount =
    LABEL_CATEGORIES.reduce<number>((n, cat) => (labelCategoryVisibility[cat] ? n + 1 : n), 0) +
    (starLabelsEnabled ? 1 : 0) +
    (planetLabelsEnabled ? 1 : 0) +
    (constellationsEnabled ? 1 : 0) +
    (constellationLabelsEnabled ? 1 : 0);
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
      onToggleConstellations(targetEnabled);
      onSetConstellationLabelsEnabled(targetEnabled);
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
      {/* Constellations — the true-3D stick-figure overlay, moved here from the
          Stars section. The overlay lines and their figure NAME labels are
          independent gates: turning the labels off keeps the figures drawn.
          Both count toward the section master; the intensity slider below does
          not (it is a scalar, not a boolean row). */}
      <div className={styles.panelRow}>
        <label htmlFor="toggle-constellations">Constellations</label>
        <input
          id="toggle-constellations"
          type="checkbox"
          checked={constellationsEnabled}
          onChange={(e) => onToggleConstellations(e.target.checked)}
        />
      </div>
      <div className={styles.panelRow}>
        <label htmlFor="toggle-constellation-labels">Constellation labels</label>
        <input
          id="toggle-constellation-labels"
          type="checkbox"
          checked={constellationLabelsEnabled}
          onChange={(e) => onSetConstellationLabelsEnabled(e.target.checked)}
        />
      </div>
      {/* Constellation intensity — brightness scale for the stick-figure lines.
          1.0 is identity (the calibrated at-rest stroke); dial down to a faint
          guide or up for emphasis. Range 0–2. */}
      <div className={styles.panelRow}>
        <label htmlFor="slider-constellation-intensity">Constellation intensity</label>
        <span className={styles.panelValue}>{constellationIntensity.toFixed(1)}×</span>
      </div>
      <div className={styles.panelRow}>
        <input
          id="slider-constellation-intensity"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={constellationIntensity}
          onChange={(e) => onConstellationIntensityChange(parseFloat(e.target.value))}
        />
      </div>
    </CollapsibleSection>
  );
}

export default memo(LabelsSection);
