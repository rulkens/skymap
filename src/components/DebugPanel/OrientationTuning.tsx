// src/components/DebugPanel/OrientationTuning.tsx
/**
 * OrientationTuning — the round-9 feel-trial knobs (ruling 11), a subsection
 * of the Camera debug section: engage/disengage sliders writing through
 * `setSurfaceBand` (the clamped ONE home the regime hysteresis and the
 * orientation band both read — ruling 10 forbids them diverging), the
 * lin/log blend-space toggle, and the north-up authority toggle. The records
 * are engine-side module state, read directly per the DebugPanel convention
 * for non-store data; session-only — winning values get hardcoded after the
 * trial. Values re-read from the records after every write, so a clamp that
 * moved the OTHER knob shows immediately.
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
import { ORIENT_TUNING } from '../../data/camera/orientTuning';
import {
  setSurfaceBand,
  SURFACE_BAND_LIMITS,
  SURFACE_REGIME,
} from '../../data/camera/surfaceRegime';
import DebugSlider from './DebugSlider';
import styles from './OrientationTuning.module.css';

function OrientationTuning({ rememberedTiltReadout }: OrientationTuningProps): ReactNode {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const limits = SURFACE_BAND_LIMITS;
  return (
    <div className={styles.root}>
      <div className={styles.title}>orientation tuning</div>
      <div className={styles.readoutRow}>
        <span>remembered_tilt_rad</span>
        <span>{rememberedTiltReadout}</span>
      </div>
      <DebugSlider
        label="engage h/R"
        value={SURFACE_REGIME.engageHR}
        min={limits.engageMin}
        max={limits.engageMax}
        step={0.05}
        readout={SURFACE_REGIME.engageHR.toFixed(2)}
        title="h/R at which the body arm takes over (default 1.7)"
        onChange={(v) => {
          setSurfaceBand({ engageHR: v });
          bump();
        }}
      />
      <DebugSlider
        label="disengage h/R"
        value={SURFACE_REGIME.disengageHR}
        min={limits.disengageMin}
        max={limits.disengageMax}
        step={0.05}
        readout={SURFACE_REGIME.disengageHR.toFixed(2)}
        title="h/R at which it hands back (default 3.4; kept > engage × 1.1)"
        onChange={(v) => {
          setSurfaceBand({ disengageHR: v });
          bump();
        }}
      />
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={ORIENT_TUNING.blendSpace === 'log'}
          onChange={(e) => {
            ORIENT_TUNING.blendSpace = e.target.checked ? 'log' : 'lin';
            bump();
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
            bump();
          }}
        />
        north-up framing
      </label>
    </div>
  );
}

export default OrientationTuning;
