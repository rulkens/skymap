// src/components/TourOverlay/TourOverlay.tsx
/**
 * TourOverlay — composes the guided-tour HUD over the live 3D scene: a
 * localized vignette + the per-beat caption + the always-on navigation
 * cluster.
 *
 * Purely presentational. A container resolves the active beat's caption +
 * tour state and passes everything as props; this component owns no store
 * reads, only the small bit of local timing state that decides WHEN the
 * caption shows.
 *
 * That timing is the overlay's one real behaviour. A beat plays in two
 * phases: an establishing fly (camera moves toward the subject) followed by
 * a dwell (camera holds while the viewer reads). The caption belongs to the
 * dwell — showing it mid-fly would label a subject that isn't framed yet —
 * so it is hidden when a beat starts and revealed once the dwell lands:
 *
 *   - `index` changes      → a new beat's fly begins → hide the caption.
 *   - `dwellNonce` bumps    → the dwell has landed     → show the caption.
 *
 * The nav, by contrast, is always visible (you can scrub or exit mid-fly).
 *
 * The root is a fixed, full-viewport, click-through layer; only the nav
 * buttons opt back into pointer events, so the canvas stays interactive
 * everywhere the controls aren't.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { BeatCaption } from '../../@types/animation/tour/BeatCaption';
import TourCaption from './TourCaption';
import TourNav from './TourNav';
import styles from './TourOverlay.module.css';

export type TourOverlayProps = {
  readonly caption: BeatCaption | null;
  readonly label: string | null;
  readonly index: number;
  readonly total: number;
  readonly paused: boolean;
  readonly dwellSec: number;
  readonly dwellNonce: number;
  readonly canPrev: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onTogglePause: () => void;
  readonly onExit: () => void;
};

// The vignette class follows the caption's anchor corner, so it darkens
// under the text rather than the opposite half of the canvas.
const VIGNETTE_CLASS = {
  'top-left': styles.vignetteTopLeft,
  'top-center': styles.vignetteTopCenter,
  'top-right': styles.vignetteTopRight,
  'bottom-left': styles.vignetteBottomLeft,
  'bottom-right': styles.vignetteBottomRight,
} as const;

function TourOverlay({
  caption,
  label,
  index,
  total,
  paused,
  dwellSec,
  dwellNonce,
  canPrev,
  onPrev,
  onNext,
  onTogglePause,
  onExit,
}: TourOverlayProps): ReactNode {
  // `inDwell` gates the caption: false during the establishing fly, true
  // once the dwell lands. A new beat (index change) resets it; the dwell's
  // nonce bump flips it on.
  const [inDwell, setInDwell] = useState(false);

  useEffect(() => {
    setInDwell(false);
  }, [index]);

  useEffect(() => {
    if (dwellNonce > 0) setInDwell(true);
  }, [dwellNonce]);

  const showCaption = inDwell && caption !== null;
  const vignetteClass = caption ? VIGNETTE_CLASS[caption.position ?? 'bottom-left'] : undefined;

  return (
    <div className={styles.root}>
      {showCaption && caption ? (
        <>
          <div className={`${styles.vignette} ${vignetteClass}`} aria-hidden="true" />
          {/*
           * Keyed on the beat index so each beat re-mounts the caption and
           * replays the staggered fade-up reveal rather than cross-fading
           * text in place.
           */}
          <TourCaption key={index} caption={caption} label={label} index={index} total={total} />
        </>
      ) : null}

      <TourNav
        paused={paused}
        dwellSec={dwellSec}
        dwellNonce={dwellNonce}
        canPrev={canPrev}
        onPrev={onPrev}
        onNext={onNext}
        onTogglePause={onTogglePause}
        onExit={onExit}
      />
    </div>
  );
}

export default TourOverlay;
