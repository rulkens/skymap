/**
 * DensityFieldTuningRow — one registered cosmic-web density field's tuning
 * knobs in the DebugPanel: intensity, contrast, trim, density scale,
 * exposure and palette. The enable checkbox lives in the SettingsPanel's
 * main "Cosmic web density" section, not here — this row is power-user
 * tuning only, using `DebugSlider` to match the surrounding chrome.
 */

import type { ReactElement } from 'react';
import type { VolumeFieldRowData } from '../@types/VolumeFieldRowData';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import DebugSlider from '../../../components/DebugPanel/DebugSlider';
import { PaletteSelect } from '../../../components/common/PaletteSelect/PaletteSelect';
import styles from './DensityFieldTuningRow.module.css';

const INTENSITY_MIN = 0;
const INTENSITY_MAX = 1;
const INTENSITY_STEP = 0.01;
const CONTRAST_MIN = 0.25;
const CONTRAST_MAX = 4.0;
const CONTRAST_STEP = 0.05;
const TRIM_MIN = 0;
const TRIM_MAX = 0.95;
const TRIM_STEP = 0.01;
const EXPOSURE_MIN = 1;
const EXPOSURE_MAX = 32;
const EXPOSURE_STEP = 0.5;
const DENSITY_MIN = 0;
const DENSITY_MAX = 60;
const DENSITY_STEP = 0.1;

export type DensityFieldTuningRowProps = {
  row: VolumeFieldRowData;
  onChange: (id: CosmicWebDensityFieldId, patch: Partial<VolumeFieldSettings>) => void;
};

function DensityFieldTuningRow({ row, onChange }: DensityFieldTuningRowProps): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{row.label}</div>
      <DebugSlider
        label="Intensity"
        value={row.intensity}
        min={INTENSITY_MIN}
        max={INTENSITY_MAX}
        step={INTENSITY_STEP}
        readout={row.intensity.toFixed(2)}
        onChange={(v) => onChange(row.id, { intensity: v })}
      />
      <DebugSlider
        label="Contrast"
        value={row.contrast}
        min={CONTRAST_MIN}
        max={CONTRAST_MAX}
        step={CONTRAST_STEP}
        readout={row.contrast.toFixed(2)}
        onChange={(v) => onChange(row.id, { contrast: v })}
      />
      <DebugSlider
        label="Trim"
        value={row.trim}
        min={TRIM_MIN}
        max={TRIM_MAX}
        step={TRIM_STEP}
        readout={row.trim.toFixed(2)}
        onChange={(v) => onChange(row.id, { trim: v })}
      />
      <DebugSlider
        label="Density"
        value={row.densityScale}
        min={DENSITY_MIN}
        max={DENSITY_MAX}
        step={DENSITY_STEP}
        readout={row.densityScale.toFixed(1)}
        onChange={(v) => onChange(row.id, { densityScale: v })}
      />
      <DebugSlider
        label="Exposure"
        value={row.exposure}
        min={EXPOSURE_MIN}
        max={EXPOSURE_MAX}
        step={EXPOSURE_STEP}
        readout={row.exposure.toFixed(1)}
        onChange={(v) => onChange(row.id, { exposure: v })}
      />
      <div className={styles.paletteRow}>
        <span className={styles.paletteLabel}>Palette</span>
        <PaletteSelect
          value={row.paletteId}
          onChange={(paletteId) => onChange(row.id, { paletteId })}
        />
      </div>
    </div>
  );
}

export default DensityFieldTuningRow;
