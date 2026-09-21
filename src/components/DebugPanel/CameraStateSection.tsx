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
import { clearOrientPeaks, watchOrientDeltas } from '../../services/engine/camera/orientDeltas';
import { isWorldArm } from '../../services/engine/camera/rungs/isWorldArm';
import { selectCameraBase, selectCameraTuning } from '../../state/camera/selectors';
import { selectTerrainPickMarkerRadiusM } from '../../state/settings/selectors';
import { useAppSelector } from '../../store/hooks';
import { deg } from '../../utils/format/deg';
import CopyButton from '../common/CopyButton/CopyButton';
import { copyTextOf } from './copyTextOf';
import DebugSection from './DebugSection';
import { modelOf } from './modelOf';
import OrientationTuning from './OrientationTuning';
import { poseSnippetOf } from './poseSnippetOf';
import styles from './CameraStateSection.module.css';

export type CameraStateSectionProps = {
  cameraDebug: () => CameraDebugSnapshot;
};

const POLL_MS = 250;

function CameraStateSection({ cameraDebug }: CameraStateSectionProps): ReactElement {
  const [snap, setSnap] = useState<CameraDebugSnapshot>(cameraDebug);
  const [copied, setCopied] = useState(false);
  // The ONE reader of the live tuning: two readers at two rates (here and the
  // 4 Hz snapshot) would be a 250 ms mirror of the value the sliders write.
  const tuning = useAppSelector(selectCameraTuning);
  const markerRadiusM = useAppSelector(selectTerrainPickMarkerRadiusM);
  // `camera.base` (not the 4 Hz snap) so this is never behind the poll; a
  // view's pose is only meaningful in the absolute/world arm — body- and
  // site-anchored poses carry no `target`/`yaw`/`pitch` to paste.
  const base = useAppSelector(selectCameraBase);
  const viewPoseText = isWorldArm(base) ? poseSnippetOf(base.pose) : '';

  useEffect(() => {
    // This mount is what turns the frame loop's Δ/peak record on.
    const stop = watchOrientDeltas();
    const id = setInterval(() => setSnap(cameraDebug()), POLL_MS);
    return () => {
      clearInterval(id);
      stop();
    };
  }, [cameraDebug]);

  const model = modelOf(snap, tuning, markerRadiusM);

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

      {model.site === null ? null : (
        <div className={styles.grid}>
          {model.site.map((row) => (
            <div key={row.key} className={styles.row}>
              <span className={styles.key}>{row.key}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}

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
            .writeText(copyTextOf(modelOf(cameraDebug(), tuning, markerRadiusM)))
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
        }}
      >
        {copied ? 'copied ✓' : 'copy all'}
      </button>
      <CopyButton
        text={viewPoseText}
        label="copy view pose"
        title="Paste into a viewRegistry.ts entry's pose field (world arm only)"
      />
    </DebugSection>
  );
}

export default CameraStateSection;
