/**
 * The `terrain-pick-marker` overlay's own board: its toggle, the radius knob,
 * and the two numbers the marker exists to compare — what the CPU thinks the
 * ground is under the pick, and which pyramid level the height under the eye
 * came from (a shallow level is the tell for a CPU/GPU level disagreement, not
 * decimation). The board's rows are linear, so the LOG mapping happens right
 * here: the store holds metres, the slider carries log10(metres).
 */

import type { ReactElement } from 'react';
import type { DebugOverlayKey } from '../../../@types/data/debug/DebugOverlayKey';
import type { TerrainPickMarkerReadout } from '../@types/TerrainPickMarkerReadout';
import { DEBUG_OVERLAY_ROWS } from '../../../data/debug/debugOverlayRows';
import { TERRAIN_PICK_MARKER_SLIDER_FIELDS } from '../../../data/debug/terrainPickMarkerSliderFields';
import DebugOverlayToggles from '../../../components/DebugPanel/DebugOverlayToggles';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import styles from './TerrainPickMarkerTuningSection.module.css';

const MARKER_ROWS = DEBUG_OVERLAY_ROWS.filter(
  (row) => 'section' in row && row.section === 'terrain-pick-marker',
);

export type TerrainPickMarkerTuningSectionProps = {
  readonly radiusM: number;
  readonly onRadiusChange: (radiusM: number) => void;
  readonly overlays: Record<DebugOverlayKey, boolean>;
  readonly onToggle: (key: DebugOverlayKey, enabled: boolean) => void;
  /** The body Layer's published fact: both null with the overlay off. */
  readonly readout: TerrainPickMarkerReadout;
};

function metres(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(2)} m`;
}

export function TerrainPickMarkerTuningSection({
  radiusM,
  onRadiusChange,
  overlays,
  onToggle,
  readout,
}: TerrainPickMarkerTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Terrain pick marker"
      fields={TERRAIN_PICK_MARKER_SLIDER_FIELDS}
      values={{ radiusLog10M: Math.log10(radiusM) }}
      onSliderChange={(_key, log10M) => onRadiusChange(10 ** log10M)}
    >
      <DebugOverlayToggles rows={MARKER_ROWS} overlays={overlays} onToggle={onToggle} />
      <div className={styles.readout}>terrain under pick: {metres(readout.heightM)}</div>
      <div className={styles.readout}>
        height level at eye: {readout.levelAtEye === null ? '—' : `z${readout.levelAtEye}`}
      </div>
    </DebugTuningSection>
  );
}
