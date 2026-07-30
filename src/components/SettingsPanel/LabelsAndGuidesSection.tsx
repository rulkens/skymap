// src/components/SettingsPanel/LabelsAndGuidesSection.tsx
/**
 * LabelsAndGuidesSection — presentational component for the Labels & Guides
 * thematic group inside the SettingsPanel.
 *
 * Renders a tri-state master toggle on the section header and one checkbox per
 * row in the body. Every row is the same shape whether it gates a label or a
 * guide overlay, so the master is one reduce over one array — the section has
 * no notion of "category rows" versus anything else. The container resolves
 * each row's settings home; this component only knows that a row is a labelled
 * boolean with a setter.
 *
 * Isolating this into its own component ensures a toggle re-renders ONLY this
 * section rather than the entire HUD.
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when the container's parent re-renders for an unrelated reason,
 * `memo` bails on the prop-compare step. The container's `useMemo`'d row array
 * has stable identity while its inputs are unchanged, making the bail effective.
 */

import { memo } from 'react';
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { SectionRow } from '../../@types/components/SectionRow';

type LabelsAndGuidesSectionProps = {
  /** Every checkbox the section renders, in display + master-derivation order. */
  rows: ReadonlyArray<SectionRow>;
};

function LabelsAndGuidesSection({ rows }: LabelsAndGuidesSectionProps) {
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const enabledCount = rows.reduce<number>((n, row) => (row.enabled ? n + 1 : n), 0);
  const allOn = rows.length > 0 && enabledCount === rows.length;
  const noneOn = enabledCount === 0;

  return (
    <CollapsibleSection
      title="Labels & Guides"
      headerToggle={allOn}
      headerToggleIndeterminate={!allOn && !noneOn}
      onHeaderToggleChange={() => {
        const targetEnabled = noneOn;
        for (const row of rows) row.onChange(targetEnabled);
      }}
    >
      {rows.map((row) => (
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
