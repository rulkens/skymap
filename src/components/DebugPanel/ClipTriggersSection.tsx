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
 * wired by `DebugPanelContainer` (`startClip` / `stopClip` / `startTour` request
 * actions, each naming a registered id), the same way the other panel knobs
 * dispatch.
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

const buttonStyle: React.CSSProperties = {
  font: 'inherit',
  color: '#cfc',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 3,
  padding: '2px 8px',
  cursor: 'pointer',
};

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
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Clips &amp; Tours</summary>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CLIPS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              style={buttonStyle}
              onClick={() => handlePlay(id, label)}
            >
              ▶ {label}
            </button>
          ))}
          <button type="button" style={buttonStyle} onClick={onStopClip}>
            ■ Stop
          </button>
        </div>
        <div style={{ opacity: 0.8 }}>
          Currently playing: {playing ?? <span style={{ opacity: 0.5 }}>—</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {TOURS.map(({ id, label }) => (
            <button key={id} type="button" style={buttonStyle} onClick={() => onStartTour(id)}>
              ▶ {label}
            </button>
          ))}
        </div>
        <div style={{ opacity: 0.5 }}>Tour hides the HUD — → next beat, Esc to exit.</div>
      </div>
    </details>
  );
}
