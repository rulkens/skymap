/**
 * OrientationTuning — the feel-trial knobs (ruling 11), a subsection of the Camera
 * debug section. The engage/disengage sliders write through `setSurfaceBand`, the
 * clamped home of the regime hysteresis; the tilt-blend pair writes through
 * `setTiltBand`. The records are engine-side module state, read directly per the
 * DebugPanel convention for non-store data, and session-only.
 * Values re-read from the records after every write, so a clamp that moved the
 * OTHER knob shows immediately.
 */

import { useReducer, type ReactNode } from 'react';

import type { SurfaceBandKnob } from '../../@types/camera/SurfaceBandKnob';
import type { TiltBandKnob } from '../../@types/camera/TiltBandKnob';
import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import {
  setSurfaceBand,
  SURFACE_BAND_LIMITS,
  SURFACE_REGIME,
} from '../../data/camera/surfaceRegime';
import { setTiltBand, TILT_BAND, TILT_BAND_LIMITS } from '../../data/camera/tiltBand';
import DebugSlider from './DebugSlider';
import styles from './OrientationTuning.module.css';

export type OrientationTuningProps = {
  /**
   * The session's remembered tilt (ruling 12), read-only trial observability.
   * Pre-formatted by the caller (CameraStateSection's `num`), the same
   * contract as DebugSlider's `readout` — one formatting home per panel.
   */
  readonly rememberedTiltReadout: string;
};

type TuningState = { readonly lastClamped: SurfaceBandKnob | TiltBandKnob };
/** `clamped` omitted: a re-render bump unrelated to the band knobs. */
type TuningAction = { readonly clamped?: SurfaceBandKnob | TiltBandKnob };

// A fresh object every time, so an omitted `clamped` still re-reads the records.
function tuningReducer(state: TuningState, action: TuningAction): TuningState {
  return { lastClamped: action.clamped === undefined ? state.lastClamped : action.clamped };
}

/** Ruling 19's ×1.10 clamp, surfaced live rather than left to the tooltip. */
function hysteresisReadoutOf(lastClamped: SurfaceBandKnob | TiltBandKnob): string {
  const { minRatio } = SURFACE_BAND_LIMITS;
  const ratio = SURFACE_REGIME.disengageHR / SURFACE_REGIME.engageHR;
  if (Math.abs(ratio - minRatio) < 1e-9) {
    return `AT FLOOR (${lastClamped ?? '?'} yielded)`;
  }
  return `${ratio.toFixed(2)} (floor ${minRatio.toFixed(2)})`;
}

function OrientationTuning({ rememberedTiltReadout }: OrientationTuningProps): ReactNode {
  const [{ lastClamped }, dispatch] = useReducer(tuningReducer, { lastClamped: null });
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
        <span>{hysteresisReadoutOf(lastClamped)}</span>
      </div>
      <DebugSlider
        label="engage h/R"
        value={SURFACE_REGIME.engageHR}
        min={limits.engageMin}
        max={limits.engageMax}
        step={0.05}
        readout={SURFACE_REGIME.engageHR.toFixed(2)}
        title="h/R at which the body arm takes over (disengage kept > this × 1.1)"
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
        title="h/R at which it hands back (kept > engage × 1.1)"
        onChange={(v) => {
          const clamped = setSurfaceBand({ disengageHR: v });
          dispatch({ clamped });
        }}
      />
      <DebugSlider
        label="tilt-blend full h/R"
        value={TILT_BAND.fullHR}
        min={TILT_BAND_LIMITS.fullMin}
        max={TILT_BAND_LIMITS.fullMax}
        step={0.05}
        readout={TILT_BAND.fullHR.toFixed(2)}
        title="h/R at or below which the blend is pure body ENU (full tilt)"
        onChange={(v) => {
          const clamped = setTiltBand({ fullHR: v });
          dispatch({ clamped });
        }}
      />
      <DebugSlider
        label="tilt-blend zero h/R"
        value={TILT_BAND.zeroHR}
        min={TILT_BAND_LIMITS.zeroMin}
        max={TILT_BAND_LIMITS.zeroMax}
        step={0.05}
        readout={TILT_BAND.zeroHR.toFixed(2)}
        title="h/R at or above which it is the scene up (zero tilt); capped at disengage"
        onChange={(v) => {
          const clamped = setTiltBand({ zeroHR: v });
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
