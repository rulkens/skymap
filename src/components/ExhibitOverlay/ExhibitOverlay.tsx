/**
 * ExhibitOverlay — "notes on the scene": a full-screen takeover for a curated
 * exhibit (spec §4.2), sibling to TourOverlay under the same `runTakeoverSaga`
 * bracket. No card, no chrome besides an Exit pill — the caption and notes
 * sit directly over the live field behind their own scrims. Each section draws
 * itself through its kind's Component; a container resolves the exhibit.
 */

import type { CSSProperties, ReactNode } from 'react';

import StopIcon from '../TourOverlay/StopIcon';
import type { ExhibitSection } from '../../@types/exhibits/ExhibitSection';
import styles from './ExhibitOverlay.module.css';

export type ExhibitOverlayProps = {
  readonly label: string;
  readonly lede: string;
  readonly body: readonly ExhibitSection[];
  /** Seconds to wait before the copy animates in — the fly-in's near-landing. */
  readonly enterDelaySec: number;
  readonly onExit: () => void;
};

function ExhibitOverlay({
  label,
  lede,
  body,
  enterDelaySec,
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
          {body.map(({ kind, data }, i) => (
            // The group is what enters — a section and the hairline above it
            // are one beat, and `--i` is its place in the stagger.
            <div
              key={`${kind.id}-${i}`}
              className={styles.sectionGroup}
              style={{ '--i': i } as CSSProperties}
            >
              <kind.Component data={data} />
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className={styles.exitPill} onClick={onExit}>
        <span className={styles.exitIcon}>
          <StopIcon />
        </span>
        <span className={styles.exitLabel}>Exit view</span>
        <span className={styles.exitKey}>Esc</span>
      </button>
    </div>
  );
}

export default ExhibitOverlay;
