// src/components/DebugPanel/CameraStateSection.tsx
/**
 * CameraStateSection — the camera-pivot branch's DebugPanel readout: the
 * regime/arm state, the full orientation pipeline (roll against the scene up
 * AND the body spin axis, the band's ride target), and the live input state.
 * One rows model feeds both the rendered grid and the copy-all clipboard dump,
 * so what the user pastes is exactly what they saw. Polls at 4 Hz like every
 * textual DebugPanel readout; numbers render at full JS precision on purpose —
 * this section exists to capture data, not to be pretty.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { PoseFrame } from '../../@types/camera/PoseFrame';
import { SURFACE_REGIME } from '../../data/camera/surfaceRegime';
import DebugSection from './DebugSection';
import styles from './CameraStateSection.module.css';

export type CameraStateSectionProps = {
  cameraDebug: () => CameraDebugSnapshot;
};

const POLL_MS = 250;

type Row = { readonly key: string; readonly value: string; readonly warn?: boolean };
type Group = { readonly title: string; readonly rows: readonly Row[] };

function frameLabel(frame: PoseFrame): string {
  return frame === 'absolute' ? 'absolute' : `body:${frame.body}`;
}

/** Full JS precision (shortest round-trip form); em-dash for absent values. */
function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : String(n);
}

function groupsOf(snap: CameraDebugSnapshot): Group[] {
  return [
    {
      title: 'regime',
      rows: [
        { key: 'stored_regime', value: frameLabel(snap.storedFrame) },
        {
          key: 'rendered_arm',
          value: frameLabel(snap.renderedFrame) + (snap.armMismatch ? '  ⚠ MISMATCH' : ''),
          warn: snap.armMismatch,
        },
        { key: 'body', value: snap.engagedBodyId ?? '—' },
        { key: 'active_driver', value: snap.activeDriverId },
      ],
    },
    {
      title: 'altitude',
      rows: [
        { key: 'h_over_R', value: num(snap.hOverR) },
        { key: 'altitude_m', value: num(snap.altitudeM) },
        { key: 'distance_mpc', value: num(snap.distanceMpc) },
        {
          key: 'band_engage/disengage',
          value: `${SURFACE_REGIME.engageHR} / ${SURFACE_REGIME.disengageHR}`,
        },
        { key: 'ceiling_maxTiltRad', value: num(snap.ceilingRad) },
        { key: 'band_authority', value: num(snap.bandAuthority) },
        { key: 'band_up_weight', value: num(snap.bandUpWeight) },
      ],
    },
    {
      title: 'orientation',
      rows: [
        { key: 'scene_frame', value: snap.orientationFrame },
        { key: 'heading_rad', value: num(snap.headingRad) },
        { key: 'tilt_rad', value: num(snap.tiltRad) },
        { key: 'roll_vs_scene_up_rad', value: num(snap.rollRad) },
        { key: 'roll_for_spin_axis_up_rad', value: num(snap.poleRollRad) },
        { key: 'roll_residual_to_spin_axis_rad', value: num(snap.rollToPoleRad) },
        { key: 'band_target_roll_rad', value: num(snap.bandTargetRollRad) },
        { key: 'roll_residual_to_band_target_rad', value: num(snap.rollToTargetRad) },
      ],
    },
    {
      title: 'input',
      rows: [
        { key: 'gesture', value: snap.gestureMode ?? 'none' },
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
      ],
    },
    {
      title: 'epoch',
      rows: [
        { key: 'rendered_sim_days', value: num(snap.lastRenderedSimDays) },
        { key: 'live_sim_days', value: num(snap.liveSimDays) },
        {
          key: 'delta_s',
          value: String(snap.epochDeltaDays * 86_400) + (snap.epochMismatch ? '  ⚠ MISMATCH' : ''),
          warn: snap.epochMismatch,
        },
      ],
    },
  ];
}

function copyTextOf(groups: readonly Group[]): string {
  const lines = ['camera-debug (rad = radians, m = metres, mpc = megaparsec)'];
  for (const group of groups) {
    lines.push(`[${group.title}]`);
    for (const row of group.rows) lines.push(`${row.key}: ${row.value}`);
  }
  return lines.join('\n');
}

function CameraStateSection({ cameraDebug }: CameraStateSectionProps): ReactElement {
  const [snap, setSnap] = useState<CameraDebugSnapshot>(cameraDebug);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSnap(cameraDebug()), POLL_MS);
    return () => clearInterval(id);
  }, [cameraDebug]);

  const groups = groupsOf(snap);

  return (
    <DebugSection title="Camera">
      <button
        type="button"
        className={styles.copyButton}
        onClick={() => {
          // A fresh snapshot, not the 4 Hz-stale one, so the paste is current.
          void navigator.clipboard.writeText(copyTextOf(groupsOf(cameraDebug()))).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? 'copied ✓' : 'copy all'}
      </button>
      {groups.map((group) => (
        <div key={group.title}>
          <div className={styles.groupTitle}>{group.title}</div>
          <div className={styles.grid}>
            {group.rows.map((row) => (
              <div key={row.key} className={row.warn ? styles.rowWarn : styles.row}>
                <span className={styles.key}>{row.key}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </DebugSection>
  );
}

export default CameraStateSection;
