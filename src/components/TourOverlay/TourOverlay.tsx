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
 * The nav, by contrast, is always visible (you can scrub or exit mid-fly) —
 * in an interactive session. `hasChrome={false}` (cinema mode, the recorder's
 * capture surface) is the same overlay in its recorded-film presentation:
 * the caption stays, the transport nav and the beat counter are not mounted
 * at all. A boolean prop rather than a second overlay component, because the
 * dwell-gated caption timing — the one real behaviour here — is identical in
 * both modes and must not fork.
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
  /**
   * Interactive-session chrome: the transport nav + the beat counter.
   * `false` = cinema presentation (caption only). Defaults to true so the
   * interactive path needs no opt-in.
   */
  readonly hasChrome?: boolean;
  readonly caption: BeatCaption | null;
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

function TourOverlay({
  hasChrome = true,
  caption,
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

  return (
    <div className={styles.root}>
      {showCaption && caption ? (
        <>
          <div className={styles.vignette} aria-hidden="true" />
          {/*
           * Keyed on the beat index so each beat re-mounts the caption and
           * replays the staggered fade-up reveal rather than cross-fading
           * text in place.
           */}
          <TourCaption
            key={index}
            hasChrome={hasChrome}
            caption={caption}
            index={index}
            total={total}
            dwellSec={dwellSec}
            dwellNonce={dwellNonce}
            paused={paused}
          />
        </>
      ) : null}

      {/* Not merely hidden in cinema mode — the recorder screenshots the
          page, so unmounted is the only presentation that can't leak. */}
      {hasChrome ? (
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
      ) : null}
    </div>
  );
}

export default TourOverlay;
