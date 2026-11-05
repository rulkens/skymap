/**
 * ExhibitOverlay — "notes on the scene": a full-screen takeover for a curated
 * exhibit (spec §4.2), sibling to TourOverlay under the same `runTakeoverSaga`
 * bracket. No card, no chrome besides an Exit pill — the caption and notes
 * sit directly over the live field behind their own scrims. Each section draws
 * itself through its kind's Component; a container resolves the exhibit.
 */

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

import StopIcon from '../icons/StopIcon/StopIcon';
import EyeIcon from '../icons/EyeIcon/EyeIcon';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useViewCover } from '../../hooks/useViewCover';
import type { ExhibitSection } from '../../@types/exhibits/ExhibitSection';
import type { ViewCover } from '../../@types/layout/ViewCover';
import styles from './ExhibitOverlay.module.css';

export type ExhibitOverlayProps = {
  readonly label: string;
  readonly lede: string;
  readonly body: readonly ExhibitSection[];
  /** Seconds to wait before the copy animates in — the fly-in's near-landing. */
  readonly enterDelaySec: number;
  readonly onExit: () => void;
  /** Both must be stable; see `useViewCover`. */
  readonly onNotesCover: (cover: ViewCover | null) => void;
  readonly onCaptionCover: (cover: ViewCover | null) => void;
};

function ExhibitOverlay({
  label,
  lede,
  body,
  enterDelaySec,
  onExit,
  onNotesCover,
  onCaptionCover,
}: ExhibitOverlayProps): ReactNode {
  // Local on purpose: the container keys this on the exhibit id, so it resets
  // per exhibit and on exit without touching the app-wide `uiHidden`.
  const [hidden, setHidden] = useState(false);
  // Every entrance in the stylesheet is offset from this one property, so the
  // whole overlay arrives on the camera's clock rather than the takeover's.
  const clock = { '--exhibit-enter-delay': `${enterDelaySec}s` } as CSSProperties;

  // Desktop: the notes column covers the right. Phone: the caption text covers
  // the bottom; the kicker is its top line, since the caption box itself fills
  // the first screen there.
  const isMobile = useIsMobile();
  const notesRef = useRef<HTMLDivElement>(null);
  const kickerRef = useRef<HTMLDivElement>(null);
  useViewCover(notesRef, 'right', !hidden && !isMobile && body.length > 0, onNotesCover);
  useViewCover(kickerRef, 'bottom', !hidden && isMobile, onCaptionCover);

  return (
    <div className={hidden ? `${styles.root} ${styles.hidden}` : styles.root} style={clock}>
      <div className={styles.content}>
        <div className={styles.vignetteCaption} aria-hidden="true" />
        <div className={styles.vignetteNotes} aria-hidden="true" />

        <div className={styles.caption}>
          <div ref={kickerRef} className={styles.kicker}>
            Exhibit
          </div>
          <h1 className={styles.title}>{label}</h1>
          <p className={styles.lede}>{lede}</p>
        </div>

        {body.length > 0 ? (
          <div ref={notesRef} className={styles.notes}>
            {body.map(({ kind, data }, i) => (
              // The group is what enters — a section and the hairline above it
              // are one beat, and `--i` is its place in the stagger.
              <div key={i} className={styles.sectionGroup} style={{ '--i': i } as CSSProperties}>
                <kind.Component data={data} />
              </div>
            ))}
          </div>
        ) : null}

        <button type="button" className={styles.exitPill} onClick={onExit}>
          <span className={styles.exitIcon}>
            <StopIcon size={13} />
          </span>
          <span className={styles.exitLabel}>Exit view</span>
          <span className={styles.exitKey}>Esc</span>
        </button>
      </div>

      <button
        type="button"
        className={styles.hideToggle}
        aria-label={hidden ? 'Show exhibit' : 'Hide exhibit'}
        aria-pressed={hidden}
        onClick={() => setHidden((h) => !h)}
      >
        <EyeIcon size={18} struck={hidden} />
      </button>
    </div>
  );
}

export default ExhibitOverlay;
