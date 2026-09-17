/**
 * The `terrain-pick-marker` overlay's own board: its toggle, the radius knob,
 * and the two numbers the marker exists to compare — what the CPU thinks the
 * ground is under the pick, and which pyramid level that answer came from (a
 * shallow level is the tell for a CPU/GPU level disagreement, not decimation).
 * The board's rows are linear, so the LOG mapping happens right here: the
 * store holds metres, the slider carries log10(metres).
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import { DEBUG_OVERLAY_ROWS } from '../../data/debug/debugOverlayRows';
import { TERRAIN_PICK_MARKER_SLIDER_FIELDS } from '../../data/debug/terrainPickMarkerSliderFields';
import DebugOverlayToggles from './DebugOverlayToggles';
import DebugTuningSection from './DebugTuningSection';
import styles from './TerrainPickMarkerTuningSection.module.css';

const MARKER_ROWS = DEBUG_OVERLAY_ROWS.filter(
  (row) => 'section' in row && row.section === 'terrain-pick-marker',
);

/** Matches every other textual DebugPanel readout; the pick is recomputed per
 *  frame, so a slower poll only costs freshness, never correctness. */
const POLL_MS = 250;

export type TerrainPickMarkerTuningSectionProps = {
  readonly radiusM: number;
  readonly onRadiusChange: (radiusM: number) => void;
  readonly overlays: Record<DebugOverlayKey, boolean>;
  readonly onToggle: (key: DebugOverlayKey, enabled: boolean) => void;
  /** `null` before the engine handle exists — the toggle and knob still
   *  render, since neither needs a live frame to be set. */
  readonly cameraDebug: (() => CameraDebugSnapshot) | null;
};

function metres(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${n.toFixed(2)} m`;
}

export function TerrainPickMarkerTuningSection({
  radiusM,
  onRadiusChange,
  overlays,
  onToggle,
  cameraDebug,
}: TerrainPickMarkerTuningSectionProps): ReactElement {
  const [snap, setSnap] = useState<CameraDebugSnapshot | null>(null);

  useEffect(() => {
    if (cameraDebug === null) return;
    setSnap(cameraDebug());
    const id = setInterval(() => setSnap(cameraDebug()), POLL_MS);
    return () => clearInterval(id);
  }, [cameraDebug]);

  const level = snap?.residentHeightLevelAtEye;

  return (
    <DebugTuningSection
      title="Terrain pick marker"
      fields={TERRAIN_PICK_MARKER_SLIDER_FIELDS}
      values={{ radiusLog10M: Math.log10(radiusM) }}
      onSliderChange={(_key, log10M) => onRadiusChange(10 ** log10M)}
    >
      <DebugOverlayToggles rows={MARKER_ROWS} overlays={overlays} onToggle={onToggle} />
      <div className={styles.readout}>terrain under pick: {metres(snap?.terrainPickHeightM)}</div>
      <div className={styles.readout}>
        height level at eye: {level === null || level === undefined ? '—' : `z${level}`}
      </div>
    </DebugTuningSection>
  );
}
