/**
 * CameraSection — DebugPanel readout for camera/navigation internals: pose,
 * live vectors, the active orientation basis, the pivot's accumulated strafe
 * (pan + zoom-to-cursor lateral), gesture state, and the surface-follow /
 * idle-tick cadence. Read-only, for visually chasing camera behaviour — not a
 * control surface. Polls the engine handle at `FrameStatsRow`'s cadence: these
 * numbers change every frame, a human only reads them a few times a second.
 *
 * "copy JSON" hands over the RAW snapshot — full-precision f64 Mpc, not the
 * ~6-significant-figure values displayed, which is the whole point when the
 * question is a float-precision one.
 */

import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type { RefObject } from 'react';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { CameraDebugSnapshot } from '../../@types/engine/CameraDebugSnapshot';
import type { OrbitControlsDebugSample } from '../../@types/camera/OrbitControlsDebugSample';
import type { Vec3 } from '../../@types/math/Vec3';
import { formatDistance } from '../../utils/format/formatDistance';
import { SCALE_UNITS } from '../../data/scaleUnits';
import DebugSection from './DebugSection';
import styles from './CameraSection.module.css';

export type CameraSectionProps = {
  readonly engineHandleRef: RefObject<EngineHandle | null>;
};

const POLL_MS = 150; // ~7 Hz, within the FrameStatsRow-established 4-10 Hz debug-readout budget
const RAD_TO_DEG = 180 / Math.PI;
const COPIED_MS = 1200;

const EMPTY_CONTROLS: OrbitControlsDebugSample = {
  dragMode: null,
  activePointers: 0,
  wheelDeltaY: 0,
  wheelAtMs: 0,
  wheelDropped: false,
};

type Sample = { camera: CameraDebugSnapshot | null; controls: OrbitControlsDebugSample };

function readSample(engineHandleRef: RefObject<EngineHandle | null>): Sample {
  const handle = engineHandleRef.current;
  if (!handle) return { camera: null, controls: EMPTY_CONTROLS };
  return { camera: handle.debug.camera(), controls: handle.debug.controls() };
}

function Row({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}

function vec3Mpc(v: Readonly<Vec3>): string {
  return `${v[0].toPrecision(6)}, ${v[1].toPrecision(6)}, ${v[2].toPrecision(6)}`;
}

/** Magnitude of an Mpc vector, rendered in the adaptive distance units. */
function magnitude(v: Readonly<Vec3>): string {
  return formatDistance(Math.hypot(v[0], v[1], v[2]));
}

function CameraSection({ engineHandleRef }: CameraSectionProps): ReactElement {
  const [sample, setSample] = useState<Sample>(() => readSample(engineHandleRef));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSample(readSample(engineHandleRef)), POLL_MS);
    return () => clearInterval(id);
  }, [engineHandleRef]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  const { camera, controls } = sample;

  if (!camera) {
    return (
      <DebugSection title="Camera">
        <div className={styles.readout}>Camera not ready.</div>
      </DebugSection>
    );
  }

  const pivotKm =
    camera.pivotRadiusMpc === null ? null : camera.pivotRadiusMpc / SCALE_UNITS.KM_TO_MPC;
  const wheelAgoMs = controls.wheelAtMs === 0 ? null : performance.now() - controls.wheelAtMs;

  // Re-read at click time rather than copying the polled `sample`: the user
  // clicks to capture a moment, and the poll can be up to POLL_MS stale.
  const copyJson = (): void => {
    void navigator.clipboard
      .writeText(JSON.stringify(readSample(engineHandleRef), null, 2))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <DebugSection title="Camera">
      <button type="button" className={styles.copy} onClick={copyJson}>
        {copied ? 'copied' : 'copy JSON'}
      </button>

      <div className={styles.group}>Pose</div>
      <Row
        label="distance"
        value={`${camera.distanceMpc.toPrecision(6)} Mpc (${formatDistance(camera.distanceMpc)})`}
      />
      <Row label="pivotR" value={pivotKm === null ? '—' : `${pivotKm.toFixed(3)} km`} />
      <Row
        label="altitude"
        value={camera.altitudeMpc === null ? '—' : formatDistance(camera.altitudeMpc)}
      />
      <Row
        label="yaw/pitch/roll"
        value={`${(camera.yawRad * RAD_TO_DEG).toFixed(2)}° / ${(camera.pitchRad * RAD_TO_DEG).toFixed(2)}° / ${(camera.rollRad * RAD_TO_DEG).toFixed(2)}°`}
      />

      <div className={styles.group}>Vectors (Mpc)</div>
      <Row label="target" value={vec3Mpc(camera.targetMpc)} />
      <Row label="position" value={vec3Mpc(camera.positionMpc)} />

      <div className={styles.group}>Basis</div>
      <Row label="orientation" value={camera.orientationMode} />

      <div className={styles.group}>Pivot strafe</div>
      <Row label="panOffset" value={magnitude(camera.followPanOffsetMpc)} />
      <Row label="zoomLateral" value={magnitude(camera.zoomLateralMpc)} />

      <div className={styles.group}>Gestures</div>
      <Row label="drag" value={controls.dragMode ?? 'none'} />
      <Row label="pointers" value={controls.activePointers} />
      <Row
        label="wheel"
        value={
          wheelAgoMs === null
            ? '—'
            : `Δ${controls.wheelDeltaY.toFixed(0)}, ${wheelAgoMs.toFixed(0)} ms ago${controls.wheelDropped ? ' (dropped)' : ''}`
        }
      />

      <div className={styles.group}>Follow / cadence</div>
      <Row label="surfaceFollow" value={camera.surfaceFollowEngaged ? 'engaged' : 'disengaged'} />
      <Row label="idleTick" value={`${camera.idleTickMs.toFixed(0)} ms`} />
    </DebugSection>
  );
}

export default CameraSection;
