// src/components/ViewOverlay/ViewOverlay.tsx
/**
 * ViewOverlay — "notes on the scene": a full-screen takeover for a curated
 * view (spec §4.2), sibling to TourOverlay under the same `runTakeover`
 * bracket. No card, no chrome besides an Exit pill — the caption and notes
 * sit directly over the live field behind their own scrims.
 *
 * Purely presentational: a container resolves the active view's copy and
 * hands it down as props, same split as TourOverlay/TourOverlayContainer.
 */

import type { ReactNode } from 'react';
import type { ViewSection } from '../../@types/views/ViewSection';
import styles from './ViewOverlay.module.css';

export type ViewOverlayProps = {
  readonly label: string;
  readonly body: readonly ViewSection[];
  readonly onExit: () => void;
};

function ViewOverlay({ label, body, onExit }: ViewOverlayProps): ReactNode {
  return (
    <div className={styles.root}>
      <div className={styles.vignetteCaption} aria-hidden="true" />
      <div className={styles.vignetteNotes} aria-hidden="true" />

      <div className={styles.caption}>
        <div className={styles.kicker}>View</div>
        <h1 className={styles.title}>{label}</h1>
      </div>

      {body.length > 0 ? (
        <div className={styles.notes}>
          {body.map((section) => (
            <div key={section.heading} className={styles.section}>
              <h2 className={styles.sectionHeading}>{section.heading}</h2>
              <p className={styles.sectionBody}>{section.text}</p>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className={styles.exitPill} onClick={onExit}>
        Exit view <span className={styles.exitKey}>· Esc</span>
      </button>
    </div>
  );
}

export default ViewOverlay;
