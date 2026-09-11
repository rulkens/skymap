/**
 * OrientationTuning — the band as one visual object (grill Q5): the drawn
 * ruler, then the four edge sliders directly under it, so dragging an edge
 * moves its own tick instead of a number in a different block. Every control
 * dispatches `setCameraTuning`; the live record arrives as a prop from the one
 * reader (`CameraStateSection`), so a clamp that moved the OTHER knob shows on
 * the next render.
 */

import type { ReactNode } from 'react';

import type { CameraTuning } from '../../@types/camera/CameraTuning';
import { CAMERA_TUNING_LIMITS } from '../../data/camera/cameraTuning';
import { setCameraTuning } from '../../state/camera/cameraSlice';
import { useAppDispatch } from '../../store/hooks';
import CameraBandBar from './CameraBandBar';
import DebugSlider from './DebugSlider';
import styles from './OrientationTuning.module.css';

export type OrientationTuningProps = {
  readonly tuning: CameraTuning;
  /** Where the camera sits on the ruler; null when no scene body resolved. */
  readonly hOverR: number | null;
  /**
   * Marker caption, band-weight readout, and the session's remembered tilt
   * (ruling 12). Pre-formatted by the caller, the same contract as
   * DebugSlider's `readout` — one formatting home per panel.
   */
  readonly markerReadout: string;
  readonly weightReadout: string;
  readonly rememberedTiltReadout: string;
};

/** Ruling 19's ×1.10 clamp, surfaced live rather than left to the tooltip. */
function hysteresisReadoutOf(tuning: CameraTuning): string {
  const { minRatio } = CAMERA_TUNING_LIMITS;
  const ratio = tuning.disengageHR / tuning.engageHR;
  if (Math.abs(ratio - minRatio) < 1e-9) return 'AT FLOOR';
  return `${ratio.toFixed(2)} (floor ${minRatio.toFixed(2)})`;
}

function OrientationTuning({
  tuning,
  hOverR,
  markerReadout,
  weightReadout,
  rememberedTiltReadout,
}: OrientationTuningProps): ReactNode {
  const dispatch = useAppDispatch();
  const limits = CAMERA_TUNING_LIMITS;
  return (
    <div className={styles.root}>
      <CameraBandBar
        ticks={[
          { label: 'tilt full', hOverR: tuning.tiltFullHR },
          { label: 'engage', hOverR: tuning.engageHR },
          { label: 'tilt zero', hOverR: tuning.tiltZeroHR },
          { label: 'disengage', hOverR: tuning.disengageHR },
        ]}
        hOverR={hOverR}
        markerLabel={markerReadout}
      />
      <div className={styles.readoutRow}>
        <span>w {weightReadout}</span>
      </div>
      <DebugSlider
        label="engage h/R"
        value={tuning.engageHR}
        min={limits.engageMin}
        max={limits.engageMax}
        step={0.05}
        readout={tuning.engageHR.toFixed(2)}
        title="h/R at which the body arm takes over (disengage kept > this × 1.1)"
        onChange={(v) => dispatch(setCameraTuning({ engageHR: v }))}
      />
      <DebugSlider
        label="disengage h/R"
        value={tuning.disengageHR}
        min={limits.disengageMin}
        max={limits.disengageMax}
        step={0.05}
        readout={tuning.disengageHR.toFixed(2)}
        title="h/R at which it hands back (kept > engage × 1.1)"
        onChange={(v) => dispatch(setCameraTuning({ disengageHR: v }))}
      />
      <DebugSlider
        label="tilt-blend full h/R"
        value={tuning.tiltFullHR}
        min={limits.tiltFullMin}
        max={limits.tiltFullMax}
        step={0.05}
        readout={tuning.tiltFullHR.toFixed(2)}
        title="h/R at or below which the blend is pure body ENU (full tilt)"
        onChange={(v) => dispatch(setCameraTuning({ tiltFullHR: v }))}
      />
      <DebugSlider
        label="tilt-blend zero h/R"
        value={tuning.tiltZeroHR}
        min={limits.tiltZeroMin}
        max={limits.tiltZeroMax}
        step={0.05}
        readout={tuning.tiltZeroHR.toFixed(2)}
        title="h/R at or above which it is the scene up (zero tilt); capped at disengage"
        onChange={(v) => dispatch(setCameraTuning({ tiltZeroHR: v }))}
      />
      <div className={styles.readoutRow}>
        <span>hysteresis (dis/eng)</span>
        <span>{hysteresisReadoutOf(tuning)}</span>
      </div>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={tuning.blendSpace === 'log'}
          onChange={(e) =>
            dispatch(setCameraTuning({ blendSpace: e.target.checked ? 'log' : 'lin' }))
          }
        />
        log(h/R) blend-space
      </label>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={tuning.northUp}
          onChange={(e) => dispatch(setCameraTuning({ northUp: e.target.checked }))}
        />
        north-up framing
      </label>
      <div className={styles.readoutRow}>
        <span>remembered_tilt</span>
        <span>{rememberedTiltReadout}</span>
      </div>
    </div>
  );
}

export default OrientationTuning;
