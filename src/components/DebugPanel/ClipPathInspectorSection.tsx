/**
 * ClipPathInspectorSection — dev-panel controls for the clip-path debug overlay.
 *
 * Pick a registered clip, click "Calculate" to sample its camera route into the
 * `clipPathInspector` subsystem (the engine draws a speed-coloured polyline +
 * a scrub gizmo), scrub through it, "Play this path" to fly the EXACT computed
 * route (deterministic replay — see `replayInspectedPath`), or "Clear" to hide
 * it. All are plain dispatches wired by the container (`inspectClipPath` /
 * `clearClipPath` / `setClipPathScrub` / `replayInspectedPath`); the section
 * holds only the dropdown's pending choice locally — everything else is store.
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
import type { SplineMode } from '../../@types/animation/SplineMode';
import type { ClipPathTuningActive } from '../../@types/settings/ClipPathTuningActive';
import type { ClipPathTuningKnob } from '../../@types/settings/ClipPathTuningKnob';
import { clipRegistry } from '../../data/animation/clips/clipRegistry';
import styles from './ClipPathInspectorSection.module.css';

export type ClipPathInspectorSectionProps = {
  /** The clip whose path is currently computed (`selectClipPathInspectId`), or null. */
  inspectId: ClipId | null;
  /** Scrubber position as a [0,1] fraction (`selectClipPathScrub`). */
  scrub01: number;
  /** Sample the named clip's path into the overlay (the "Calculate" button). */
  onInspect: (id: ClipId) => void;
  /** Re-sample the shown clip keeping the last start pose (the "Re-calc" button). */
  onRecalc: (id: ClipId) => void;
  /** Hide the overlay + drop the snapshot (the "Clear" button). */
  onClear: () => void;
  /** Move the scrubber (a [0,1] fraction). */
  onScrub: (scrub01: number) => void;
  /** Fly the exact computed route — deterministic replay (the "Play this path" button). */
  onReplay: () => void;
  /** Align-in seconds (start-aim blend) — applied on the next Calculate. */
  align: number;
  /** Ease ramp seconds each end (0 = named ease) — applied on the next Calculate. */
  rampSec: number;
  /** Per-target brake depth [0,1] (0 = cruise through) — applied on the next Calculate. */
  linger: number;
  /** Spline basis (centripetal Catmull-Rom ↔ causal Hermite) — applied on the next Calculate. */
  spline: SplineMode;
  /** Causal-Hermite turn-delay magnitude (inert in centripetal) — applied on the next Calculate. */
  turnDelay: number;
  /** Seconds the look leads the eye along the path (0 = spline the per-knot aim) — applied on the next Calculate. */
  lookAhead: number;
  /** Per-knob override gates — an inactive knob keeps the clip's authored value. */
  tuningActive: ClipPathTuningActive;
  /** Set the align-in seconds. */
  onAlign: (align: number) => void;
  /** Set the ease-ramp seconds. */
  onRampSec: (rampSec: number) => void;
  /** Set the per-target brake depth. */
  onLinger: (linger: number) => void;
  /** Set the spline basis. */
  onSpline: (spline: SplineMode) => void;
  /** Set the causal-Hermite turn-delay magnitude. */
  onTurnDelay: (turnDelay: number) => void;
  /** Set the look-ahead seconds. */
  onLookAhead: (lookAhead: number) => void;
  /** Toggle a single knob's override on/off (the row checkbox). */
  onTuningActive: (knob: ClipPathTuningKnob, active: boolean) => void;
};

// Registry rows → dropdown options. A new clip is a new option, no edit here.
const CLIPS = Object.values(clipRegistry);

export function ClipPathInspectorSection({
  inspectId,
  scrub01,
  onInspect,
  onRecalc,
  onClear,
  onScrub,
  onReplay,
  align,
  rampSec,
  linger,
  spline,
  turnDelay,
  lookAhead,
  tuningActive,
  onAlign,
  onRampSec,
  onLinger,
  onSpline,
  onTurnDelay,
  onLookAhead,
  onTuningActive,
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
          {/* Re-sample the SHOWN clip keeping the start the last Calculate captured:
              move the camera out to view the path, tweak a knob, Re-calc to see it
              without the start jumping to the overview camera. */}
          <button
            type="button"
            className={styles.button}
            onClick={() => inspectId !== null && onRecalc(inspectId)}
            disabled={!active}
            title="Recompute the shown path (foci + tuning) keeping the original start camera"
          >
            Re-calc
          </button>
          <button type="button" className={styles.button} onClick={onClear}>
            Clear
          </button>
        </div>

        <div className={styles.scrubRow}>
          <input
            className={styles.check}
            type="checkbox"
            title="Override the clip's align"
            checked={tuningActive.align}
            onChange={(e) => onTuningActive('align', e.target.checked)}
          />
          <span className={styles.knobLabel}>align</span>
          <input
            className={styles.scrub}
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={align}
            onChange={(e) => onAlign(Number(e.target.value))}
          />
          <span className={styles.readout}>{align.toFixed(2)}s</span>
        </div>
        <div className={styles.scrubRow}>
          <input
            className={styles.check}
            type="checkbox"
            title="Override the clip's ramp"
            checked={tuningActive.rampSec}
            onChange={(e) => onTuningActive('rampSec', e.target.checked)}
          />
          <span className={styles.knobLabel}>ramp</span>
          <input
            className={styles.scrub}
            type="range"
            min={0}
            max={6}
            step={0.1}
            value={rampSec}
            onChange={(e) => onRampSec(Number(e.target.value))}
          />
          <span className={styles.readout}>{rampSec.toFixed(1)}s</span>
        </div>
        <div className={styles.scrubRow}>
          <input
            className={styles.check}
            type="checkbox"
            title="Override the clip's linger"
            checked={tuningActive.linger}
            onChange={(e) => onTuningActive('linger', e.target.checked)}
          />
          <span className={styles.knobLabel}>linger</span>
          <input
            className={styles.scrub}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={linger}
            onChange={(e) => onLinger(Number(e.target.value))}
          />
          <span className={styles.readout}>{linger.toFixed(2)}</span>
        </div>
        <div className={styles.scrubRow}>
          <input
            className={styles.check}
            type="checkbox"
            title="Override the clip's spline basis"
            checked={tuningActive.spline}
            onChange={(e) => onTuningActive('spline', e.target.checked)}
          />
          <span className={styles.knobLabel}>spline</span>
          <select
            className={styles.select}
            value={spline}
            onChange={(e) => onSpline(e.target.value as SplineMode)}
          >
            <option value="centripetal">centripetal</option>
            <option value="causalHermite">causal Hermite</option>
          </select>
        </div>
        {/* Causal-only sub-knobs: turnDelay (overshoot) + lookAhead (look-lead)
            are meaningless on centripetal, so they only appear in causal mode and
            carry no own checkbox — touching either rides the one `spline` gate. */}
        {spline === 'causalHermite' && (
          <div className={styles.causalKnobs}>
            <div className={styles.scrubRow}>
              <span className={styles.knobLabel}>turn delay</span>
              <input
                className={styles.scrub}
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={turnDelay}
                onChange={(e) => onTurnDelay(Number(e.target.value))}
              />
              <span className={styles.readout}>{turnDelay.toFixed(2)}</span>
            </div>
            <div className={styles.scrubRow}>
              <span className={styles.knobLabel}>look ahead</span>
              <input
                className={styles.scrub}
                type="range"
                min={0}
                max={6}
                step={0.1}
                value={lookAhead}
                onChange={(e) => onLookAhead(Number(e.target.value))}
              />
              <span className={styles.readout}>{lookAhead.toFixed(1)}s</span>
            </div>
          </div>
        )}
        {active && (
          <div className={styles.muted}>
            Checked knobs override the clip; unchecked keep its authored value. Re-Calculate to
            apply.
          </div>
        )}

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

        <div className={styles.buttonRow}>
          <button type="button" className={styles.button} onClick={onReplay} disabled={!active}>
            ▶ Play this path
          </button>
        </div>
        {active && (
          <div className={styles.muted}>Flies the exact computed route. Stop / Esc to abort.</div>
        )}

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
