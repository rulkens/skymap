// src/components/DebugPanel/GalaxyProvenanceSection.tsx
/**
 * GalaxyProvenanceSection — the catalog-audit table for the DebugPanel.
 *
 * A galaxy record carries two values the build pipeline fills in when the source
 * catalog has no measurement: its orientation (b/a + position angle, hashed from
 * sky position) and its size (a flat 30 kpc diameter). Each is flagged per record,
 * so the renderer can tell measurement from fallback.
 *
 * One row per `PROVENANCE_AXES` entry, each carrying the same three controls:
 *
 *   - **highlight** replaces the galaxy's ramp colour with the axis's swatch
 *     colour in the vertex shader (a replacement, not a tint — a red galaxy
 *     multiplied by a tint just darkens), so records missing this measurement
 *     are scannable against the sky.
 *   - **show** selects which half of the axis is drawn: `measured` draws only
 *     real measurements, `estimated` draws only the fallbacks, culling the
 *     other half's fragments in the shader.
 *   - **counts**, the missing-value tally and its share of every loaded catalog,
 *     which turns "that looks like a lot of magenta" into a number.
 *
 * The rows are mapped from the registry, never written by hand: a third axis
 * should cost a registry entry plus a shader branch, not a copy of this markup.
 *
 * ### Why a separate section, not RenderTogglesSection
 *
 * RenderTogglesSection's vocabulary is per-pass renderer on/off (points,
 * filaments, thumbnails, volume passes). These controls are a different kind of
 * switch — they don't disable a draw, they reveal how trustworthy the
 * underlying per-galaxy data is. Mixing them into the renderer-toggle list
 * would muddy that distinction. Future provenance diagnostics (highlight
 * cross-match conflicts, tint by redshift uncertainty) land here too.
 *
 * ### Why props, not an imperative handle
 *
 * The provenance settings live in the RTK settings slice and the counts in the
 * engine slice; `GalaxyProvenanceSectionContainer` reads both via selectors and
 * passes them down. Receiving them as props keeps this section a pure function
 * of its inputs and lets the container own the wiring, the way every other
 * DebugPanel section works.
 */

import { Fragment, type CSSProperties, type ReactNode } from 'react';
import cx from 'classnames';
import type { GalaxyProvenanceSettings } from '../../@types/settings/GalaxyProvenanceSettings';
import type { ProvenanceAxisId } from '../../@types/settings/ProvenanceAxisId';
import type { ProvenanceFilter } from '../../@types/settings/ProvenanceFilter';
import type { ProvenanceCounts } from '../../@types/engine/ProvenanceCounts';
import { PROVENANCE_AXES } from '../../data/provenanceAxes';
import { PROVENANCE_FILTER_OPTIONS } from '../../data/provenanceFilter';
import DebugSection from './DebugSection';
import styles from './GalaxyProvenanceSection.module.css';

const SHOW_HINT =
  'All draws everything. Measured draws only galaxies with a real measurement. Missing draws only those without one.';

export type GalaxyProvenanceSectionProps = {
  readonly provenance: GalaxyProvenanceSettings;
  /** Estimated-vs-total tallies summed across every loaded catalog. `total === 0` means nothing has landed yet. */
  readonly counts: ProvenanceCounts;
  readonly onHighlightChange: (axis: ProvenanceAxisId, highlight: boolean) => void;
  readonly onFilterChange: (axis: ProvenanceAxisId, filter: ProvenanceFilter) => void;
};

function GalaxyProvenanceSection({
  provenance,
  counts,
  onHighlightChange,
  onFilterChange,
}: GalaxyProvenanceSectionProps): ReactNode {
  const loaded = counts.total > 0;

  return (
    <DebugSection title="Galaxy Provenance">
      {/* Cells are direct grid children rather than nested row elements, so every
          column lines up across rows without fixed widths. */}
      <div className={styles.root}>
        <span />
        <span
          className={cx(styles.head, styles.spanTwo)}
          title="Galaxies with no measured value for this in the source catalog. The pipeline filled one in."
        >
          missing
        </span>
        <span
          className={styles.head}
          title="Paint the galaxies missing this measurement in the swatch colour."
        >
          highlight
        </span>
        <span
          className={styles.head}
          title="Draw all galaxies, only those with a real measurement, or only those missing one."
        >
          show
        </span>

        {PROVENANCE_AXES.map((axis) => {
          const estimated = counts.estimated[axis.id];
          const checkboxId = `provenance-highlight-${axis.id}`;
          return (
            <Fragment key={axis.id}>
              <label className={styles.axis} htmlFor={checkboxId} title={axis.hint}>
                <span
                  className={styles.swatch}
                  style={{ '--swatch': axis.highlightColor } as CSSProperties}
                />
                {axis.label}
              </label>
              <span
                className={styles.number}
                title="Galaxies missing this measurement, across all loaded catalogs."
              >
                {loaded ? estimated.toLocaleString() : '—'}
              </span>
              <span
                className={cx(styles.number, styles.percent)}
                title="Share of loaded galaxies missing this measurement."
              >
                {loaded ? `${((estimated / counts.total) * 100).toFixed(1)}%` : '—'}
              </span>
              <input
                id={checkboxId}
                className={styles.check}
                type="checkbox"
                title={`Highlight galaxies with no measured ${axis.label.toLowerCase()}.`}
                checked={provenance[axis.id].highlight}
                onChange={(e) => onHighlightChange(axis.id, e.target.checked)}
              />
              <select
                className={styles.select}
                title={SHOW_HINT}
                aria-label={`Show by ${axis.label.toLowerCase()} provenance`}
                value={provenance[axis.id].filter}
                onChange={(e) => onFilterChange(axis.id, e.target.value as ProvenanceFilter)}
              >
                {PROVENANCE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Fragment>
          );
        })}

        <span className={styles.footer} title="Total galaxies across every loaded catalog.">
          {loaded ? `${counts.total.toLocaleString()} galaxies loaded` : 'no catalogs loaded'}
        </span>
      </div>
    </DebugSection>
  );
}

export default GalaxyProvenanceSection;
