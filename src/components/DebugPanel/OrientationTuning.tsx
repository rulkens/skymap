/**
 * OrientationTuning — the feel-trial knobs (ruling 11), a subsection of the Camera
 * debug section. The engage/disengage sliders write through `setSurfaceBand`, the
 * clamped ONE home the regime hysteresis and the orientation band both read —
 * ruling 10 forbids them diverging. The records are engine-side module state, read
 * directly per the DebugPanel convention for non-store data, and session-only.
 * Values re-read from the records after every write, so a clamp that moved the
 * OTHER knob shows immediately.
 */

import { useReducer, type ReactNode } from 'react';

export type OrientationTuningProps = {
  /**
   * The session's remembered tilt (ruling 12), read-only trial observability.
   * Pre-formatted by the caller (CameraStateSection's `num`), the same
   * contract as DebugSlider's `readout` — one formatting home per panel.
   */
  readonly rememberedTiltReadout: string;
};
import type { SurfaceBandKnob } from '../../@types/camera/SurfaceBandKnob';
import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import {
  setSurfaceBand,
  SURFACE_BAND_LIMITS,
  SURFACE_REGIME,
} from '../../data/camera/surfaceRegime';
import DebugSlider from './DebugSlider';
import styles from './OrientationTuning.module.css';

type TuningState = { readonly tick: number; readonly lastClamped: SurfaceBandKnob };
/** `clamped` omitted: a re-render bump unrelated to the band knobs. */
type TuningAction = { readonly clamped?: SurfaceBandKnob };

function tuningReducer(state: TuningState, action: TuningAction): TuningState {
  return {
    tick: state.tick + 1,
    lastClamped: action.clamped === undefined ? state.lastClamped : action.clamped,
  };
}

/** Ruling 19's ×1.10 clamp, surfaced live rather than left to the tooltip. */
function hysteresisReadoutOf(
  limits: typeof SURFACE_BAND_LIMITS,
  lastClamped: SurfaceBandKnob,
): string {
  const ratio = SURFACE_REGIME.disengageHR / SURFACE_REGIME.engageHR;
  if (Math.abs(ratio - limits.minRatio) < 1e-9) {
    return `AT FLOOR (${lastClamped ?? '?'} yielded)`;
  }
  return `${ratio.toFixed(2)} (floor ${limits.minRatio.toFixed(2)})`;
}

function OrientationTuning({ rememberedTiltReadout }: OrientationTuningProps): ReactNode {
  const [{ lastClamped }, dispatch] = useReducer(tuningReducer, { tick: 0, lastClamped: null });
  const limits = SURFACE_BAND_LIMITS;
  return (
    <div className={styles.root}>
      <div className={styles.title}>orientation tuning</div>
      <div className={styles.readoutRow}>
        <span>remembered_tilt_rad</span>
        <span>{rememberedTiltReadout}</span>
      </div>
      <div className={styles.readoutRow}>
        <span>hysteresis (dis/eng)</span>
        <span>{hysteresisReadoutOf(limits, lastClamped)}</span>
      </div>
      <DebugSlider
        label="engage h/R"
        value={SURFACE_REGIME.engageHR}
        min={limits.engageMin}
        max={limits.engageMax}
        step={0.05}
        readout={SURFACE_REGIME.engageHR.toFixed(2)}
        title="h/R at which the body arm takes over (default 0.2; disengage kept > this × 1.1)"
        onChange={(v) => {
          const clamped = setSurfaceBand({ engageHR: v });
          dispatch({ clamped });
        }}
      />
      <DebugSlider
        label="disengage h/R"
        value={SURFACE_REGIME.disengageHR}
        min={limits.disengageMin}
        max={limits.disengageMax}
        step={0.05}
        readout={SURFACE_REGIME.disengageHR.toFixed(2)}
        title="h/R at which it hands back (default 0.4; kept > engage × 1.1)"
        onChange={(v) => {
          const clamped = setSurfaceBand({ disengageHR: v });
          dispatch({ clamped });
        }}
      />
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={ORIENT_TUNING.blendSpace === 'log'}
          onChange={(e) => {
            ORIENT_TUNING.blendSpace = e.target.checked ? 'log' : 'lin';
            dispatch({});
          }}
        />
        log(h/R) blend-space
      </label>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={ORIENT_TUNING.northUp}
          onChange={(e) => {
            ORIENT_TUNING.northUp = e.target.checked;
            dispatch({});
          }}
        />
        north-up framing
      </label>
    </div>
  );
}

export default OrientationTuning;
