/**
 * CameraSection — DebugPanel readout for camera/navigation internals: pose,
 * live vectors, the active orientation basis, the zoom-bias eye-correction
 * (spec §4.2/§4.3 — the "dragging also zooms" investigation), gesture state,
 * and the surface-follow/idle-tick cadence. Read-only, for visually chasing
 * the camera bug — not a control surface. Polls the engine handle at
 * `FrameStatsRow`'s cadence: these numbers change every frame, a human only
 * reads them a few times a second.
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

const EMPTY_CONTROLS: OrbitControlsDebugSample = {
  dragMode: null,
  activePointers: 0,
  wheelDeltaY: 0,
  wheelAtMs: 0,
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

function CameraSection({ engineHandleRef }: CameraSectionProps): ReactElement {
  const [sample, setSample] = useState<Sample>(() => readSample(engineHandleRef));

  useEffect(() => {
    const id = setInterval(() => setSample(readSample(engineHandleRef)), POLL_MS);
    return () => clearInterval(id);
  }, [engineHandleRef]);

  const { camera, controls } = sample;

  if (!camera) {
    return (
      <DebugSection title="Camera">
        <div className={styles.readout}>Camera not ready.</div>
      </DebugSection>
    );
  }

  const altitudeMpc =
    camera.pivotRadiusMpc === null ? null : camera.distanceMpc - camera.pivotRadiusMpc;
  const pivotKm =
    camera.pivotRadiusMpc === null ? null : camera.pivotRadiusMpc / SCALE_UNITS.KM_TO_MPC;
  const wheelAgoMs = controls.wheelAtMs === 0 ? null : performance.now() - controls.wheelAtMs;

  return (
    <DebugSection title="Camera">
      <div className={styles.group}>Pose</div>
      <Row
        label="distance"
        value={`${camera.distanceMpc.toPrecision(6)} Mpc (${formatDistance(camera.distanceMpc)})`}
      />
      <Row label="pivotR" value={pivotKm === null ? '—' : `${pivotKm.toFixed(3)} km`} />
      <Row label="altitude" value={altitudeMpc === null ? '—' : formatDistance(altitudeMpc)} />
      <Row
        label="yaw/pitch/roll"
        value={`${(camera.yawRad * RAD_TO_DEG).toFixed(2)}° / ${(camera.pitchRad * RAD_TO_DEG).toFixed(2)}° / ${(camera.rollRad * RAD_TO_DEG).toFixed(2)}°`}
      />

      <div className={styles.group}>Vectors (Mpc)</div>
      <Row label="target" value={vec3Mpc(camera.targetMpc)} />
      <Row label="position" value={vec3Mpc(camera.positionMpc)} />

      <div className={styles.group}>Basis</div>
      <Row label="orientation" value={camera.orientationMode} />

      <div className={styles.group}>Zoom bias</div>
      <Row
        label="anchor"
        value={
          camera.zoomBiasAnchor
            ? `${camera.zoomBiasAnchor.bodyId} @ ${camera.zoomBiasAnchor.point.lonDeg.toFixed(3)}°, ${camera.zoomBiasAnchor.point.latDeg.toFixed(3)}°`
            : 'none'
        }
      />
      <Row label="applied" value={`${camera.zoomBiasAppliedMeters.toFixed(2)} m`} />

      <div className={styles.group}>Gestures</div>
      <Row label="drag" value={controls.dragMode ?? 'none'} />
      <Row label="pointers" value={controls.activePointers} />
      <Row
        label="wheel"
        value={
          wheelAgoMs === null
            ? '—'
            : `Δ${controls.wheelDeltaY.toFixed(0)}, ${wheelAgoMs.toFixed(0)} ms ago`
        }
      />

      <div className={styles.group}>Follow / cadence</div>
      <Row label="surfaceFollow" value={camera.surfaceFollowEngaged ? 'engaged' : 'disengaged'} />
      <Row label="idleTick" value={`${camera.idleTickMs.toFixed(0)} ms`} />
    </DebugSection>
  );
}

export default CameraSection;
