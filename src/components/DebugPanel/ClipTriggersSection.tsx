/**
 * ClipTriggersSection — dev-panel controls for playing registered Layer-1 clips
 * and launching guided tours directly, the live call-site for showcase
 * recordings.
 *
 * The spike camera *drivers* (`?webshow` et al.) were torn down once the
 * animation system landed, leaving no in-browser way to trigger a clip. This
 * section fills that gap with plain buttons — no URL gate. It iterates
 * `clipRegistry` / `tourRegistry`, so adding a clip or tour to a registry adds a
 * button here with zero edits. Play/stop/tour are fire-and-forget dispatches
 * wired by `ClipTriggersSectionContainer` (`startClip` / `stopClip` /
 * `startTour` request actions, each naming a registered id), the same way the
 * other panel knobs dispatch.
 *
 * ### Why the readout reads `clipActive`, not a Promise
 *
 * `camera.clip` holds only the resolved `ClipData`, not which button is live, so
 * this section stamps the last-played clip label locally and shows it only while
 * the store reports a clip is playing (`clipActive`). When playback ends —
 * natural completion or stop — `clipActive` flips false and the readout falls
 * back to "—". Deriving from store state (rather than awaiting a play Promise)
 * keeps the section a plain dispatcher with no engine handle.
 *
 * ### Why the tours have no "now playing"
 *
 * `startTour` is fire-and-forget, and the running tour hides the whole HUD —
 * including this panel — via `setUiHidden(true)`. A readout would be both
 * unfeedable and invisible. Aborting a running tour is therefore a keyboard
 * gesture (Esc), not a button here.
 */

import { useState, type ReactElement } from 'react';

import type { ClipId } from '../../@types/animation/ClipId';
import type { TourId } from '../../@types/animation/tour/TourId';
import { clipRegistry } from '../../data/animation/clips/clipRegistry';
import { tourRegistry } from '../../data/animation/tours/tourRegistry';
import styles from './ClipTriggersSection.module.css';

export type ClipTriggersSectionProps = {
  /** Live "is a clip playing" flag from the store (`selectClipActive`). */
  clipActive: boolean;
  /** Play a registered clip by id (fire-and-forget dispatch). */
  onStartClip: (id: ClipId) => void;
  /** Abort the active clip immediately (no-op when nothing is playing). */
  onStopClip: () => void;
  /** Launch a registered guided tour by id (fire-and-forget; hides the HUD until it ends). */
  onStartTour: (id: TourId) => void;
};

// Registry rows → buttons. No switch, no per-clip control-flow edit: a new
// registry entry is a new button.
const CLIPS = Object.values(clipRegistry);
const TOURS = Object.values(tourRegistry);

export function ClipTriggersSection({
  clipActive,
  onStartClip,
  onStopClip,
  onStartTour,
}: ClipTriggersSectionProps): ReactElement {
  // The label of the last clip the user started. Shown only while `clipActive`,
  // so it self-clears when playback ends without any Promise plumbing.
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const playing = clipActive ? lastLabel : null;

  const handlePlay = (id: ClipId, label: string): void => {
    setLastLabel(label);
    onStartClip(id);
  };

  return (
    <details className={styles.root}>
      <summary className={styles.summary}>Clips &amp; Tours</summary>
      <div className={styles.body}>
        <div className={styles.buttonRow}>
          {CLIPS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={styles.button}
              onClick={() => handlePlay(id, label)}
            >
              ▶ {label}
            </button>
          ))}
          <button type="button" className={styles.button} onClick={onStopClip}>
            ■ Stop
          </button>
        </div>
        <div className={styles.readout}>
          Currently playing: {playing ?? <span className={styles.muted}>—</span>}
        </div>
        <div className={styles.buttonRow}>
          {TOURS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={styles.button}
              onClick={() => onStartTour(id)}
            >
              ▶ {label}
            </button>
          ))}
        </div>
        <div className={styles.muted}>Tour hides the HUD — → next beat, Esc to exit.</div>
      </div>
    </details>
  );
}
