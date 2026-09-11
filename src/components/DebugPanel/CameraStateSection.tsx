// src/components/DebugPanel/CameraStateSection.tsx
/**
 * CameraStateSection — the camera-pivot readout, organised by the question it
 * answers (grill 2026-09-10): who is driving (header), is each DOF where it
 * should be (three rows), and where in the band are we (the drawn ruler). One
 * model feeds the degrees on screen AND the full-precision radians `copy all`
 * dumps, so a pasted bug report is the thing that was looked at. Polls at 4 Hz
 * like every textual DebugPanel readout — Δ and peak are measured in the frame
 * loop, so the poll rate cannot blur them.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { CameraDofRow } from '../../@types/camera/CameraDofRow';
import type { OrientDofDelta } from '../../@types/camera/OrientDofDelta';
import type { CameraTuning } from '../../@types/camera/CameraTuning';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import { clearOrientPeaks, watchOrientDeltas } from '../../services/engine/camera/orientDeltas';
import { selectCameraTuning } from '../../state/camera/selectors';
import { useAppSelector } from '../../store/hooks';
import DebugSection from './DebugSection';
import OrientationTuning from './OrientationTuning';
import styles from './CameraStateSection.module.css';

export type CameraStateSectionProps = {
  cameraDebug: () => CameraDebugSnapshot;
};

const POLL_MS = 250;
const RAD_TO_DEG = 180 / Math.PI;

type DofModel = {
  readonly name: string;
  /** North-up unchecked: the target is still a field property, nothing applies it. */
  readonly off: boolean;
  readonly row: CameraDofRow;
  readonly delta: OrientDofDelta;
};
type RawRow = { readonly key: string; readonly value: string };
type PanelModel = {
  readonly header: string;
  readonly badge: string | null;
  readonly dofs: readonly DofModel[];
  /** Radians/raw for the dump; the `*Readout` strings are the same band on screen. */
  readonly band: readonly RawRow[];
  readonly markerReadout: string;
  readonly weightReadout: string;
  readonly rememberedTiltReadout: string;
  readonly raw: readonly RawRow[];
};

function frameLabel(frame: PoseFrame): string {
  return frame === 'absolute' ? 'absolute' : `body:${frame.body}`;
}

/** Full JS precision (shortest round-trip form); em-dash for absent values. */
function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : String(n);
}

function deg(rad: number | null): string {
  return rad === null ? '—' : `${(rad * RAD_TO_DEG).toFixed(1)}°`;
}

function modelOf(snap: CameraDebugSnapshot, tuning: CameraTuning): PanelModel {
  const { dofs, deltas } = snap;
  const off = !tuning.northUp;
  return {
    header: `${frameLabel(snap.renderedFrame)} · ${snap.activeDriverId} · gesture: ${snap.gestureMode ?? 'none'}`,
    badge: snap.armMismatch ? 'ARM MISMATCH' : snap.epochMismatch ? 'EPOCH MISMATCH' : null,
    dofs: [
      { name: 'heading', off, row: dofs.heading, delta: deltas.heading },
      { name: 'tilt', off: false, row: dofs.tilt, delta: deltas.tilt },
      { name: 'roll', off, row: dofs.roll, delta: deltas.roll },
    ],
    band: [
      { key: 'h_over_R', value: num(snap.hOverR) },
      { key: 'altitude_m', value: num(snap.altitudeM) },
      { key: 'band_up_weight', value: num(snap.bandUpWeight) },
      { key: 'engage/disengage_hr', value: `${tuning.engageHR} / ${tuning.disengageHR}` },
      { key: 'tilt_full/zero_hr', value: `${tuning.tiltFullHR} / ${tuning.tiltZeroHR}` },
      { key: 'blend_space', value: tuning.blendSpace },
      { key: 'north_up', value: String(tuning.northUp) },
      { key: 'remembered_tilt_rad', value: num(snap.rememberedTiltRad) },
    ],
    markerReadout:
      snap.hOverR === null
        ? '—'
        : `h/R ${snap.hOverR.toFixed(3)} · ${
            snap.altitudeM === null
              ? '—'
              : `${Math.round(snap.altitudeM).toLocaleString('en-US')} m`
          }`,
    weightReadout: snap.bandUpWeight === null ? '—' : snap.bandUpWeight.toFixed(3),
    rememberedTiltReadout: deg(snap.rememberedTiltRad),
    raw: [
      { key: 'stored_regime', value: frameLabel(snap.storedFrame) },
      { key: 'rendered_arm', value: frameLabel(snap.renderedFrame) },
      { key: 'scene_frame', value: snap.orientationFrame },
      { key: 'distance_mpc', value: num(snap.distanceMpc) },
      {
        key: 'gesture_cursor_hit',
        value: snap.gestureCursorHit === null ? '—' : String(snap.gestureCursorHit),
      },
      {
        key: 'anchor_local_m',
        value: snap.anchorLocalM === null ? '—' : `[${snap.anchorLocalM.map(String).join(', ')}]`,
      },
      { key: 'eye_rel_anchor_m', value: num(snap.eyeRelAnchorMagM) },
      { key: 'last_zoom', value: snap.lastZoomDirection ?? '—' },
      { key: 'rendered_sim_days', value: num(snap.lastRenderedSimDays) },
      { key: 'live_sim_days', value: num(snap.liveSimDays) },
      { key: 'delta_s', value: String(snap.epochDeltaDays * 86_400) },
    ],
  };
}

/** Radians at full precision — the paste target, whatever the screen shows. */
function copyTextOf(model: PanelModel): string {
  const lines = ['camera-debug (rad = radians, m = metres, mpc = megaparsec)'];
  lines.push(`[header] ${model.header}${model.badge === null ? '' : ` ⚠ ${model.badge}`}`);
  lines.push('[dof, radians]');
  for (const dof of model.dofs) {
    lines.push(
      `${dof.name}: current=${num(dof.row.currentRad)} target=${num(dof.row.targetRad)} ` +
        `residual=${num(dof.row.residualRad)} delta=${num(dof.delta.deltaRad)} ` +
        `peak=${num(dof.delta.peakAbsRad)} peak_at_ms=${num(dof.delta.peakAtMs)}` +
        (dof.off ? ' (north-up off)' : ''),
    );
  }
  for (const [title, rows] of [
    ['band', model.band],
    ['raw', model.raw],
  ] as const) {
    lines.push(`[${title}]`);
    for (const row of rows) lines.push(`${row.key}: ${row.value}`);
  }
  return lines.join('\n');
}

function CameraStateSection({ cameraDebug }: CameraStateSectionProps): ReactElement {
  const [snap, setSnap] = useState<CameraDebugSnapshot>(cameraDebug);
  const [copied, setCopied] = useState(false);
  // The ONE reader of the live tuning: two readers at two rates (here and the
  // 4 Hz snapshot) would be a 250 ms mirror of the value the sliders write.
  const tuning = useAppSelector(selectCameraTuning);

  useEffect(() => {
    // This mount is what turns the frame loop's Δ/peak record on.
    const stop = watchOrientDeltas();
    const id = setInterval(() => setSnap(cameraDebug()), POLL_MS);
    return () => {
      clearInterval(id);
      stop();
    };
  }, [cameraDebug]);

  const model = modelOf(snap, tuning);

  return (
    <DebugSection title="Camera">
      <div className={styles.headerLine}>
        <span>{model.header}</span>
        {model.badge === null ? null : <span className={styles.badge}>⚠ {model.badge}</span>}
      </div>

      <div className={styles.dofGrid}>
        <span />
        <span className={styles.colHead}>current</span>
        <span className={styles.colHead}>target</span>
        <span className={styles.colHead}>residual</span>
        <span className={styles.colHead}>Δ</span>
        <span className={styles.colHead}>peak</span>
        {model.dofs.map((dof) => (
          <div key={dof.name} className={styles.dofRow}>
            <span className={styles.dofName}>
              {dof.name}
              {dof.off ? <span className={styles.offMark}> (off)</span> : null}
            </span>
            <span>{deg(dof.row.currentRad)}</span>
            <span>{deg(dof.row.targetRad)}</span>
            <span>{deg(dof.row.residualRad)}</span>
            <span>{deg(dof.delta.deltaRad)}</span>
            <span>{deg(dof.delta.peakAbsRad)}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={styles.smallButton}
        onClick={() => {
          clearOrientPeaks();
          setSnap(cameraDebug());
        }}
      >
        clear peaks
      </button>

      <OrientationTuning
        tuning={tuning}
        hOverR={snap.hOverR}
        markerReadout={model.markerReadout}
        weightReadout={model.weightReadout}
        rememberedTiltReadout={model.rememberedTiltReadout}
      />

      <details className={styles.rawBlock}>
        <summary className={styles.rawSummary}>raw</summary>
        <div className={styles.grid}>
          {model.raw.map((row) => (
            <div key={row.key} className={styles.row}>
              <span className={styles.key}>{row.key}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      </details>

      <button
        type="button"
        className={styles.copyButton}
        onClick={() => {
          // A fresh snapshot, not the 4 Hz-stale one, so the paste is current.
          void navigator.clipboard
            .writeText(copyTextOf(modelOf(cameraDebug(), tuning)))
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
        }}
      >
        {copied ? 'copied ✓' : 'copy all'}
      </button>
    </DebugSection>
  );
}

export default CameraStateSection;
