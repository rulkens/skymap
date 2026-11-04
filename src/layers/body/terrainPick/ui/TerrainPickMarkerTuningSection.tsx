/**
 * The `terrain-pick-marker` overlay's own board: its toggle, the radius knob,
 * and the two numbers the marker exists to compare — what the CPU thinks the
 * ground is under the pick, and which pyramid level the height under the eye
 * came from (a shallow level is the tell for a CPU/GPU level disagreement, not
 * decimation). The board's rows are linear, so the LOG mapping happens right
 * here: the store holds metres, the slider carries log10(metres).
 */

import type { ReactElement } from 'react';
import type { TerrainPickMarkerReadout } from '../@types/TerrainPickMarkerReadout';
import { TERRAIN_PICK_MARKER_SLIDER_FIELDS } from '../data/terrainPickMarkerSliderFields';
import DebugOverlayToggles from '../../../../components/DebugPanel/DebugOverlayToggles';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import styles from './TerrainPickMarkerTuningSection.module.css';

const MARKER_ROWS = [{ key: 'enabled', label: 'Terrain pick marker' }] as const;

export type TerrainPickMarkerTuningSectionProps = {
  readonly radiusM: number;
  readonly onRadiusChange: (radiusM: number) => void;
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  /** The body Layer's published fact: both null with the overlay off. */
  readonly readout: TerrainPickMarkerReadout;
};

function metres(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(2)} m`;
}

export function TerrainPickMarkerTuningSection({
  radiusM,
  onRadiusChange,
  enabled,
  onEnabledChange,
  readout,
}: TerrainPickMarkerTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Terrain pick marker"
      fields={TERRAIN_PICK_MARKER_SLIDER_FIELDS}
      values={{ radiusLog10M: Math.log10(radiusM) }}
      onSliderChange={(_key, log10M) => onRadiusChange(10 ** log10M)}
    >
      <DebugOverlayToggles
        rows={MARKER_ROWS}
        overlays={{ enabled }}
        onToggle={(_key, on) => onEnabledChange(on)}
      />
      <div className={styles.readout}>terrain under pick: {metres(readout.heightM)}</div>
      <div className={styles.readout}>
        height level at eye: {readout.levelAtEye === null ? '—' : `z${readout.levelAtEye}`}
      </div>
    </DebugTuningSection>
  );
}
