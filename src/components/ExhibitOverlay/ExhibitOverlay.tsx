/**
 * ExhibitOverlay — "notes on the scene": a full-screen takeover for a curated
 * exhibit (spec §4.2), sibling to TourOverlay under the same `runTakeover`
 * bracket. No card, no chrome besides an Exit pill — the caption and notes
 * sit directly over the live field behind their own scrims. Purely
 * presentational; a container resolves the exhibit and owns the toggle's state.
 */

import type { CSSProperties, ReactNode } from 'react';

import StopIcon from '../TourOverlay/StopIcon';
import ExhibitNoteSection from './ExhibitNoteSection';
import type { ExhibitSection } from '../../@types/exhibits/ExhibitSection';
import type { ExhibitToggle } from '../../@types/exhibits/ExhibitToggle';
import styles from './ExhibitOverlay.module.css';

export type ExhibitOverlayProps = {
  readonly label: string;
  readonly lede: string;
  readonly body: readonly ExhibitSection[];
  /** Seconds to wait before the copy animates in — the fly-in's near-landing. */
  readonly enterDelaySec: number;
  readonly toggleOn: boolean;
  readonly onToggle: (toggle: ExhibitToggle, on: boolean) => void;
  readonly onExit: () => void;
};

function ExhibitOverlay({
  label,
  lede,
  body,
  enterDelaySec,
  toggleOn,
  onToggle,
  onExit,
}: ExhibitOverlayProps): ReactNode {
  // Every entrance in the stylesheet is offset from this one property, so the
  // whole overlay arrives on the camera's clock rather than the takeover's.
  const clock = { '--exhibit-enter-delay': `${enterDelaySec}s` } as CSSProperties;

  return (
    <div className={styles.root} style={clock}>
      <div className={styles.vignetteCaption} aria-hidden="true" />
      <div className={styles.vignetteNotes} aria-hidden="true" />

      <div className={styles.caption}>
        <div className={styles.kicker}>Exhibit</div>
        <h1 className={styles.title}>{label}</h1>
        <p className={styles.lede}>{lede}</p>
      </div>

      {body.length > 0 ? (
        <div className={styles.notes}>
          {body.map((section, i) => (
            // The group is what enters — a section and the hairline above it
            // are one beat, and `--i` is its place in the stagger.
            <div
              key={`${section.kind}-${i}`}
              className={styles.sectionGroup}
              style={{ '--i': i } as CSSProperties}
            >
              {/* The data blocks sit behind a hairline; it separates sections,
                  so it is the column's presentation, not a section's content. */}
              {section.kind === 'facts' || section.kind === 'sources' ? (
                <div className={styles.rule} aria-hidden="true" />
              ) : null}
              <ExhibitNoteSection section={section} toggleOn={toggleOn} onToggle={onToggle} />
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className={styles.exitPill} onClick={onExit}>
        <span className={styles.exitIcon}>
          <StopIcon />
        </span>
        <span className={styles.exitLabel}>Exit exhibit</span>
        <span className={styles.exitKey}>Esc</span>
      </button>
    </div>
  );
}

export default ExhibitOverlay;
