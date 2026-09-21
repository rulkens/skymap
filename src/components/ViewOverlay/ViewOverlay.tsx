// src/components/ViewOverlay/ViewOverlay.tsx
/**
 * ViewOverlay — "notes on the scene": a full-screen takeover for a curated
 * view (spec §4.2), sibling to TourOverlay under the same `runTakeover`
 * bracket. No card, no chrome besides an Exit pill — the caption and notes
 * sit directly over the live field behind their own scrims. Purely
 * presentational; a container resolves the view and owns the toggle's state.
 */

import { Fragment } from 'react';
import type { ReactNode } from 'react';

import StopIcon from '../TourOverlay/StopIcon';
import ViewNoteSection from './ViewNoteSection';
import type { ViewSection } from '../../@types/views/ViewSection';
import type { ViewToggle } from '../../@types/views/ViewToggle';
import styles from './ViewOverlay.module.css';

export type ViewOverlayProps = {
  readonly label: string;
  readonly lede: string;
  readonly body: readonly ViewSection[];
  readonly toggleOn: boolean;
  readonly onToggle: (toggle: ViewToggle, on: boolean) => void;
  readonly onExit: () => void;
};

function ViewOverlay({
  label,
  lede,
  body,
  toggleOn,
  onToggle,
  onExit,
}: ViewOverlayProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.vignetteCaption} aria-hidden="true" />
      <div className={styles.vignetteNotes} aria-hidden="true" />

      <div className={styles.caption}>
        <div className={styles.kicker}>View</div>
        <h1 className={styles.title}>{label}</h1>
        <p className={styles.lede}>{lede}</p>
      </div>

      {body.length > 0 ? (
        <div className={styles.notes}>
          {body.map((section, i) => (
            <Fragment key={`${section.kind}-${i}`}>
              {/* The data blocks sit behind a hairline; it separates sections,
                  so it is the column's presentation, not a section's content. */}
              {section.kind === 'facts' || section.kind === 'sources' ? (
                <div className={styles.rule} aria-hidden="true" />
              ) : null}
              <ViewNoteSection section={section} toggleOn={toggleOn} onToggle={onToggle} />
            </Fragment>
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

export default ViewOverlay;
