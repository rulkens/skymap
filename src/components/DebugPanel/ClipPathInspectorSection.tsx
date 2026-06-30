/**
 * ClipPathInspectorSection — dev-panel controls for the clip-path debug overlay.
 *
 * Pick a registered clip, click "Calculate" to sample its camera route into the
 * `clipPathInspector` subsystem (the engine draws a speed-coloured polyline +
 * a scrub gizmo), scrub through it, or "Clear" to hide it. All three are plain
 * dispatches wired by `DebugPanelContainer` (`inspectClipPath` / `clearClipPath`
 * / `setClipPathScrub`); the section holds only the dropdown's pending choice
 * locally — everything else lives in the store.
 *
 * ### Why the scrubber is a [0,1] fraction, not seconds
 *
 * The clip's duration lives only in the off-store snapshot (and `compileClip`
 * throws on the focus-bearing demo clip), so the UI can't label the slider in
 * seconds. A normalised 0→1 position needs no duration and maps straight to the
 * nearest sample in `buildClipPathLines`.
 */

import { useState, type ReactElement } from 'react';

import type { ClipId } from '../../@types/animation/ClipId';
import { clipRegistry } from '../../data/animation/clips/clipRegistry';
import styles from './ClipPathInspectorSection.module.css';

export type ClipPathInspectorSectionProps = {
  /** The clip whose path is currently computed (`selectClipPathInspectId`), or null. */
  inspectId: ClipId | null;
  /** Scrubber position as a [0,1] fraction (`selectClipPathScrub`). */
  scrub01: number;
  /** Sample the named clip's path into the overlay (the "Calculate" button). */
  onInspect: (id: ClipId) => void;
  /** Hide the overlay + drop the snapshot (the "Clear" button). */
  onClear: () => void;
  /** Move the scrubber (a [0,1] fraction). */
  onScrub: (scrub01: number) => void;
};

// Registry rows → dropdown options. A new clip is a new option, no edit here.
const CLIPS = Object.values(clipRegistry);

export function ClipPathInspectorSection({
  inspectId,
  scrub01,
  onInspect,
  onClear,
  onScrub,
}: ClipPathInspectorSectionProps): ReactElement {
  // The dropdown's pending choice — seeded from the computed clip, else the
  // first registered clip. Calculate is what commits it to the store.
  const [selected, setSelected] = useState<ClipId>(inspectId ?? CLIPS[0]!.id);
  const active = inspectId !== null;

  return (
    <details className={styles.root}>
      <summary className={styles.summary}>Clip Path Inspector</summary>
      <div className={styles.body}>
        <div className={styles.buttonRow}>
          <select
            className={styles.select}
            value={selected}
            onChange={(e) => setSelected(e.target.value as ClipId)}
          >
            {CLIPS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" className={styles.button} onClick={() => onInspect(selected)}>
            Calculate
          </button>
          <button type="button" className={styles.button} onClick={onClear}>
            Clear
          </button>
        </div>

        <div className={styles.scrubRow}>
          <input
            className={styles.scrub}
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={scrub01}
            disabled={!active}
            onChange={(e) => onScrub(Number(e.target.value))}
          />
          <span className={styles.readout}>{Math.round(scrub01 * 100)}%</span>
        </div>

        <div className={styles.legend}>
          <span className={styles.muted}>slow</span>
          <div className={styles.legendBar} />
          <span className={styles.muted}>fast</span>
        </div>

        {!active && <div className={styles.muted}>Pick a clip and Calculate to show its path.</div>}
      </div>
    </details>
  );
}
