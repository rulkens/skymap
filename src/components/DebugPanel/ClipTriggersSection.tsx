/**
 * ClipTriggersSection — dev-panel controls for playing Layer-1 clips and the
 * demo tour directly, the live call-site for showcase recordings.
 *
 * The spike camera *drivers* (`?webshow` et al.) were torn down once the
 * animation system landed, leaving no in-browser way to trigger a clip. This
 * section fills that gap with plain buttons — no URL gate — wired to the
 * engine handle's `clip.play` / `clip.stop` and `tour.start` seams (threaded
 * down as callbacks by App, the same way `slots` / `timingService` are).
 *
 * ### Why a local "now playing" state, not a store read
 *
 * A `ClipData` carries no id, so the store's `camera.clip` can't name which
 * button is live. The button owns the label, so this section tracks it: on
 * play it stamps the label and clears it when `onPlayClip`'s Promise settles —
 * which resolves on BOTH natural end and `stop()`-driven abort. The stale-stamp
 * guard (`cur === label`) means a second clip started before the first settles
 * wins the readout and the first's late resolve is ignored.
 *
 * ### Why the tour has no "now playing"
 *
 * `tour.start` is fire-and-forget (no Promise), and the running tour hides the
 * whole HUD — including this panel — via `setUiHidden(true)`. A readout would
 * be both unfeedable and invisible. Aborting a running tour is therefore a
 * keyboard gesture (Esc), not a button here.
 */

import { useState, type ReactElement } from 'react';

import type { ClipData } from '../../@types/animation/ClipData';
import type { BeatData } from '../../@types/tour/BeatData';
import { cosmicFlows } from '../../clips/cosmicFlows';
import { demoTour } from '../../clips/demoTour';

export type ClipTriggersSectionProps = {
  /** Play a single clip; the Promise resolves on natural end or stop. */
  onPlayClip: (clip: ClipData) => Promise<void>;
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
  onPlayClip,
  onStopClip,
  onStartTour,
}: ClipTriggersSectionProps): ReactElement {
  const [playing, setPlaying] = useState<string | null>(null);

  const handlePlay = (label: string, clip: ClipData): void => {
    setPlaying(label);
    // Clear only if this clip is still the live one — a newer clip's stamp
    // must not be wiped by this one's late settle.
    void onPlayClip(clip).finally(() => setPlaying((cur) => (cur === label ? null : cur)));
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
