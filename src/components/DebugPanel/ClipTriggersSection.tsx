/**
 * ClipTriggersSection — dev-panel controls for playing Layer-1 clips and the
 * demo tour directly, the live call-site for showcase recordings.
 *
 * The spike camera *drivers* (`?webshow` et al.) were torn down once the
 * animation system landed, leaving no in-browser way to trigger a clip. This
 * section fills that gap with plain buttons — no URL gate. Play/stop/tour are
 * fire-and-forget dispatches wired by `DebugPanelContainer` (`playClip` /
 * `stopClip` / `startTour` request actions), the same way the other panel knobs
 * dispatch.
 *
 * ### Why the readout reads `clipActive`, not a Promise
 *
 * A `ClipData` carries no id, so `camera.clip` can't name which button is live —
 * the button owns the label. This section stamps the last-played label locally
 * and shows it only while the store reports a clip is playing (`clipActive`).
 * When playback ends — natural completion or stop — `clipActive` flips false and
 * the readout falls back to "—". Deriving from store state (rather than awaiting
 * a play Promise) keeps the section a plain dispatcher with no engine handle.
 *
 * ### Why the tour has no "now playing"
 *
 * `startTour` is fire-and-forget, and the running tour hides the whole HUD —
 * including this panel — via `setUiHidden(true)`. A readout would be both
 * unfeedable and invisible. Aborting a running tour is therefore a keyboard
 * gesture (Esc), not a button here.
 */

import { useState, type ReactElement } from 'react';

import type { ClipData } from '../../@types/animation/ClipData';
import type { BeatData } from '../../@types/tour/BeatData';
import { cosmicFlows } from '../../clips/cosmicFlows';
import { demoTour } from '../../clips/demoTour';

export type ClipTriggersSectionProps = {
  /** Live "is a clip playing" flag from the store (`selectClipActive`). */
  clipActive: boolean;
  /** Play a single clip (fire-and-forget dispatch). */
  onPlayClip: (clip: ClipData) => void;
  /** Abort the active clip immediately (no-op when nothing is playing). */
  onStopClip: () => void;
  /** Launch a guided tour (fire-and-forget; hides the HUD until it ends). */
  onStartTour: (beats: readonly BeatData[]) => void;
};

// The clips exposed as buttons. A registry row, not a switch — adding a new
// showcase clip is one entry here, no control-flow edit.
const CLIPS: ReadonlyArray<{ label: string; clip: ClipData }> = [
  { label: 'Cosmic Flows', clip: cosmicFlows },
];

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
  onPlayClip,
  onStopClip,
  onStartTour,
}: ClipTriggersSectionProps): ReactElement {
  // The label of the last clip the user started. Shown only while `clipActive`,
  // so it self-clears when playback ends without any Promise plumbing.
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const playing = clipActive ? lastLabel : null;

  const handlePlay = (label: string, clip: ClipData): void => {
    setLastLabel(label);
    onPlayClip(clip);
  };

  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Clips &amp; Tour</summary>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CLIPS.map(({ label, clip }) => (
            <button
              key={label}
              type="button"
              style={buttonStyle}
              onClick={() => handlePlay(label, clip)}
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
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" style={buttonStyle} onClick={() => onStartTour(demoTour)}>
            ▶ Play demo tour
          </button>
        </div>
        <div style={{ opacity: 0.5 }}>Tour hides the HUD — → next beat, Esc to exit.</div>
      </div>
    </details>
  );
}
